package handler

import (
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/kern/internal/application"
	applicationdto "github.com/jeheskielSunloy77/kern/internal/application/dto"
	"github.com/jeheskielSunloy77/kern/internal/domain"
	httpdto "github.com/jeheskielSunloy77/kern/internal/interface/http/dto"
	"github.com/jeheskielSunloy77/kern/internal/interface/http/response"
	httputils "github.com/jeheskielSunloy77/kern/internal/interface/http/utils"
)

type LibraryHandler struct {
	Handler
	service application.LibraryService
}

func NewLibraryHandler(h Handler, service application.LibraryService) *LibraryHandler {
	return &LibraryHandler{Handler: h, service: service}
}

func (h *LibraryHandler) CreateCatalogBook() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateCatalogBookRequest) (*response.Response[domain.BookCatalog], error) {
		book, err := h.service.CreateCatalogBook(c.UserContext(), req.ToUsecase())
		if err != nil {
			return nil, err
		}
		resp := response.Response[domain.BookCatalog]{
			Message: "Catalog book created successfully.",
			Status:  http.StatusCreated,
			Success: true,
			Data:    book,
		}
		return &resp, nil
	}, http.StatusCreated, &httpdto.CreateCatalogBookRequest{})
}

func (h *LibraryHandler) ListCatalogBooks() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (response.PaginatedResponse[domain.BookCatalog], error) {
		limit := httputils.ParseQueryInt(c.Query("limit"), 100, 20)
		offset := httputils.ParseQueryInt(c.Query("offset"), 10000, 0)
		books, total, err := h.service.ListCatalogBooks(c.UserContext(), limit, offset)
		if err != nil {
			return response.PaginatedResponse[domain.BookCatalog]{}, err
		}
		resp := response.NewPaginatedResponse("Catalog books fetched successfully.", books, total, limit, offset)
		return resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) UploadBookAsset() fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return err
		}

		catalogBookIDRaw := strings.TrimSpace(c.FormValue("catalogBookId"))
		if catalogBookIDRaw == "" {
			return fiber.NewError(http.StatusBadRequest, "catalogBookId is required")
		}
		catalogBookID, parseErr := uuid.Parse(catalogBookIDRaw)
		if parseErr != nil {
			return fiber.NewError(http.StatusBadRequest, "catalogBookId must be a valid UUID")
		}

		fileHeader, fileErr := c.FormFile("file")
		if fileErr != nil {
			return fiber.NewError(http.StatusBadRequest, "file is required")
		}
		opened, openErr := fileHeader.Open()
		if openErr != nil {
			return fiber.NewError(http.StatusBadRequest, "unable to read file")
		}
		defer opened.Close()

		size := fileHeader.Size
		if size <= 0 {
			size = int64(len(c.FormValue("file")))
		}
		asset, serviceErr := h.service.UploadBookAsset(c.UserContext(), userID, applicationdto.UploadBookAssetInput{
			CatalogBookID: catalogBookID,
			FileName:      fileHeader.Filename,
			MimeType:      fileHeader.Header.Get("Content-Type"),
			SizeBytes:     size,
			Checksum:      strings.TrimSpace(c.FormValue("checksum")),
		}, opened)
		if serviceErr != nil {
			return serviceErr
		}
		return c.Status(http.StatusCreated).JSON(asset)
	}
}

func (h *LibraryHandler) UpsertLibraryBook() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateLibraryBookRequest) (*domain.UserLibraryBook, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		book, serviceErr := h.service.UpsertLibraryBook(c.UserContext(), userID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return book, nil
	}, http.StatusCreated, &httpdto.CreateLibraryBookRequest{})
}

func (h *LibraryHandler) ListLibraryBooks() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (response.PaginatedResponse[domain.UserLibraryBook], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return response.PaginatedResponse[domain.UserLibraryBook]{}, err
		}
		limit := httputils.ParseQueryInt(c.Query("limit"), 100, 20)
		offset := httputils.ParseQueryInt(c.Query("offset"), 10000, 0)
		books, total, serviceErr := h.service.ListLibraryBooks(c.UserContext(), userID, limit, offset)
		if serviceErr != nil {
			return response.PaginatedResponse[domain.UserLibraryBook]{}, serviceErr
		}
		resp := response.NewPaginatedResponse("Library books fetched successfully.", books, total, limit, offset)
		return resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) UpdateLibraryBook() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpdateLibraryBookRequest) (*domain.UserLibraryBook, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		book, serviceErr := h.service.UpdateLibraryBook(c.UserContext(), userID, libraryBookID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return book, nil
	}, http.StatusOK, &httpdto.UpdateLibraryBookRequest{})
}

func (h *LibraryHandler) DeleteLibraryBook() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*response.Response[any], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		if serviceErr := h.service.DeleteLibraryBook(c.UserContext(), userID, libraryBookID); serviceErr != nil {
			return nil, serviceErr
		}
		resp := response.Response[any]{
			Message: "Library book removed successfully.",
			Status:  http.StatusOK,
			Success: true,
		}
		return &resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) GetReadingState() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*domain.ReadingState, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		mode := c.Params("mode")
		state, serviceErr := h.service.GetReadingState(c.UserContext(), userID, libraryBookID, mode)
		if serviceErr != nil {
			return nil, serviceErr
		}
		return state, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) UpsertReadingState() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpsertReadingStateRequest) (*domain.ReadingState, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		mode := c.Params("mode")
		state, serviceErr := h.service.UpsertReadingState(c.UserContext(), userID, libraryBookID, req.ToUsecase(mode))
		if serviceErr != nil {
			return nil, serviceErr
		}
		return state, nil
	}, http.StatusOK, &httpdto.UpsertReadingStateRequest{})
}

