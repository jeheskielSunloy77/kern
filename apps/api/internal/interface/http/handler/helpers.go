package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/kern/internal/app/errs"
	"github.com/jeheskielSunloy77/kern/internal/interface/http/middleware"
)

func parseUserIDFromContext(c *fiber.Ctx) (uuid.UUID, error) {
	raw := middleware.GetUserID(c)
	if raw == "" {
		return uuid.Nil, errs.NewUnauthorizedError("Unauthorized", false)
	}
	parsed, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, errs.NewUnauthorizedError("Unauthorized", false)
	}
	return parsed, nil
}
