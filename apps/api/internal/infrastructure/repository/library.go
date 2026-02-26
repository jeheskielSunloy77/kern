package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/zeile/internal/application/port"
	"github.com/jeheskielSunloy77/zeile/internal/domain"
	"gorm.io/gorm"
)

type LibraryRepository = port.LibraryRepository

type libraryRepository struct {
	db *gorm.DB
}

func NewLibraryRepository(db *gorm.DB) LibraryRepository {
	return &libraryRepository{db: db}
}

func (r *libraryRepository) CreateCatalogBook(ctx context.Context, book *domain.BookCatalog) error {
	if book.ID == uuid.Nil {
		book.ID = uuid.New()
	}
	if len(book.Identifiers) == 0 {
		book.Identifiers = []byte("{}")
	}
	if book.VerificationStatus == "" {
		book.VerificationStatus = domain.VerificationStatusPending
	}
	if book.SourceType == "" {
		book.SourceType = "user_upload"
	}
	return r.db.WithContext(ctx).Create(book).Error
}

func (r *libraryRepository) ListCatalogBooks(ctx context.Context, limit, offset int) ([]domain.BookCatalog, int64, error) {
	var (
		books []domain.BookCatalog
		total int64
	)

	query := r.db.WithContext(ctx).Model(&domain.BookCatalog{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&books).Error; err != nil {
		return nil, 0, err
	}

	return books, total, nil
}

func (r *libraryRepository) GetCatalogBookByID(ctx context.Context, id uuid.UUID) (*domain.BookCatalog, error) {
	var book domain.BookCatalog
	if err := r.db.WithContext(ctx).First(&book, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &book, nil
}

func (r *libraryRepository) UpdateCatalogVerification(ctx context.Context, id uuid.UUID, status string) (*domain.BookCatalog, error) {
	updates := map[string]any{
		"verification_status": status,
		"updated_at":          time.Now().UTC(),
	}
	if err := r.db.WithContext(ctx).Model(&domain.BookCatalog{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return r.GetCatalogBookByID(ctx, id)
}

func (r *libraryRepository) CreateBookAsset(ctx context.Context, asset *domain.BookAsset) error {
	if asset.ID == uuid.Nil {
		asset.ID = uuid.New()
	}
	if asset.IngestStatus == "" {
		asset.IngestStatus = domain.BookAssetIngestStatusPending
	}
	return r.db.WithContext(ctx).Create(asset).Error
}

func (r *libraryRepository) GetBookAssetByID(ctx context.Context, id uuid.UUID) (*domain.BookAsset, error) {
	var asset domain.BookAsset
	if err := r.db.WithContext(ctx).First(&asset, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &asset, nil
}

func (r *libraryRepository) UpsertUserLibraryBook(ctx context.Context, book *domain.UserLibraryBook) (*domain.UserLibraryBook, error) {
	if book.ID == uuid.Nil {
		book.ID = uuid.New()
	}
	if book.State == "" {
		book.State = domain.UserLibraryBookStateActive
	}
	var existing domain.UserLibraryBook
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND catalog_book_id = ?", book.UserID, book.CatalogBookID).
		First(&existing).Error
	switch {
	case err == nil:
		updates := map[string]any{
			"preferred_asset_id":    book.PreferredAssetID,
			"state":                 book.State,
			"visibility_in_profile": book.VisibilityInProfile,
			"updated_at":            time.Now().UTC(),
		}
		if book.ArchivedAt != nil {
			updates["archived_at"] = book.ArchivedAt
		}
		if err := r.db.WithContext(ctx).Model(&existing).Updates(updates).Error; err != nil {
			return nil, err
		}
		return r.GetUserLibraryBookByID(ctx, book.UserID, existing.ID)
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := r.db.WithContext(ctx).Create(book).Error; err != nil {
			return nil, err
		}
		return book, nil
	default:
		return nil, err
	}
}

func (r *libraryRepository) GetUserLibraryBookByID(ctx context.Context, userID, id uuid.UUID) (*domain.UserLibraryBook, error) {
	var book domain.UserLibraryBook
	if err := r.db.WithContext(ctx).First(&book, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &book, nil
}

func (r *libraryRepository) ListUserLibraryBooks(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.UserLibraryBook, int64, error) {
	var (
		books []domain.UserLibraryBook
		total int64
	)
	query := r.db.WithContext(ctx).Model(&domain.UserLibraryBook{}).Where("user_id = ?", userID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("added_at DESC").Limit(limit).Offset(offset).Find(&books).Error; err != nil {
		return nil, 0, err
	}
	return books, total, nil
}

func (r *libraryRepository) UpdateUserLibraryBook(ctx context.Context, userID, id uuid.UUID, updates map[string]any) (*domain.UserLibraryBook, error) {
	updates["updated_at"] = time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&domain.UserLibraryBook{}).Where("id = ? AND user_id = ?", id, userID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return r.GetUserLibraryBookByID(ctx, userID, id)
}

func (r *libraryRepository) DeleteUserLibraryBook(ctx context.Context, userID, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", id, userID).Delete(&domain.UserLibraryBook{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *libraryRepository) UpsertReadingState(ctx context.Context, state *domain.ReadingState, expectedVersion *int64) (*domain.ReadingState, error) {
	if len(state.LocatorJSON) == 0 {
		state.LocatorJSON = []byte("{}")
	}

	var existing domain.ReadingState
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND user_library_book_id = ? AND mode = ?", state.UserID, state.UserLibraryBookID, state.Mode).
		First(&existing).Error
	switch {
	case err == nil:
		if expectedVersion != nil && existing.Version != *expectedVersion {
			return nil, port.ErrVersionConflict
		}
		updates := map[string]any{
			"locator_json":     state.LocatorJSON,
			"progress_percent": state.ProgressPercent,
			"version":          existing.Version + 1,
			"updated_at":       time.Now().UTC(),
		}
		if err := r.db.WithContext(ctx).Model(&existing).Updates(updates).Error; err != nil {
			return nil, err
		}
		return r.GetReadingState(ctx, state.UserID, state.UserLibraryBookID, state.Mode)
	case errors.Is(err, gorm.ErrRecordNotFound):
		if state.ID == uuid.Nil {
			state.ID = uuid.New()
		}
		if state.Version <= 0 {
			state.Version = 1
		}
		if err := r.db.WithContext(ctx).Create(state).Error; err != nil {
			return nil, err
		}
		return state, nil
	default:
		return nil, err
	}
}

func (r *libraryRepository) GetReadingState(ctx context.Context, userID, userLibraryBookID uuid.UUID, mode string) (*domain.ReadingState, error) {
	var state domain.ReadingState
	if err := r.db.WithContext(ctx).
		First(&state, "user_id = ? AND user_library_book_id = ? AND mode = ?", userID, userLibraryBookID, mode).Error; err != nil {
		return nil, err
	}
	return &state, nil
}

func (r *libraryRepository) CreateHighlight(ctx context.Context, highlight *domain.Highlight) error {
	if highlight.ID == uuid.Nil {
		highlight.ID = uuid.New()
	}
	if len(highlight.LocatorJSON) == 0 {
		highlight.LocatorJSON = []byte("{}")
	}
	if highlight.Visibility == "" {
		highlight.Visibility = domain.VisibilityPrivate
	}
	return r.db.WithContext(ctx).Create(highlight).Error
}

func (r *libraryRepository) ListHighlights(ctx context.Context, userID, userLibraryBookID uuid.UUID) ([]domain.Highlight, error) {
	var highlights []domain.Highlight
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND user_library_book_id = ? AND is_deleted = ?", userID, userLibraryBookID, false).
		Order("created_at DESC").
		Find(&highlights).Error
	if err != nil {
		return nil, err
	}
	return highlights, nil
}

func (r *libraryRepository) GetHighlightByID(ctx context.Context, userID, id uuid.UUID) (*domain.Highlight, error) {
	var highlight domain.Highlight
	if err := r.db.WithContext(ctx).First(&highlight, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &highlight, nil
}

func (r *libraryRepository) UpdateHighlight(ctx context.Context, userID, id uuid.UUID, updates map[string]any) (*domain.Highlight, error) {
	updates["updated_at"] = time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&domain.Highlight{}).Where("id = ? AND user_id = ?", id, userID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return r.GetHighlightByID(ctx, userID, id)
}

func (r *libraryRepository) DeleteHighlight(ctx context.Context, userID, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Model(&domain.Highlight{}).Where("id = ? AND user_id = ?", id, userID).Updates(map[string]any{
		"is_deleted": true,
		"updated_at": time.Now().UTC(),
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *libraryRepository) GetIdempotencyKey(ctx context.Context, userID uuid.UUID, operation, key string) (*domain.IdempotencyKey, error) {
	var rec domain.IdempotencyKey
	if err := r.db.WithContext(ctx).First(&rec, "user_id = ? AND operation = ? AND key = ?", userID, operation, key).Error; err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *libraryRepository) CreateIdempotencyKey(ctx context.Context, idempotency *domain.IdempotencyKey) error {
	if idempotency.ID == uuid.Nil {
		idempotency.ID = uuid.New()
	}
	if len(idempotency.ResponseJSON) == 0 {
		idempotency.ResponseJSON = []byte("{}")
	}
	return r.db.WithContext(ctx).Create(idempotency).Error
}
