package dto

import (
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	applicationdto "github.com/jeheskielSunloy77/zeile/internal/application/dto"
)

type CreateShareListRequest struct {
	Name        string  `json:"name" validate:"required,min=1,max=120"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
	Visibility  *string `json:"visibility" validate:"omitempty,oneof=private authenticated"`
}

func (d *CreateShareListRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *CreateShareListRequest) ToUsecase() applicationdto.CreateShareListInput {
	return applicationdto.CreateShareListInput{
		Name:        d.Name,
		Description: d.Description,
		Visibility:  d.Visibility,
	}
}

type UpdateShareListRequest struct {
	Name        *string `json:"name" validate:"omitempty,min=1,max=120"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
	Visibility  *string `json:"visibility" validate:"omitempty,oneof=private authenticated"`
	IsPublished *bool   `json:"isPublished"`
}

func (d *UpdateShareListRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *UpdateShareListRequest) ToUsecase() applicationdto.UpdateShareListInput {
	return applicationdto.UpdateShareListInput{
		Name:        d.Name,
		Description: d.Description,
		Visibility:  d.Visibility,
		IsPublished: d.IsPublished,
	}
}

type CreateShareListItemRequest struct {
	ItemType          string  `json:"itemType" validate:"required,oneof=book highlight"`
	UserLibraryBookID *string `json:"userLibraryBookId" validate:"omitempty,uuid"`
	HighlightID       *string `json:"highlightId" validate:"omitempty,uuid"`
	Position          int     `json:"position" validate:"min=0"`
}

func (d *CreateShareListItemRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *CreateShareListItemRequest) ToUsecase() applicationdto.CreateShareListItemInput {
	var libraryBookID *uuid.UUID
	if d.UserLibraryBookID != nil {
		if parsed, err := uuid.Parse(*d.UserLibraryBookID); err == nil {
			libraryBookID = &parsed
		}
	}

	var highlightID *uuid.UUID
	if d.HighlightID != nil {
		if parsed, err := uuid.Parse(*d.HighlightID); err == nil {
			highlightID = &parsed
		}
	}

	return applicationdto.CreateShareListItemInput{
		ItemType:          d.ItemType,
		UserLibraryBookID: libraryBookID,
		HighlightID:       highlightID,
		Position:          d.Position,
	}
}

type UpsertBookSharePolicyRequest struct {
	UserLibraryBookID    string `json:"userLibraryBookId" validate:"required,uuid"`
	RawFileSharing       string `json:"rawFileSharing" validate:"required,oneof=private public_link"`
	AllowMetadataSharing bool   `json:"allowMetadataSharing"`
}

func (d *UpsertBookSharePolicyRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *UpsertBookSharePolicyRequest) ToUsecase() applicationdto.UpsertBookSharePolicyInput {
	bookID, _ := uuid.Parse(d.UserLibraryBookID)
	return applicationdto.UpsertBookSharePolicyInput{
		UserLibraryBookID:    bookID,
		RawFileSharing:       d.RawFileSharing,
		AllowMetadataSharing: d.AllowMetadataSharing,
	}
}

type CreateShareLinkRequest struct {
	ResourceType string  `json:"resourceType" validate:"required,oneof=list highlight book_file"`
	ResourceID   string  `json:"resourceId" validate:"required,uuid"`
	ExpiresAt    *string `json:"expiresAt" validate:"omitempty,datetime"`
}

func (d *CreateShareLinkRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *CreateShareLinkRequest) ToUsecase() applicationdto.CreateShareLinkInput {
	resourceID, _ := uuid.Parse(d.ResourceID)

	var expiresAt *time.Time
	if d.ExpiresAt != nil {
		if parsed, err := time.Parse(time.RFC3339, *d.ExpiresAt); err == nil {
			expiresAt = &parsed
		}
	}

	return applicationdto.CreateShareLinkInput{
		ResourceType: d.ResourceType,
		ResourceID:   resourceID,
		ExpiresAt:    expiresAt,
	}
}
