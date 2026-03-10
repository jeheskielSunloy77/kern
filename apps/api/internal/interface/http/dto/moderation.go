package dto

import (
	"encoding/json"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	applicationdto "github.com/jeheskielSunloy77/kern/internal/application/dto"
)

type CreateModerationReviewRequest struct {
	CatalogBookID string         `json:"catalogBookId" validate:"required,uuid"`
	Evidence      map[string]any `json:"evidence"`
}

func (d *CreateModerationReviewRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *CreateModerationReviewRequest) ToUsecase() applicationdto.CreateModerationReviewInput {
	catalogBookID, _ := uuid.Parse(d.CatalogBookID)
	evidence, _ := json.Marshal(d.Evidence)
	return applicationdto.CreateModerationReviewInput{
		CatalogBookID: catalogBookID,
		EvidenceJSON:  evidence,
	}
}

type DecideModerationReviewRequest struct {
	Decision string `json:"decision" validate:"required,oneof=approved rejected"`
}

func (d *DecideModerationReviewRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *DecideModerationReviewRequest) ToUsecase() applicationdto.DecideModerationReviewInput {
	return applicationdto.DecideModerationReviewInput{Decision: d.Decision}
}
