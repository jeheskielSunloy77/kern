package dto

import "encoding/json"

import "github.com/google/uuid"

type CreateModerationReviewInput struct {
	CatalogBookID uuid.UUID
	EvidenceJSON  json.RawMessage
}

type DecideModerationReviewInput struct {
	Decision string
}
