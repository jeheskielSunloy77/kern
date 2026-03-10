package application

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jeheskielSunloy77/kern/tui/internal/infrastructure/remote"
)

func TestAuthServiceUpdateUsernameRequiresConnection(t *testing.T) {
	store := remote.NewSessionStore(filepath.Join(t.TempDir(), "auth-session.json"))
	service := &AuthService{
		client: remote.NewClient("http://localhost:8080"),
		store:  store,
	}

	_, err := service.UpdateUsername(context.Background(), "new-user")
	if err == nil {
		t.Fatalf("expected not connected error")
	}
	if !strings.Contains(err.Error(), "not connected") {
		t.Fatalf("expected not connected error, got %v", err)
	}
}

func TestAuthServiceUpdateUsernameRejectsExpiredSession(t *testing.T) {
	store := remote.NewSessionStore(filepath.Join(t.TempDir(), "auth-session.json"))
	service := &AuthService{
		client: remote.NewClient("http://localhost:8080"),
		store:  store,
		session: &remote.Session{
			User: remote.User{
				ID:       "5f486fe9-57c2-414b-8502-17c6f87fce96",
				Email:    "reader@example.com",
				Username: "reader",
			},
			AccessToken:     "access-token",
			AccessExpiresAt: time.Now().UTC().Add(-1 * time.Minute),
		},
	}

	_, err := service.UpdateUsername(context.Background(), "new-user")
	if err == nil {
		t.Fatalf("expected session expired error")
	}
	if !strings.Contains(err.Error(), "session expired") {
		t.Fatalf("expected session expired error, got %v", err)
	}
}

func TestAuthServiceUpdateUsernamePersistsSession(t *testing.T) {
	userID := "5f486fe9-57c2-414b-8502-17c6f87fce96"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			t.Fatalf("expected PATCH, got %s", r.Method)
		}
		if r.URL.Path != "/api/v1/users/"+userID {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			t.Fatalf("expected bearer auth header")
		}

		var req struct {
			Username string `json:"username"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.Username != "new-user" {
			t.Fatalf("expected username new-user, got %q", req.Username)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(remote.User{
			ID:       userID,
			Email:    "reader@example.com",
			Username: "new-user",
		})
	}))
	defer server.Close()

	store := remote.NewSessionStore(filepath.Join(t.TempDir(), "auth-session.json"))
	service := &AuthService{
		client: remote.NewClient(server.URL),
		store:  store,
		session: &remote.Session{
			User: remote.User{
				ID:       userID,
				Email:    "reader@example.com",
				Username: "reader",
			},
			AccessToken:     "access-token",
			AccessExpiresAt: time.Now().UTC().Add(30 * time.Minute),
		},
	}

	updatedUser, err := service.UpdateUsername(context.Background(), "new-user")
	if err != nil {
		t.Fatalf("update username: %v", err)
	}
	if updatedUser.Username != "new-user" {
		t.Fatalf("expected updated username, got %q", updatedUser.Username)
	}

	session, ok := service.Session()
	if !ok {
		t.Fatalf("expected persisted in-memory session")
	}
	if session.User.Username != "new-user" {
		t.Fatalf("expected in-memory username updated, got %q", session.User.Username)
	}

	stored, err := store.Load()
	if err != nil {
		t.Fatalf("load stored session: %v", err)
	}
	if stored == nil {
		t.Fatalf("expected session saved on disk")
	}
	if stored.User.Username != "new-user" {
		t.Fatalf("expected stored username updated, got %q", stored.User.Username)
	}
}
