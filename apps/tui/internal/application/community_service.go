package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jeheskielSunloy77/kern/tui/internal/infrastructure/remote"
	"github.com/jeheskielSunloy77/kern/tui/internal/infrastructure/repository"
)

type CommunityService struct {
	auth   *AuthService
	links  SyncBookLinkRepository
	remote *remote.Client
}

type LibrarySharingSummary struct {
	IsPublic   bool
	CanPublish bool
}

func NewCommunityService(auth *AuthService, links SyncBookLinkRepository, remoteClient *remote.Client) *CommunityService {
	return &CommunityService{
		auth:   auth,
		links:  links,
		remote: remoteClient,
	}
}

func (s *CommunityService) Enabled() bool {
	return s != nil && s.auth != nil && s.remote != nil && s.auth.IsConnected() && s.remote.Enabled()
}

func (s *CommunityService) ListBooks(ctx context.Context, query string, limit, offset int) ([]remote.CommunityBook, int, error) {
	accessToken, err := s.accessToken()
	if err != nil {
		return nil, 0, err
	}
	return s.remote.ListCommunityBooks(ctx, accessToken, query, limit, offset)
}

func (s *CommunityService) GetBook(ctx context.Context, libraryBookID string) (remote.CommunityBook, error) {
	accessToken, err := s.accessToken()
	if err != nil {
		return remote.CommunityBook{}, err
	}
	return s.remote.GetCommunityBook(ctx, accessToken, libraryBookID)
}

func (s *CommunityService) SaveBook(ctx context.Context, libraryBookID string) (remote.UserLibraryBook, error) {
	accessToken, err := s.accessToken()
	if err != nil {
		return remote.UserLibraryBook{}, err
	}
	return s.remote.SaveCommunityBook(ctx, accessToken, libraryBookID)
}

func (s *CommunityService) LoadLibraryVisibility(ctx context.Context) (map[string]LibrarySharingSummary, error) {
	accessToken, err := s.accessToken()
	if err != nil {
		return nil, err
	}
	if s.links == nil {
		return nil, fmt.Errorf("sync link repository unavailable")
	}

	remoteBooks, err := s.remote.ListLibraryBooks(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	links, err := s.links.ListBookLinks(ctx)
	if err != nil {
		return nil, err
	}

	visibilityByRemoteID := make(map[string]LibrarySharingSummary, len(remoteBooks))
	for _, book := range remoteBooks {
		canPublish := book.PreferredAssetID != nil && strings.TrimSpace(*book.PreferredAssetID) != ""
		visibilityByRemoteID[strings.TrimSpace(book.ID)] = LibrarySharingSummary{
			IsPublic:   book.IsPublic,
			CanPublish: canPublish,
		}
	}

	visibilityByLocalID := make(map[string]LibrarySharingSummary, len(links))
	for _, link := range links {
		remoteID := strings.TrimSpace(link.RemoteLibraryBookID)
		if remoteID == "" {
			continue
		}
		if summary, ok := visibilityByRemoteID[remoteID]; ok {
			visibilityByLocalID[link.LocalBookID] = summary
		}
	}
	return visibilityByLocalID, nil
}

func (s *CommunityService) ToggleLibraryBookVisibility(ctx context.Context, localBookID string, nextPublic bool) (bool, error) {
	accessToken, err := s.accessToken()
	if err != nil {
		return false, err
	}
	if s.links == nil {
		return false, fmt.Errorf("sync link repository unavailable")
	}

	link, err := s.links.GetByLocalBookID(ctx, localBookID)
	if err != nil {
		if err == repository.ErrNotFound {
			return false, fmt.Errorf("book must be synced before changing visibility")
		}
		return false, err
	}

	updated, err := s.remote.UpdateLibraryBookVisibility(ctx, accessToken, link.RemoteLibraryBookID, nextPublic)
	if err != nil {
		return false, err
	}
	return updated.IsPublic, nil
}

func (s *CommunityService) accessToken() (string, error) {
	if s == nil || s.auth == nil || s.remote == nil || !s.remote.Enabled() {
		return "", fmt.Errorf("remote API is not configured")
	}

	session, ok := s.auth.Session()
	if !ok {
		return "", fmt.Errorf("not connected")
	}
	if strings.TrimSpace(session.AccessToken) == "" || !session.AccessExpiresAt.After(time.Now().UTC()) {
		return "", fmt.Errorf("session expired")
	}
	return session.AccessToken, nil
}
