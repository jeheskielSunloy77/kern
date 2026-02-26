package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/zeile/internal/application/port"
	"github.com/jeheskielSunloy77/zeile/internal/domain"
	"gorm.io/gorm"
)

type ModerationRepository = port.ModerationRepository

type moderationRepository struct {
	db *gorm.DB
}

func NewModerationRepository(db *gorm.DB) ModerationRepository {
	return &moderationRepository{db: db}
}

func (r *moderationRepository) CreateReview(ctx context.Context, review *domain.ModerationReview) error {
	if review.ID == uuid.Nil {
		review.ID = uuid.New()
	}
	if len(review.EvidenceJSON) == 0 {
		review.EvidenceJSON = []byte("{}")
	}
	if review.Status == "" {
		review.Status = domain.ModerationStatusPending
	}
	return r.db.WithContext(ctx).Create(review).Error
}

func (r *moderationRepository) GetReviewByID(ctx context.Context, id uuid.UUID) (*domain.ModerationReview, error) {
	var review domain.ModerationReview
	if err := r.db.WithContext(ctx).First(&review, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &review, nil
}

func (r *moderationRepository) ListReviews(ctx context.Context, status string, limit, offset int) ([]domain.ModerationReview, int64, error) {
	var (
		reviews []domain.ModerationReview
		total   int64
	)
	query := r.db.WithContext(ctx).Model(&domain.ModerationReview{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&reviews).Error; err != nil {
		return nil, 0, err
	}
	return reviews, total, nil
}

func (r *moderationRepository) DecideReview(ctx context.Context, id, reviewerUserID uuid.UUID, status, decision string) (*domain.ModerationReview, error) {
	now := time.Now().UTC()
	updates := map[string]any{
		"status":           status,
		"decision":         decision,
		"reviewer_user_id": reviewerUserID,
		"reviewed_at":      now,
		"updated_at":       now,
	}
	result := r.db.WithContext(ctx).Model(&domain.ModerationReview{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return r.GetReviewByID(ctx, id)
}
