package application

import (
	"github.com/jeheskielSunloy77/zeile/internal/application/port"
	"github.com/jeheskielSunloy77/zeile/internal/infrastructure/lib/job"
	"github.com/jeheskielSunloy77/zeile/internal/infrastructure/server"
)

type Services struct {
	Auth          AuthService
	User          UserService
	Library       LibraryService
	Sharing       SharingService
	Community     CommunityService
	Moderation    ModerationService
	Authorization *AuthorizationService
	Job           *job.JobService
}

func NewServices(s *server.Server, repos *port.Repositories) (*Services, error) {
	var enqueuer TaskEnqueuer
	if s.Job != nil {
		enqueuer = s.Job.Client
	}
	authService := NewAuthService(&s.Config.Auth, repos.Auth, repos.AuthSession, repos.EmailVerification, enqueuer, s.Logger)
	userService := NewUserService(repos.User)
	libraryService := NewLibraryService(repos.Library, repos.Community, s.Storage)
	sharingService := NewSharingService(repos.Sharing, repos.Library, repos.Community)
	communityService := NewCommunityService(repos.Community)
	moderationService := NewModerationService(repos.Moderation, repos.Library)
	authorizationService, err := NewAuthorizationService(s.DB.DB, s.Logger)
	if err != nil {
		return nil, err
	}

	return &Services{
		Job:           s.Job,
		Auth:          authService,
		User:          userService,
		Library:       libraryService,
		Sharing:       sharingService,
		Community:     communityService,
		Moderation:    moderationService,
		Authorization: authorizationService,
	}, nil
}
