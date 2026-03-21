package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type BookCatalog struct {
	ID string `json:"id"`
}

type BookAsset struct {
	ID            string  `json:"id"`
	CatalogBookID string  `json:"catalogBookId"`
	PublicURL     *string `json:"publicUrl,omitempty"`
	MimeType      string  `json:"mimeType"`
	SizeBytes     int64   `json:"sizeBytes"`
	Checksum      string  `json:"checksum"`
}

type UserLibraryBook struct {
	ID                  string  `json:"id"`
	CatalogBookID       string  `json:"catalogBookId"`
	PreferredAssetID    *string `json:"preferredAssetId,omitempty"`
	SourceLibraryBookID *string `json:"sourceLibraryBookId,omitempty"`
	IsPublic            bool    `json:"isPublic"`
}

type CommunityBookOwner struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

type CommunityBookAsset struct {
	ID        string  `json:"id"`
	MimeType  string  `json:"mimeType"`
	SizeBytes int64   `json:"sizeBytes"`
	Checksum  string  `json:"checksum"`
	PublicURL *string `json:"publicUrl,omitempty"`
}

type CommunityBook struct {
	ID               string             `json:"id"`
	CatalogBookID    string             `json:"catalogBookId"`
	PreferredAssetID string             `json:"preferredAssetId"`
	Owner            CommunityBookOwner `json:"owner"`
	Title            string             `json:"title"`
	Authors          string             `json:"authors"`
	SourceType       string             `json:"sourceType"`
	PreferredAsset   CommunityBookAsset `json:"preferredAsset"`
}

type envelope[T any] struct {
	Data *T `json:"data"`
}

type paginatedEnvelope[T any] struct {
	Data  []T `json:"data"`
	Total int `json:"total"`
	Limit int `json:"limit"`
	Page  int `json:"page"`
}

func (c *Client) CreateCatalogBook(ctx context.Context, accessToken, title, authors string) (BookCatalog, error) {
	reqBody := struct {
		Title   string `json:"title"`
		Authors string `json:"authors"`
	}{
		Title:   strings.TrimSpace(title),
		Authors: strings.TrimSpace(authors),
	}

	var resp envelope[BookCatalog]
	if err := c.doJSON(ctx, "POST", "/api/v1/library/catalog/books", reqBody, strings.TrimSpace(accessToken), &resp); err != nil {
		return BookCatalog{}, err
	}
	if resp.Data == nil || strings.TrimSpace(resp.Data.ID) == "" {
		return BookCatalog{}, fmt.Errorf("invalid catalog response")
	}
	return *resp.Data, nil
}

func (c *Client) UpsertLibraryBook(ctx context.Context, accessToken, catalogBookID string) (UserLibraryBook, error) {
	reqBody := struct {
		CatalogBookID string `json:"catalogBookId"`
	}{
		CatalogBookID: strings.TrimSpace(catalogBookID),
	}

	var resp UserLibraryBook
	if err := c.doJSON(ctx, "POST", "/api/v1/library/books", reqBody, strings.TrimSpace(accessToken), &resp); err != nil {
		return UserLibraryBook{}, err
	}
	if strings.TrimSpace(resp.ID) == "" {
		return UserLibraryBook{}, fmt.Errorf("invalid library book response")
	}
	return resp, nil
}

func (c *Client) UploadBookAsset(ctx context.Context, accessToken, catalogBookID, filePath string) (BookAsset, error) {
	if !c.Enabled() {
		return BookAsset{}, &APIError{
			Message: "api base url is not configured",
			Status:  http.StatusBadRequest,
		}
	}

	filePath = strings.TrimSpace(filePath)
	catalogBookID = strings.TrimSpace(catalogBookID)
	if filePath == "" {
		return BookAsset{}, fmt.Errorf("file path is required")
	}
	if catalogBookID == "" {
		return BookAsset{}, fmt.Errorf("catalog book id is required")
	}

	file, err := os.Open(filePath)
	if err != nil {
		return BookAsset{}, fmt.Errorf("open upload file: %w", err)
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return BookAsset{}, fmt.Errorf("stat upload file: %w", err)
	}

	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(filePath)))
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}

	pipeReader, pipeWriter := io.Pipe()
	writer := multipart.NewWriter(pipeWriter)

	go func() {
		defer pipeWriter.Close()
		defer writer.Close()

		if err := writer.WriteField("catalogBookId", catalogBookID); err != nil {
			_ = pipeWriter.CloseWithError(err)
			return
		}

		part, err := writer.CreateFormFile("file", filepath.Base(filePath))
		if err != nil {
			_ = pipeWriter.CloseWithError(err)
			return
		}
		if _, err := io.Copy(part, file); err != nil {
			_ = pipeWriter.CloseWithError(err)
			return
		}
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/v1/library/assets/upload", pipeReader)
	if err != nil {
		return BookAsset{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return BookAsset{}, fmt.Errorf("perform request: %w", err)
	}
	defer resp.Body.Close()

	responseBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return BookAsset{}, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return BookAsset{}, parseAPIError(resp.StatusCode, responseBytes)
	}

	var asset BookAsset
	if err := json.Unmarshal(responseBytes, &asset); err != nil {
		return BookAsset{}, fmt.Errorf("decode response: %w", err)
	}
	if strings.TrimSpace(asset.ID) == "" {
		return BookAsset{}, fmt.Errorf("invalid asset upload response")
	}
	if asset.SizeBytes == 0 {
		asset.SizeBytes = info.Size()
	}
	if strings.TrimSpace(asset.MimeType) == "" {
		asset.MimeType = contentType
	}
	return asset, nil
}

