package application

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/kern/internal/app/errs"
	"github.com/jeheskielSunloy77/kern/internal/app/sqlerr"
	applicationdto "github.com/jeheskielSunloy77/kern/internal/application/dto"
	"github.com/jeheskielSunloy77/kern/internal/application/port"
	"github.com/jeheskielSunloy77/kern/internal/domain"
	"gorm.io/gorm"
)

type ResolvedShareResource struct {
	ResourceType string                  `json:"resourceType"`
	Link         *domain.ShareLink       `json:"link"`
	ShareList    *domain.ShareList       `json:"shareList,omitempty"`
	Highlight    *domain.Highlight       `json:"highlight,omitempty"`
	LibraryBook  *domain.UserLibraryBook `json:"libraryBook,omitempty"`
	BookAsset    *domain.BookAsset       `json:"bookAsset,omitempty"`
}

type SharingService interface {
	CreateShareList(ctx context.Context, userID uuid.UUID, input applicationdto.CreateShareListInput) (*domain.ShareList, error)
	ListShareLists(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.ShareList, int64, error)
	UpdateShareList(ctx context.Context, userID, listID uuid.UUID, input applicationdto.UpdateShareListInput) (*domain.ShareList, error)

	CreateShareListItem(ctx context.Context, userID, listID uuid.UUID, input applicationdto.CreateShareListItemInput) (*domain.ShareListItem, error)
	ListShareListItems(ctx context.Context, userID, listID uuid.UUID) ([]domain.ShareListItem, error)

	UpsertBookSharePolicy(ctx context.Context, userID uuid.UUID, input applicationdto.UpsertBookSharePolicyInput) (*domain.BookSharePolicy, error)
	CreateShareLink(ctx context.Context, userID uuid.UUID, input applicationdto.CreateShareLinkInput, idempotencyKey string) (*domain.ShareLink, error)
	RevokeShareLink(ctx context.Context, userID, linkID uuid.UUID) error
	ResolveShareLink(ctx context.Context, token string) (*ResolvedShareResource, error)
}

type sharingService struct {
	sharingRepo   port.SharingRepository
	libraryRepo   port.LibraryRepository
	communityRepo port.CommunityRepository
}

func NewSharingService(sharingRepo port.SharingRepository, libraryRepo port.LibraryRepository, communityRepo port.CommunityRepository) SharingService {
	return &sharingService{
		sharingRepo:   sharingRepo,
		libraryRepo:   libraryRepo,
		communityRepo: communityRepo,
	}
}

func (s *sharingService) CreateShareList(ctx context.Context, userID uuid.UUID, input applicationdto.CreateShareListInput) (*domain.ShareList, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "name", Error: "is required"}}, nil)
	}
	visibility := domain.VisibilityPrivate
	if input.Visibility != nil {
		visibility = strings.TrimSpace(*input.Visibility)
	}
	if visibility != domain.VisibilityPrivate && visibility != domain.VisibilityAuthenticated {
		return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "visibility", Error: "must be private or authenticated"}}, nil)
	}

	list := &domain.ShareList{
		UserID:      userID,
		Name:        strings.TrimSpace(input.Name),
		Description: input.Description,
		Visibility:  visibility,
		IsPublished: false,
	}
	if err := s.sharingRepo.CreateShareList(ctx, list); err != nil {
		return nil, sqlerr.HandleError(err)
	}
	return list, nil
}

func (s *sharingService) ListShareLists(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.ShareList, int64, error) {
	limit, offset = normalizePagination(limit, offset)
	lists, total, err := s.sharingRepo.ListShareLists(ctx, userID, limit, offset)
	if err != nil {
		return nil, 0, sqlerr.HandleError(err)
	}
	return lists, total, nil
}

func (s *sharingService) UpdateShareList(ctx context.Context, userID, listID uuid.UUID, input applicationdto.UpdateShareListInput) (*domain.ShareList, error) {
	updates := make(map[string]any)
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "name", Error: "cannot be empty"}}, nil)
		}
		updates["name"] = name
	}
	if input.Description != nil {
		updates["description"] = input.Description
	}
	if input.Visibility != nil {
		visibility := strings.TrimSpace(*input.Visibility)
		if visibility != domain.VisibilityPrivate && visibility != domain.VisibilityAuthenticated {
			return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "visibility", Error: "must be private or authenticated"}}, nil)
		}
		updates["visibility"] = visibility
	}
	if input.IsPublished != nil {
		updates["is_published"] = *input.IsPublished
		if *input.IsPublished {
			now := time.Now().UTC()
			updates["published_at"] = &now
		} else {
			updates["published_at"] = nil
		}
	}
	if len(updates) == 0 {
		return s.sharingRepo.GetShareListByID(ctx, userID, listID)
	}
	list, err := s.sharingRepo.UpdateShareList(ctx, userID, listID, updates)
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}
	if input.IsPublished != nil && *input.IsPublished {
		s.trackActivity(ctx, &domain.ActivityEvent{
			UserID:       userID,
			EventType:    "share_list_published",
			ResourceType: "share_list",
			ResourceID:   &list.ID,
			Visibility:   domain.VisibilityAuthenticated,
		})
	}
	return list, nil
}

