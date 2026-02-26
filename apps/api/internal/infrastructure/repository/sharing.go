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

type SharingRepository = port.SharingRepository

type sharingRepository struct {
	db *gorm.DB
}

func NewSharingRepository(db *gorm.DB) SharingRepository {
	return &sharingRepository{db: db}
}

func (r *sharingRepository) CreateShareList(ctx context.Context, list *domain.ShareList) error {
	if list.ID == uuid.Nil {
		list.ID = uuid.New()
	}
	if list.Visibility == "" {
		list.Visibility = domain.VisibilityPrivate
	}
	return r.db.WithContext(ctx).Create(list).Error
}

func (r *sharingRepository) ListShareLists(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.ShareList, int64, error) {
	var (
		lists []domain.ShareList
		total int64
	)
	query := r.db.WithContext(ctx).Model(&domain.ShareList{}).Where("user_id = ?", userID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("updated_at DESC").Limit(limit).Offset(offset).Find(&lists).Error; err != nil {
		return nil, 0, err
	}
	return lists, total, nil
}

func (r *sharingRepository) GetShareListByID(ctx context.Context, userID, id uuid.UUID) (*domain.ShareList, error) {
	var list domain.ShareList
	if err := r.db.WithContext(ctx).First(&list, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &list, nil
}

func (r *sharingRepository) UpdateShareList(ctx context.Context, userID, id uuid.UUID, updates map[string]any) (*domain.ShareList, error) {
	updates["updated_at"] = time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&domain.ShareList{}).Where("id = ? AND user_id = ?", id, userID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return r.GetShareListByID(ctx, userID, id)
}

func (r *sharingRepository) CreateShareListItem(ctx context.Context, item *domain.ShareListItem) error {
	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(item).Error
}

func (r *sharingRepository) ListShareListItems(ctx context.Context, listID uuid.UUID) ([]domain.ShareListItem, error) {
	var items []domain.ShareListItem
	if err := r.db.WithContext(ctx).Where("list_id = ?", listID).Order("position ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (r *sharingRepository) GetBookSharePolicy(ctx context.Context, userID, userLibraryBookID uuid.UUID) (*domain.BookSharePolicy, error) {
	var policy domain.BookSharePolicy
	if err := r.db.WithContext(ctx).First(&policy, "user_id = ? AND user_library_book_id = ?", userID, userLibraryBookID).Error; err != nil {
		return nil, err
	}
	return &policy, nil
}

func (r *sharingRepository) UpsertBookSharePolicy(ctx context.Context, policy *domain.BookSharePolicy) (*domain.BookSharePolicy, error) {
	if policy.ID == uuid.Nil {
		policy.ID = uuid.New()
	}
	if policy.RawFileSharing == "" {
		policy.RawFileSharing = domain.RawFileSharingPrivate
	}

	var existing domain.BookSharePolicy
	err := r.db.WithContext(ctx).Where("user_id = ? AND user_library_book_id = ?", policy.UserID, policy.UserLibraryBookID).First(&existing).Error
	switch {
	case err == nil:
		updates := map[string]any{
			"raw_file_sharing":        policy.RawFileSharing,
			"allow_metadata_sharing":  policy.AllowMetadataSharing,
			"updated_at":              time.Now().UTC(),
		}
		if err := r.db.WithContext(ctx).Model(&existing).Updates(updates).Error; err != nil {
			return nil, err
		}
		return r.GetBookSharePolicy(ctx, policy.UserID, policy.UserLibraryBookID)
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := r.db.WithContext(ctx).Create(policy).Error; err != nil {
			return nil, err
		}
		return policy, nil
	default:
		return nil, err
	}
}

func (r *sharingRepository) CreateShareLink(ctx context.Context, link *domain.ShareLink) error {
	if link.ID == uuid.Nil {
		link.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(link).Error
}

func (r *sharingRepository) GetShareLinkByID(ctx context.Context, userID, id uuid.UUID) (*domain.ShareLink, error) {
	var link domain.ShareLink
	if err := r.db.WithContext(ctx).First(&link, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &link, nil
}

func (r *sharingRepository) GetShareLinkByToken(ctx context.Context, token string) (*domain.ShareLink, error) {
	var link domain.ShareLink
	if err := r.db.WithContext(ctx).First(&link, "token = ?", token).Error; err != nil {
		return nil, err
	}
	return &link, nil
}

func (r *sharingRepository) DeactivateShareLink(ctx context.Context, userID, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Model(&domain.ShareLink{}).Where("id = ? AND user_id = ?", id, userID).Updates(map[string]any{
		"is_active":  false,
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