func (c *Client) ListLibraryBooks(ctx context.Context, accessToken string) ([]UserLibraryBook, error) {
	var resp paginatedEnvelope[UserLibraryBook]
	if err := c.doJSON(ctx, "GET", "/api/v1/library/books", nil, strings.TrimSpace(accessToken), &resp); err != nil {
		return nil, err
	}
	return resp.Data, nil
}

func (c *Client) UpdateLibraryBookPreferredAsset(ctx context.Context, accessToken, libraryBookID, preferredAssetID string) (UserLibraryBook, error) {
	reqBody := struct {
		PreferredAssetID string `json:"preferredAssetId"`
	}{
		PreferredAssetID: strings.TrimSpace(preferredAssetID),
	}

	var resp UserLibraryBook
	path := fmt.Sprintf("/api/v1/library/books/%s", strings.TrimSpace(libraryBookID))
	if err := c.doJSON(ctx, "PATCH", path, reqBody, strings.TrimSpace(accessToken), &resp); err != nil {
		return UserLibraryBook{}, err
	}
	if strings.TrimSpace(resp.ID) == "" {
		return UserLibraryBook{}, fmt.Errorf("invalid library book response")
	}
	return resp, nil
}

func (c *Client) UpdateLibraryBookVisibility(ctx context.Context, accessToken, libraryBookID string, isPublic bool) (UserLibraryBook, error) {
	reqBody := struct {
		IsPublic bool `json:"isPublic"`
	}{
		IsPublic: isPublic,
	}

	var resp UserLibraryBook
	path := fmt.Sprintf("/api/v1/library/books/%s", strings.TrimSpace(libraryBookID))
	if err := c.doJSON(ctx, "PATCH", path, reqBody, strings.TrimSpace(accessToken), &resp); err != nil {
		return UserLibraryBook{}, err
	}
	if strings.TrimSpace(resp.ID) == "" {
		return UserLibraryBook{}, fmt.Errorf("invalid library book response")
	}
	return resp, nil
}

func (c *Client) ListCommunityBooks(ctx context.Context, accessToken, query string, limit, offset int) ([]CommunityBook, int, error) {
	path := fmt.Sprintf("/api/v1/community/books?limit=%d&offset=%d", limit, offset)
	if trimmed := strings.TrimSpace(query); trimmed != "" {
		path += "&q=" + urlQueryEscape(trimmed)
	}

	var resp paginatedEnvelope[CommunityBook]
	if err := c.doJSON(ctx, "GET", path, nil, strings.TrimSpace(accessToken), &resp); err != nil {
		return nil, 0, err
	}
	return resp.Data, resp.Total, nil
}

func (c *Client) GetCommunityBook(ctx context.Context, accessToken, libraryBookID string) (CommunityBook, error) {
	var resp CommunityBook
	path := fmt.Sprintf("/api/v1/community/books/%s", strings.TrimSpace(libraryBookID))
	if err := c.doJSON(ctx, "GET", path, nil, strings.TrimSpace(accessToken), &resp); err != nil {
		return CommunityBook{}, err
	}
	if strings.TrimSpace(resp.ID) == "" {
		return CommunityBook{}, fmt.Errorf("invalid community book response")
	}
	return resp, nil
}

func (c *Client) SaveCommunityBook(ctx context.Context, accessToken, libraryBookID string) (UserLibraryBook, error) {
	var resp UserLibraryBook
	path := fmt.Sprintf("/api/v1/community/books/%s/save", strings.TrimSpace(libraryBookID))
	if err := c.doJSON(ctx, "POST", path, struct{}{}, strings.TrimSpace(accessToken), &resp); err != nil {
		return UserLibraryBook{}, err
	}
	if strings.TrimSpace(resp.ID) == "" {
		return UserLibraryBook{}, fmt.Errorf("invalid saved library book response")
	}
	return resp, nil
}

func (c *Client) UpsertReadingState(ctx context.Context, accessToken, libraryBookID, mode string, locator map[string]any, progressPercent float64) error {
	reqBody := struct {
		LocatorJSON     map[string]any `json:"locatorJson"`
		ProgressPercent float64        `json:"progressPercent"`
	}{
		LocatorJSON:     locator,
		ProgressPercent: progressPercent,
	}

	path := fmt.Sprintf("/api/v1/library/books/%s/reading-states/%s", strings.TrimSpace(libraryBookID), strings.TrimSpace(mode))
	return c.doJSON(ctx, "PUT", path, reqBody, strings.TrimSpace(accessToken), nil)
}

func urlQueryEscape(value string) string {
	replacer := strings.NewReplacer(
		"%", "%25",
		" ", "%20",
		"+", "%2B",
		"&", "%26",
		"=", "%3D",
		"?", "%3F",
		"#", "%23",
	)
	return replacer.Replace(value)
}
