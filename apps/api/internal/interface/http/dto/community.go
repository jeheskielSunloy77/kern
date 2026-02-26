package dto

import (
	"github.com/go-playground/validator/v10"
	applicationdto "github.com/jeheskielSunloy77/zeile/internal/application/dto"
)

type UpdateCommunityProfileRequest struct {
	DisplayName         *string `json:"displayName" validate:"omitempty,max=120"`
	Bio                 *string `json:"bio" validate:"omitempty,max=2000"`
	AvatarURL           *string `json:"avatarUrl" validate:"omitempty,url"`
	ShowReadingActivity *bool   `json:"showReadingActivity"`
	ShowHighlights      *bool   `json:"showHighlights"`
	ShowLists           *bool   `json:"showLists"`
}

func (d *UpdateCommunityProfileRequest) Validate() error {
	return validator.New().Struct(d)
}

func (d *UpdateCommunityProfileRequest) ToUsecase() applicationdto.UpdateCommunityProfileInput {
	return applicationdto.UpdateCommunityProfileInput{
		DisplayName:         d.DisplayName,
		Bio:                 d.Bio,
		AvatarURL:           d.AvatarURL,
		ShowReadingActivity: d.ShowReadingActivity,
		ShowHighlights:      d.ShowHighlights,
		ShowLists:           d.ShowLists,
	}
}
