package dto

import (
	"time"

	"github.com/google/uuid"
)

type CreateShareListInput struct {
	Name        string
	Description *string
	Visibility  *string
}

type UpdateShareListInput struct {
	Name        *string
	Description *string
	Visibility  *string
	IsPublished *bool
}

type CreateShareListItemInput struct {
	ItemType          string
	UserLibraryBookID *uuid.UUID
	HighlightID       *uuid.UUID
	Position          int
}

type UpsertBookSharePolicyInput struct {
	UserLibraryBookID    uuid.UUID
	RawFileSharing       string
	AllowMetadataSharing bool
}

type CreateShareLinkInput struct {
	ResourceType string
	ResourceID   uuid.UUID
	ExpiresAt    *time.Time
}
