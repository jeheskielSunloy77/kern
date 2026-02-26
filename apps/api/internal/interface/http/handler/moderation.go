package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jeheskielSunloy77/zeile/internal/app/errs"
	"github.com/jeheskielSunloy77/zeile/internal/application"
	"github.com/jeheskielSunloy77/zeile/internal/domain"
	httpdto "github.com/jeheskielSunloy77/zeile/internal/interface/http/dto"
	"github.com/jeheskielSunloy77/zeile/internal/interface/http/middleware"
	"github.com/jeheskielSunloy77/zeile/internal/interface/http/response"
	httputils "github.com/jeheskielSunloy77/zeile/internal/interface/http/utils"
)

type ModerationHandler struct {
	Handler
	service application.ModerationService
}

func NewModerationHandler(h Handler, service application.ModerationService) *ModerationHandler {
	return &ModerationHandler{Handler: h, service: service}
}

func (h *ModerationHandler) CreateReview() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateModerationReviewRequest) (*domain.ModerationReview, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		review, serviceErr := h.service.CreateReview(c.UserContext(), userID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return review, nil
	}, http.StatusCreated, &httpdto.CreateModerationReviewRequest{})
}

func (h *ModerationHandler) ListReviews() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (response.PaginatedResponse[domain.ModerationReview], error) {
		if !middleware.GetUserIsAdmin(c) {
			return response.PaginatedResponse[domain.ModerationReview]{}, errs.NewForbiddenError("Forbidden", false)
		}
		status := c.Query("status")
		limit := httputils.ParseQueryInt(c.Query("limit"), 100, 20)
		offset := httputils.ParseQueryInt(c.Query("offset"), 10000, 0)
		reviews, total, serviceErr := h.service.ListReviews(c.UserContext(), status, limit, offset)
		if serviceErr != nil {
			return response.PaginatedResponse[domain.ModerationReview]{}, serviceErr
		}
		resp := response.NewPaginatedResponse("Moderation reviews fetched successfully.", reviews, total, limit, offset)
		return resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *ModerationHandler) DecideReview() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.DecideModerationReviewRequest) (*domain.ModerationReview, error) {
		if !middleware.GetUserIsAdmin(c) {
			return nil, errs.NewForbiddenError("Forbidden", false)
		}
		reviewerID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		reviewID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		review, serviceErr := h.service.DecideReview(c.UserContext(), reviewerID, reviewID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return review, nil
	}, http.StatusOK, &httpdto.DecideModerationReviewRequest{})
}