func (h *LibraryHandler) ListHighlights() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) ([]domain.Highlight, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		highlights, serviceErr := h.service.ListHighlights(c.UserContext(), userID, libraryBookID, shouldIncludeDeleted(c))
		if serviceErr != nil {
			return nil, serviceErr
		}
		return highlights, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) CreateHighlight() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateHighlightRequest) (*domain.Highlight, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		highlight, serviceErr := h.service.CreateHighlight(c.UserContext(), userID, libraryBookID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return highlight, nil
	}, http.StatusCreated, &httpdto.CreateHighlightRequest{})
}

func (h *LibraryHandler) UpdateHighlight() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpdateHighlightRequest) (*domain.Highlight, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		highlightID, parseErr := httputils.ParseUUIDParam(c.Params("highlightId"))
		if parseErr != nil {
			return nil, parseErr
		}
		highlight, serviceErr := h.service.UpdateHighlight(c.UserContext(), userID, highlightID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return highlight, nil
	}, http.StatusOK, &httpdto.UpdateHighlightRequest{})
}

func (h *LibraryHandler) DeleteHighlight() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*response.Response[any], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		highlightID, parseErr := httputils.ParseUUIDParam(c.Params("highlightId"))
		if parseErr != nil {
			return nil, parseErr
		}
		if serviceErr := h.service.DeleteHighlight(c.UserContext(), userID, highlightID); serviceErr != nil {
			return nil, serviceErr
		}
		resp := response.Response[any]{
			Message: "Highlight deleted successfully.",
			Status:  http.StatusOK,
			Success: true,
		}
		return &resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) ListBookmarks() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) ([]domain.Bookmark, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		bookmarks, serviceErr := h.service.ListBookmarks(c.UserContext(), userID, libraryBookID, shouldIncludeDeleted(c))
		if serviceErr != nil {
			return nil, serviceErr
		}
		return bookmarks, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) CreateBookmark() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateBookmarkRequest) (*domain.Bookmark, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		bookmark, serviceErr := h.service.CreateBookmark(c.UserContext(), userID, libraryBookID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return bookmark, nil
	}, http.StatusCreated, &httpdto.CreateBookmarkRequest{})
}

func (h *LibraryHandler) UpdateBookmark() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpdateBookmarkRequest) (*domain.Bookmark, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		bookmarkID, parseErr := httputils.ParseUUIDParam(c.Params("bookmarkId"))
		if parseErr != nil {
			return nil, parseErr
		}
		bookmark, serviceErr := h.service.UpdateBookmark(c.UserContext(), userID, bookmarkID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return bookmark, nil
	}, http.StatusOK, &httpdto.UpdateBookmarkRequest{})
}

func (h *LibraryHandler) DeleteBookmark() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*response.Response[any], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		bookmarkID, parseErr := httputils.ParseUUIDParam(c.Params("bookmarkId"))
		if parseErr != nil {
			return nil, parseErr
		}
		if serviceErr := h.service.DeleteBookmark(c.UserContext(), userID, bookmarkID); serviceErr != nil {
			return nil, serviceErr
		}
		resp := response.Response[any]{
			Message: "Bookmark deleted successfully.",
			Status:  http.StatusOK,
			Success: true,
		}
		return &resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) ListNotes() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) ([]domain.Note, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		notes, serviceErr := h.service.ListNotes(c.UserContext(), userID, libraryBookID, shouldIncludeDeleted(c))
		if serviceErr != nil {
			return nil, serviceErr
		}
		return notes, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func (h *LibraryHandler) CreateNote() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.CreateNoteRequest) (*domain.Note, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		libraryBookID, parseErr := httputils.ParseUUIDParam(c.Params("id"))
		if parseErr != nil {
			return nil, parseErr
		}
		note, serviceErr := h.service.CreateNote(c.UserContext(), userID, libraryBookID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return note, nil
	}, http.StatusCreated, &httpdto.CreateNoteRequest{})
}

func (h *LibraryHandler) UpdateNote() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, req *httpdto.UpdateNoteRequest) (*domain.Note, error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		noteID, parseErr := httputils.ParseUUIDParam(c.Params("noteId"))
		if parseErr != nil {
			return nil, parseErr
		}
		note, serviceErr := h.service.UpdateNote(c.UserContext(), userID, noteID, req.ToUsecase())
		if serviceErr != nil {
			return nil, serviceErr
		}
		return note, nil
	}, http.StatusOK, &httpdto.UpdateNoteRequest{})
}

func (h *LibraryHandler) DeleteNote() fiber.Handler {
	return Handle(h.Handler, func(c *fiber.Ctx, _ *httpdto.Empty) (*response.Response[any], error) {
		userID, err := parseUserIDFromContext(c)
		if err != nil {
			return nil, err
		}
		noteID, parseErr := httputils.ParseUUIDParam(c.Params("noteId"))
		if parseErr != nil {
			return nil, parseErr
		}
		if serviceErr := h.service.DeleteNote(c.UserContext(), userID, noteID); serviceErr != nil {
			return nil, serviceErr
		}
		resp := response.Response[any]{
			Message: "Note deleted successfully.",
			Status:  http.StatusOK,
			Success: true,
		}
		return &resp, nil
	}, http.StatusOK, &httpdto.Empty{})
}

func shouldIncludeDeleted(c *fiber.Ctx) bool {
	return strings.EqualFold(strings.TrimSpace(c.Query("includeDeleted")), "true")
}
