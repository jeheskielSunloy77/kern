package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jeheskielSunloy77/zeile/internal/application"
	"github.com/jeheskielSunloy77/zeile/internal/domain"
	httpdto "github.com/jeheskielSunloy77/zeile/internal/interface/http/dto"
	"github.com/jeheskielSunloy77/zeile/internal/interface/http/response"
	httputils "github.com/jeheskielSunloy77/zeile/internal/interface/http/utils"
)

type CommunityHandler struct {
	Handler
	service application.CommunityService
}

func NewCommunityHandler(h Handler, service application.CommunityService) *CommunityHandler {
	return &CommunityHandler{Handler: h, service: service}
}

func (h *CommunityHandler) GetProfile() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*domain.CommunityProfile, error) {
		userID, err := httputils.ParseUUIDParam(c.Params("userId"))
		if err != nil {
			return nil, err
		}
		profile, serviceErr := h.service.GetProfile(c.UserContext(), userID)
		if serviceErr != nil {
			return nil, serviceErr
		}
		return profile, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *CommunityHandler) UpdateMyProfile() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpdateCommunityProfileRequest) (*domain.CommunityProfile, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		profile, serviceErr := h.service.UpdateMyProfile(c.UserContext(), userID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return profile, nil
	}, http.StatusOK, &httpdto.UpdateCommunityProfileRequest{})
}

func (h *CommunityHandler) ListActivity() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (response.PaginatedResponse[domain.ActivityEvent], error) {
		targetUserID, err := httputils.ParseUUIDParam(c.Params("userId"))
		if err != nil {
			return response.PaginatedResponse[domain.ActivityEvent]{}, err
		}
		limit := httputils.ParseQueryInt(c.Query("limit"), 100, 20)
		offset := httputils.ParseQueryInt(c.Query("offset"), 10000, 0)
		events, total, serviceErr := h.service.ListActivity(c.UserContext(), targetUserID, limit, offset)
		if serviceErr != nil {
			return response.PaginatedResponse[domain.ActivityEvent]{}, serviceErr
		}
		resp := response.NewPaginatedResponse("Activity events fetched successfully.", events, total, limit, offset)
		return resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}