func (s *sharingService) CreateShareListItem(ctx context.Context, userID, listID uuid.UUID, input applicationdto.CreateShareListItemInput) (*domain.ShareListItem, error) {
	if _, err := s.sharingRepo.GetShareListByID(ctx, userID, listID); err != nil {
		return nil, sqlerr.HandleError(err)
	}

	itemType := strings.TrimSpace(input.ItemType)
	item := &domain.ShareListItem{
		ListID:   listID,
		ItemType: itemType,
		Position: input.Position,
	}
	switch itemType {
	case "book":
		if input.UserLibraryBookID == nil {
			return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "userLibraryBookId", Error: "is required for itemType=book"}}, nil)
		}
		if _, err := s.libraryRepo.GetUserLibraryBookByID(ctx, userID, *input.UserLibraryBookID); err != nil {
			return nil, sqlerr.HandleError(err)
		}
		item.UserLibraryBookID = input.UserLibraryBookID
	case "highlight":
		if input.HighlightID == nil {
			return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "highlightId", Error: "is required for itemType=highlight"}}, nil)
		}
		if _, err := s.libraryRepo.GetHighlightByID(ctx, userID, *input.HighlightID); err != nil {
			return nil, sqlerr.HandleError(err)
		}
		item.HighlightID = input.HighlightID
	default:
		return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "itemType", Error: "must be book or highlight"}}, nil)
	}

	if err := s.sharingRepo.CreateShareListItem(ctx, item); err != nil {
		return nil, sqlerr.HandleError(err)
	}
	return item, nil
}

func (s *sharingService) ListShareListItems(ctx context.Context, userID, listID uuid.UUID) ([]domain.ShareListItem, error) {
	if _, err := s.sharingRepo.GetShareListByID(ctx, userID, listID); err != nil {
		return nil, sqlerr.HandleError(err)
	}
	items, err := s.sharingRepo.ListShareListItems(ctx, listID)
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}
	return items, nil
}

func (s *sharingService) UpsertBookSharePolicy(ctx context.Context, userID uuid.UUID, input applicationdto.UpsertBookSharePolicyInput) (*domain.BookSharePolicy, error) {
	libraryBook, err := s.libraryRepo.GetUserLibraryBookByID(ctx, userID, input.UserLibraryBookID)
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}

	rawSharing := strings.TrimSpace(input.RawFileSharing)
	if rawSharing != domain.RawFileSharingPrivate && rawSharing != domain.RawFileSharingPublicLink {
		return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "rawFileSharing", Error: "must be private or public_link"}}, nil)
	}

	if rawSharing == domain.RawFileSharingPublicLink {
		catalog, err := s.libraryRepo.GetCatalogBookByID(ctx, libraryBook.CatalogBookID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		if catalog.VerificationStatus != domain.VerificationStatusVerifiedPublicDomain {
			return nil, errs.NewBadRequestError("verification_required", true, nil, nil)
		}
	}

	policy, err := s.sharingRepo.UpsertBookSharePolicy(ctx, &domain.BookSharePolicy{
		UserID:               userID,
		UserLibraryBookID:    input.UserLibraryBookID,
		RawFileSharing:       rawSharing,
		AllowMetadataSharing: input.AllowMetadataSharing,
	})
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}
	return policy, nil
}

