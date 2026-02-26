package dto

type UpdateCommunityProfileInput struct {
	DisplayName         *string
	Bio                 *string
	AvatarURL           *string
	ShowReadingActivity *bool
	ShowHighlights      *bool
	ShowLists           *bool
}
