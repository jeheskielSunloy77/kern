package handler

import (
	"github.com/jeheskielSunloy77/kern/internal/application"
	"github.com/jeheskielSunloy77/kern/internal/infrastructure/server"
)

type Handlers struct {
	Health     *HealthHandler
	Auth       *AuthHandler
	User       *UserHandler
	Library    *LibraryHandler
	Sharing    *SharingHandler
	Community  *CommunityHandler
	Moderation *ModerationHandler
	OpenAPI    *OpenAPIHandler
}

func NewHandlers(s *server.Server, services *application.Services) *Handlers {
	h := NewHandler(s)

	return &Handlers{
		Health:     NewHealthHandler(h),
		Auth:       NewAuthHandler(h, services.Auth),
		User:       NewUserHandler(h, services.User),
		Library:    NewLibraryHandler(h, services.Library),
		Sharing:    NewSharingHandler(h, services.Sharing),
		Community:  NewCommunityHandler(h, services.Community),
		Moderation: NewModerationHandler(h, services.Moderation),
		OpenAPI:    NewOpenAPIHandler(h),
	}
}
