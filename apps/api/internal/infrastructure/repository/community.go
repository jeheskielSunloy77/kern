package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/kern/internal/application/port"
	"github.com/jeheskielSunloy77/kern/internal/domain"
	"gorm.io/gorm"
)

type CommunityRepository = port.CommunityRepository

type communityRepository struct {
	db *gorm.DB
}

func NewCommunityRepository(db *gorm.DB) CommunityRepository {
	return &communityRepository{db: db}
}

func (r *communityRepository) GetProfileByUserID(ctx context.Context, userID uuid.UUID) (*domain.CommunityProfile, error) {
	var profile domain.CommunityProfile
	if err := r.db.WithContext(ctx).First(&profile, "user_id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *communityRepository) UpsertProfile(ctx context.Context, profile *domain.CommunityProfile) (*domain.CommunityProfile, error) {
	if profile.UserID == uuid.Nil {
		return nil, gorm.ErrRecordNotFound
	}

	var existing domain.CommunityProfile
	err := r.db.WithContext(ctx).First(&existing, "user_id = ?", profile.UserID).Error
	switch {
	case err == nil:
		updates := map[string]any{
			"display_name":          profile.DisplayName,
			"bio":                   profile.Bio,
			"avatar_url":            profile.AvatarURL,
			"show_reading_activity": profile.ShowReadingActivity,
			"show_highlights":       profile.ShowHighlights,
			"show_lists":            profile.ShowLists,
			"updated_at":            time.Now().UTC(),
		}
		if err := r.db.WithContext(ctx).Model(&existing).Updates(updates).Error; err != nil {
			return nil, err
		}
		return r.GetProfileByUserID(ctx, profile.UserID)
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := r.db.WithContext(ctx).Create(profile).Error; err != nil {
			return nil, err
		}
		return profile, nil
	default:
		return nil, err
	}
}

func (r *communityRepository) CreateActivityEvent(ctx context.Context, event *domain.ActivityEvent) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if len(event.PayloadJSON) == 0 {
		event.PayloadJSON = []byte("{}")
	}
	if event.Visibility == "" {
		event.Visibility = domain.VisibilityAuthenticated
	}
	return r.db.WithContext(ctx).Create(event).Error
}

func (r *communityRepository) ListActivityEvents(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.ActivityEvent, int64, error) {
	var (
		events []domain.ActivityEvent
		total  int64
	)
	query := r.db.WithContext(ctx).Model(&domain.ActivityEvent{}).Where("user_id = ?", userID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&events).Error; err != nil {
		return nil, 0, err
	}
	return events, total, nil
}
