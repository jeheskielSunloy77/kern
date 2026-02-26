package application

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/zeile/internal/app/sqlerr"
	applicationdto "github.com/jeheskielSunloy77/zeile/internal/application/dto"
	"github.com/jeheskielSunloy77/zeile/internal/application/port"
	"github.com/jeheskielSunloy77/zeile/internal/domain"
	"gorm.io/gorm"
)

type CommunityService interface {
	GetProfile(ctx context.Context, userID uuid.UUID) (*domain.CommunityProfile, error)
	UpdateMyProfile(ctx context.Context, userID uuid.UUID, input applicationdto.UpdateCommunityProfileInput) (*domain.CommunityProfile, error)
	ListActivity(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.ActivityEvent, int64, error)
}

type communityService struct {
	repo port.CommunityRepository
}

func NewCommunityService(repo port.CommunityRepository) CommunityService {
	return &communityService{repo: repo}
}

func (s *communityService) GetProfile(ctx context.Context, userID uuid.UUID) (*domain.CommunityProfile, error) {
	profile, err := s.repo.GetProfileByUserID(ctx, userID)
	if err == nil {
		return profile, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, sqlerr.HandleError(err)
	}
	created, createErr := s.repo.UpsertProfile(ctx, &domain.CommunityProfile{
		UserID:              userID,
		ShowReadingActivity: true,
		ShowHighlights:      true,
		ShowLists:           true,
	})
	if createErr != nil {
		return nil, sqlerr.HandleError(createErr)
	}
	return created, nil
}

func (s *communityService) UpdateMyProfile(ctx context.Context, userID uuid.UUID, input applicationdto.UpdateCommunityProfileInput) (*domain.CommunityProfile, error) {
	profile, err := s.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}

	if input.DisplayName != nil {
		profile.DisplayName = input.DisplayName
	}
	if input.Bio != nil {
		profile.Bio = input.Bio
	}
	if input.AvatarURL != nil {
		profile.AvatarURL = input.AvatarURL
	}
	if input.ShowReadingActivity != nil {
		profile.ShowReadingActivity = *input.ShowReadingActivity
	}
	if input.ShowHighlights != nil {
		profile.ShowHighlights = *input.ShowHighlights
	}
	if input.ShowLists != nil {
		profile.ShowLists = *input.ShowLists
	}

	updated, err := s.repo.UpsertProfile(ctx, profile)
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}
	return updated, nil
}

func (s *communityService) ListActivity(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.ActivityEvent, int64, error) {
	limit, offset = normalizePagination(limit, offset)
	events, total, err := s.repo.ListActivityEvents(ctx, userID, limit, offset)
	if err != nil {
		return nil, 0, sqlerr.HandleError(err)
	}
	return events, total, nil
}
