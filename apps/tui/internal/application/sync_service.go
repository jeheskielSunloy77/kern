package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jeheskielSunloy77/kern/tui/internal/domain"
	"github.com/jeheskielSunloy77/kern/tui/internal/infrastructure/remote"
	"github.com/jeheskielSunloy77/kern/tui/internal/infrastructure/repository"
)

type SyncResult struct {
	SyncedBooks     int
	SyncedStates    int
	SkippedBooks    int
	UploadedFiles   int
	UploadFailures  int
	LastUploadError string
}

type SyncRemoteClient interface {
	CreateCatalogBook(ctx context.Context, accessToken, title, authors string) (remote.BookCatalog, error)
	UpsertLibraryBook(ctx context.Context, accessToken, catalogBookID string) (remote.UserLibraryBook, error)
	ListLibraryBooks(ctx context.Context, accessToken string) ([]remote.UserLibraryBook, error)
	UploadBookAsset(ctx context.Context, accessToken, catalogBookID, filePath string) (remote.BookAsset, error)
	UpdateLibraryBookPreferredAsset(ctx context.Context, accessToken, libraryBookID, preferredAssetID string) (remote.UserLibraryBook, error)
	UpsertReadingState(ctx context.Context, accessToken, libraryBookID, mode string, locator map[string]any, progressPercent float64) error
}

type SyncService struct {
	auth     *AuthService
	library  SyncLibraryService
	accounts SyncAccountRepository
	links    SyncBookLinkRepository
	remote   SyncRemoteClient

	mu sync.Mutex
}

type SyncLibraryService interface {
	ListBooks(ctx context.Context) ([]domain.Book, error)
	StatesForBook(ctx context.Context, bookID string) ([]domain.ReadingState, error)
}

func NewSyncService(
	auth *AuthService,
	library SyncLibraryService,
	accounts SyncAccountRepository,
	links SyncBookLinkRepository,
	remoteClient SyncRemoteClient,
) *SyncService {
	return &SyncService{
		auth:     auth,
		library:  library,
		accounts: accounts,
		links:    links,
		remote:   remoteClient,
	}
}

func (s *SyncService) ReconcileNow(ctx context.Context) (SyncResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s == nil || s.auth == nil || s.library == nil || s.links == nil || s.remote == nil {
		return SyncResult{}, errors.New("sync service is not configured")
	}

	session, ok := s.auth.Session()
	if !ok || strings.TrimSpace(session.AccessToken) == "" {
		return SyncResult{}, errors.New("not connected")
	}
	if !session.AccessExpiresAt.After(time.Now().UTC()) {
		return SyncResult{}, errors.New("session expired")
	}

	books, err := s.library.ListBooks(ctx)
	if err != nil {
		return SyncResult{}, fmt.Errorf("list local books: %w", err)
	}

	result := SyncResult{}
	accessToken := session.AccessToken
	remoteLibraryBooks, err := s.remote.ListLibraryBooks(ctx, accessToken)
	if err != nil {
		return result, fmt.Errorf("list remote library books: %w", err)
	}
	remoteLibraryBooksByID := make(map[string]remote.UserLibraryBook, len(remoteLibraryBooks))
	for _, remoteBook := range remoteLibraryBooks {
		remoteLibraryBooksByID[remoteBook.ID] = remoteBook
	}

	for _, book := range books {
		link, err := s.links.GetByLocalBookID(ctx, book.ID)
		switch {
		case err == nil:
			remoteBook, ok := remoteLibraryBooksByID[link.RemoteLibraryBookID]
			if !ok {
				remoteBook, err = s.remote.UpsertLibraryBook(ctx, accessToken, link.RemoteCatalogBookID)
				if err != nil {
					return result, fmt.Errorf("restore remote library book for %q: %w", book.Title, err)
				}
			}
			if uploaded, uploadErr := s.ensureRemoteAsset(ctx, accessToken, book, remoteBook); uploadErr != nil {
				result.UploadFailures++
				result.LastUploadError = uploadErr.Error()
			} else if uploaded {
				result.UploadedFiles++
			}
			pushedStates, pushErr := s.pushReadingStates(ctx, accessToken, book.ID, link.RemoteLibraryBookID)
			if pushErr != nil {
				return result, pushErr
			}
			result.SkippedBooks++
			result.SyncedStates += pushedStates
			continue
		case errors.Is(err, repository.ErrNotFound):
			// Continue with first-time reconciliation.
		default:
			return result, fmt.Errorf("get sync link for %s: %w", book.ID, err)
		}

		catalog, err := s.remote.CreateCatalogBook(ctx, accessToken, book.Title, book.Author)
		if err != nil {
			return result, fmt.Errorf("create catalog entry for %q: %w", book.Title, err)
		}

		libraryBook, err := s.remote.UpsertLibraryBook(ctx, accessToken, catalog.ID)
		if err != nil {
			return result, fmt.Errorf("upsert remote library book for %q: %w", book.Title, err)
		}

		now := time.Now().UTC()
		if err := s.links.UpsertBookLink(ctx, domain.SyncBookLink{
			LocalBookID:         book.ID,
			LocalFingerprint:    book.Fingerprint,
			RemoteCatalogBookID: catalog.ID,
			RemoteLibraryBookID: libraryBook.ID,
			UpdatedAt:           now,
		}); err != nil {
			return result, fmt.Errorf("persist sync link for %q: %w", book.Title, err)
		}

		if uploaded, uploadErr := s.ensureRemoteAsset(ctx, accessToken, book, libraryBook); uploadErr != nil {
			result.UploadFailures++
			result.LastUploadError = uploadErr.Error()
		} else if uploaded {
			result.UploadedFiles++
		}

		pushedStates, pushErr := s.pushReadingStates(ctx, accessToken, book.ID, libraryBook.ID)
		if pushErr != nil {
			return result, pushErr
		}

		result.SyncedBooks++
		result.SyncedStates += pushedStates
	}

	if s.accounts != nil {
		now := time.Now().UTC()
		if err := s.accounts.Upsert(ctx, domain.SyncAccount{
			UserID:           session.User.ID,
			Email:            session.User.Email,
			Username:         session.User.Username,
			LastReconciledAt: &now,
			UpdatedAt:        now,
		}); err != nil {
			return result, fmt.Errorf("upsert sync account: %w", err)
		}
	}

	return result, nil
}

