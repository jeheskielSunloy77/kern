package handler

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jeheskielSunloy77/kern/internal/application"
	"github.com/jeheskielSunloy77/kern/internal/domain"
	httpdto "github.com/jeheskielSunloy77/kern/internal/interface/http/dto"
	"github.com/jeheskielSunloy77/kern/internal/interface/http/response"
	httputils "github.com/jeheskielSunloy77/kern/internal/interface/http/utils"
)

type SharingHandler struct {
	Handler
	service application.SharingService
}

func NewSharingHandler(h Handler, service application.SharingService) *SharingHandler {
	return &SharingHandler{Handler: h, service: service}
}

func (h *SharingHandler) CreateShareList() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateShareListRequest) (*domain.ShareList, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		list, serviceErr := h.service.CreateShareList(c.UserContext(), userID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return list, nil
	}, http.StatusCreated, &httpdto.CreateShareListRequest{})
}

func (h *SharingHandler) ListShareLists() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (response.PaginatedResponse[domain.ShareList], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return response.PaginatedResponse[domain.ShareList]{}, err
		}
		limit := httputils.ParseQueryInt(c.Query("limit"), 100, 20)
		offset := httputils.ParseQueryInt(c.Query("offset"), 10000, 0)
		lists, total, serviceErr := h.service.ListShareLists(c.UserContext(), userID, limit, offset)
		if serviceErr != nil {
			return response.PaginatedResponse[domain.ShareList]{}, serviceErr
		}
		resp := response.NewPaginatedResponse("Share lists fetched successfully.", lists, total, limit, offset)
		return resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *SharingHandler) UpdateShareList() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpdateShareListRequest) (*domain.ShareList, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		listID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		list, serviceErr := h.service.UpdateShareList(c.UserContext(), userID, listID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return list, nil
	}, http.StatusOK, &httpdto.UpdateShareListRequest{})
}

func (h *SharingHandler) CreateShareListItem() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateShareListItemRequest) (*domain.ShareListItem, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		listID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		item, serviceErr := h.service.CreateShareListItem(c.UserContext(), userID, listID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return item, nil
	}, http.StatusCreated, &httpdto.CreateShareListItemRequest{})
}

func (h *SharingHandler) ListShareListItems() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) ([]domain.ShareListItem, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		listID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		items, serviceErr := h.service.ListShareListItems(c.UserContext(), userID, listID)
		if serviceErr != nil {
			return nil, serviceErr
		}
		return items, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *SharingHandler) UpsertBookSharePolicy() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpsertBookSharePolicyRequest) (*domain.BookSharePolicy, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		policy, serviceErr := h.service.UpsertBookSharePolicy(c.UserContext(), userID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return policy, nil
	}, http.StatusOK, &httpdto.UpsertBookSharePolicyRequest{})
}

func (h *SharingHandler) CreateShareLink() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateShareLinkRequest) (*domain.ShareLink, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		idempotencyKey := c.Get("Idempotency-Key")
		link, serviceErr := h.service.CreateShareLink(c.UserContext(), userID, req.ToUsecase(), idempotencyKey)
		if serviceErr != nil {
			return nil, serviceErr
		}
		return link, nil
	}, http.StatusCreated, &httpdto.CreateShareLinkRequest{})
}

func (h *SharingHandler) RevokeShareLink() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*response.Response[any], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		linkID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		if serviceErr := h.service.RevokeShareLink(c.UserContext(), userID, linkID); serviceErr != nil {
			return nil, serviceErr
		}
		resp := response.Response[any]{
			Message: "Share link revoked successfully.",
			Status:  http.StatusOK,
			Success: true,
		}
		return &resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *SharingHandler) ResolveShareLink() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*application.ResolvedShareResource, error) {
		resource, err := h.service.ResolveShareLink(c.UserContext(), c.Params("token"))
		if err != nil {
			return nil, err
		}
		return resource, nil
	}, http.StatusOK, &httpdto.Empty{})
}