func (s *sharingService) CreateShareLink(ctx context.Context, userID uuid.UUID, input applicationdto.CreateShareLinkInput, idempotencyKey string) (*domain.ShareLink, error) {
	resourceType := strings.TrimSpace(input.ResourceType)
	switch resourceType {
	case domain.ShareResourceTypeList:
		if _, err := s.sharingRepo.GetShareListByID(ctx, userID, input.ResourceID); err != nil {
			return nil, sqlerr.HandleError(err)
		}
	case domain.ShareResourceTypeHighlight:
		if _, err := s.libraryRepo.GetHighlightByID(ctx, userID, input.ResourceID); err != nil {
			return nil, sqlerr.HandleError(err)
		}
	case domain.ShareResourceTypeBookFile:
		libraryBook, err := s.libraryRepo.GetUserLibraryBookByID(ctx, userID, input.ResourceID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		catalog, err := s.libraryRepo.GetCatalogBookByID(ctx, libraryBook.CatalogBookID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		if catalog.VerificationStatus != domain.VerificationStatusVerifiedPublicDomain {
			return nil, errs.NewBadRequestError("verification_required", true, nil, nil)
		}
		policy, err := s.sharingRepo.GetBookSharePolicy(ctx, userID, libraryBook.ID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, errs.NewBadRequestError("share_not_permitted", true, nil, nil)
			}
			return nil, sqlerr.HandleError(err)
		}
		if policy.RawFileSharing != domain.RawFileSharingPublicLink {
			return nil, errs.NewBadRequestError("share_not_permitted", true, nil, nil)
		}
	default:
		return nil, errs.NewBadRequestError("Validation failed", true, []errs.FieldError{{Field: "resourceType", Error: "must be list, highlight, or book_file"}}, nil)
	}

	if idempotencyKey = strings.TrimSpace(idempotencyKey); idempotencyKey != "" {
		existing, err := s.libraryRepo.GetIdempotencyKey(ctx, userID, "share_link_create", idempotencyKey)
		if err == nil {
			type idemResponse struct {
				ShareLinkID string `json:"share_link_id"`
			}
			var decoded idemResponse
			if unmarshalErr := json.Unmarshal(existing.ResponseJSON, &decoded); unmarshalErr == nil {
				if parsedID, parseErr := uuid.Parse(decoded.ShareLinkID); parseErr == nil {
					link, getErr := s.sharingRepo.GetShareLinkByID(ctx, userID, parsedID)
					if getErr == nil {
						return link, nil
					}
				}
			}
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, sqlerr.HandleError(err)
		}
	}

	token, err := generateShareToken()
	if err != nil {
		return nil, errs.NewInternalServerError()
	}

	link := &domain.ShareLink{
		UserID:       userID,
		ResourceType: resourceType,
		ResourceID:   input.ResourceID,
		Token:        token,
		RequiresAuth: true,
		IsActive:     true,
		ExpiresAt:    input.ExpiresAt,
	}
	if err := s.sharingRepo.CreateShareLink(ctx, link); err != nil {
		return nil, sqlerr.HandleError(err)
	}

	if idempotencyKey != "" {
		resp, _ := json.Marshal(map[string]string{"share_link_id": link.ID.String()})
		_ = s.libraryRepo.CreateIdempotencyKey(ctx, &domain.IdempotencyKey{
			UserID:      userID,
			Operation:   "share_link_create",
			Key:         idempotencyKey,
			ResponseJSON: resp,
		})
	}

	return link, nil
}

func (s *sharingService) RevokeShareLink(ctx context.Context, userID, linkID uuid.UUID) error {
	if err := s.sharingRepo.DeactivateShareLink(ctx, userID, linkID); err != nil {
		return sqlerr.HandleError(err)
	}
	return nil
}

func (s *sharingService) ResolveShareLink(ctx context.Context, token string) (*ResolvedShareResource, error) {
	link, err := s.sharingRepo.GetShareLinkByToken(ctx, strings.TrimSpace(token))
	if err != nil {
		return nil, sqlerr.HandleError(err)
	}
	if !link.IsActive {
		return nil, errs.NewNotFoundError("Share link not found", true)
	}
	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now().UTC()) {
		return nil, errs.NewNotFoundError("Share link not found", true)
	}

	resolved := &ResolvedShareResource{ResourceType: link.ResourceType, Link: link}
	switch link.ResourceType {
	case domain.ShareResourceTypeList:
		list, err := s.sharingRepo.GetShareListByID(ctx, link.UserID, link.ResourceID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		if !list.IsPublished || list.Visibility != domain.VisibilityAuthenticated {
			return nil, errs.NewForbiddenError("policy_blocked", true)
		}
		resolved.ShareList = list
	case domain.ShareResourceTypeHighlight:
		highlight, err := s.libraryRepo.GetHighlightByID(ctx, link.UserID, link.ResourceID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		if highlight.Visibility != domain.VisibilityAuthenticated {
			return nil, errs.NewForbiddenError("policy_blocked", true)
		}
		resolved.Highlight = highlight
	case domain.ShareResourceTypeBookFile:
		libraryBook, err := s.libraryRepo.GetUserLibraryBookByID(ctx, link.UserID, link.ResourceID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		catalog, err := s.libraryRepo.GetCatalogBookByID(ctx, libraryBook.CatalogBookID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		if catalog.VerificationStatus != domain.VerificationStatusVerifiedPublicDomain {
			return nil, errs.NewForbiddenError("verification_required", true)
		}
		policy, err := s.sharingRepo.GetBookSharePolicy(ctx, link.UserID, libraryBook.ID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		if policy.RawFileSharing != domain.RawFileSharingPublicLink {
			return nil, errs.NewForbiddenError("share_not_permitted", true)
		}
		if libraryBook.PreferredAssetID == nil {
			return nil, errs.NewNotFoundError("book asset not configured", true)
		}
		asset, err := s.libraryRepo.GetBookAssetByID(ctx, *libraryBook.PreferredAssetID)
		if err != nil {
			return nil, sqlerr.HandleError(err)
		}
		resolved.LibraryBook = libraryBook
		resolved.BookAsset = asset
	default:
		return nil, errs.NewNotFoundError("Share resource not found", true)
	}
	return resolved, nil
}

func (s *sharingService) trackActivity(ctx context.Context, event *domain.ActivityEvent) {
	if s.communityRepo == nil || event == nil {
		return
	}
	_ = s.communityRepo.CreateActivityEvent(ctx, event)
}

func generateShareToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