func (s *SyncService) ensureRemoteAsset(ctx context.Context, accessToken string, book domain.Book, libraryBook remote.UserLibraryBook) (bool, error) {
	if libraryBook.PreferredAssetID != nil && strings.TrimSpace(*libraryBook.PreferredAssetID) != "" {
		return false, nil
	}

	filePath, err := localSyncFilePath(book)
	if err != nil {
		return false, fmt.Errorf("prepare upload for %q: %w", book.Title, err)
	}

	asset, err := s.remote.UploadBookAsset(ctx, accessToken, libraryBook.CatalogBookID, filePath)
	if err != nil {
		return false, fmt.Errorf("upload file for %q: %w", book.Title, err)
	}

	targetLibraryBookID := libraryBook.ID
	if strings.TrimSpace(libraryBook.ID) != "" {
		targetLibraryBookID = libraryBook.ID
	}
	if _, err := s.remote.UpdateLibraryBookPreferredAsset(ctx, accessToken, targetLibraryBookID, asset.ID); err != nil {
		return false, fmt.Errorf("attach uploaded file for %q: %w", book.Title, err)
	}
	return true, nil
}

func localSyncFilePath(book domain.Book) (string, error) {
	candidates := []string{
		strings.TrimSpace(book.ManagedPath),
		strings.TrimSpace(book.SourcePath),
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		info, err := os.Stat(candidate)
		if err != nil {
			continue
		}
		if info.IsDir() {
			continue
		}
		return filepath.Clean(candidate), nil
	}
	return "", fmt.Errorf("local file not found")
}

func (s *SyncService) pushReadingStates(ctx context.Context, accessToken, localBookID, remoteLibraryBookID string) (int, error) {
	states, err := s.library.StatesForBook(ctx, localBookID)
	if err != nil {
		return 0, fmt.Errorf("list reading states for %s: %w", localBookID, err)
	}
	if len(states) == 0 {
		return 0, nil
	}

	pushed := 0
	for _, state := range states {
		locator, err := locatorToMap(state.Locator)
		if err != nil {
			return pushed, fmt.Errorf("serialize locator for book %s mode %s: %w", localBookID, state.Mode, err)
		}
		if err := s.remote.UpsertReadingState(
			ctx,
			accessToken,
			remoteLibraryBookID,
			string(state.Mode),
			locator,
			state.ProgressPercent,
		); err != nil {
			return pushed, fmt.Errorf("upsert reading state for book %s mode %s: %w", localBookID, state.Mode, err)
		}
		pushed++
	}
	return pushed, nil
}

func locatorToMap(locator domain.Locator) (map[string]any, error) {
	encoded, err := json.Marshal(locator)
	if err != nil {
		return nil, err
	}

	decoded := make(map[string]any)
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}
