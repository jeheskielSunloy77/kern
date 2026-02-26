package application

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/zeile/internal/app/errs"
	"github.com/jeheskielSunloy77/zeile/internal/app/sqlerr"
	applicationdto "github.com/jeheskielSunloy77/zeile/internal/application/dto"
	"github.com/jeheskielSunloy77/zeile/internal/application/port"
	"github.com/jeheskielSunloy77/zeile/internal/domain"
)

type ModerationService interface {
	CreateReview(ctx context.Context, userID uuid.UUID, input applicationdto.CreateModerationReviewInput) (*domain.ModerationReview, error)
	ListReviews(ctx context.Context, status string, limit, offset int) ([]domain.ModerationReview, int64, error)
	DecideReview(ctx context.Context, reviewerUserID, reviewID uuid.UUID, input applicationdto.DecideModerationReviewInput) (*domain.ModerationReview, error)
}

type moderationService struct {
	repo        port.ModerationRepository
	libraryRepo port.LibraryRepository
}

func NewModerationService(repo port.ModerationRepository, libraryRepo port.LibraryRepository) ModerationService {
	return &moderationService{repo: repo, libraryRepo: libraryRepo}
}

func (s *moderationService) CreateReview(ctx context.Context, userID uuid.UUID, input applicationdto.CreateModerationReviewInput) (*domain.ModerationReview, error) {
	if _, err := s.libraryRepo.GetCatalogBookByID(ctx, input.CatalogBookID); err != nil {
		return nil, sqlerr.HandleError(err)
	}
	review := &domain.ModerationReview{
		CatalogBookID:     input.CatalogBookID,
		SubmittedByUserID: userID,
		Status:            domain.ModerationStatusPending,
		EvidenceJSON:      emptyJSONIfNil(input.EvidenceJSON),
	}
	if err := s.repo.CreateReview(ctx, review); err != nil {
		return nil, sqlerr.HandleError(err)
	}
	return review, nil
}

func (s *moderationService) ListReviews(ctx context.Context, status string, limit, offset int) ([]domain.ModerationReview, int64, error) {
	if status != "" {
		normalized := strings.TrimSpace(status)
		if normalized != domain.ModerationStatusPending && normalized != domain.ModerationStatusApproved && normalized != domain.ModerationStatusRejected {
			return nil, 0, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "status", Error: "must be pending, approved, or rejected"}}, nil)
		}
		status = normalized
	}
	limit, offset = normalizePagination(limit, offset)
	reviews, total, err := s.repo.ListReviews(ctx, status, limit, offset)
	if err != nil {
		return nil, 0, sqlerr.HandleError(err)
	}
	return reviews, total, nil
}

func (s *moderationService) DecideReview(ctx context.Context, reviewerUserID, reviewID uuid.UUID, input applicationdto.DecideModerationReviewInput) (*domain.ModerationReview, error) {
	decision := strings.TrimSpace(strings.ToLower(input.Decision))
	if decision != domain.ModerationStatusApproved && decision != domain.ModerationStatusRejected {
		return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "decision", Error: "must be approved or rejected"}}, nil)
	}
	status := decision

	review, err := s.repo.DecideReview(ctx, reviewID, reviewerUserID, status, decision)
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}

	verificationStatus := domain.VerificationStatusRejected
	if decision == domain.ModerationStatusApproved {
		verificationStatus = domain.VerificationStatusVerifiedPublicDomain
	}
	if _, err := s.libraryRepo.UpdateCatalogVerification(ctx, review.CatalogBookID, verificationStatus); err != nil {
		return nil, sqlerr.HandleError(err)
	}

	return review, nil
}
