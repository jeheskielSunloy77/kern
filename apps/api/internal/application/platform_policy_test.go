package application

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jeheskielSunloy77/kern/internal/app/errs"
	applicationdto "github.com/jeheskielSunloy77/kern/internal/application/dto"
	"github.com/jeheskielSunloy77/kern/internal/domain"
	"github.com/jeheskielSunloy77/kern/internal/infrastructure/repository"
	internaltesting "github.com/jeheskielSunloy77/kern/internal/testing"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestLibraryServiceUpsertLibraryBook_PublicRequiresPreferredAsset(t *testing.T) {
	testDB, cleanup := internaltesting.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	err := internaltesting.WithRollbackTransaction(ctx, testDB, func(tx *gorm.DB) error {
		require.NoError(t, tx.Create(&domain.User{ID: uuid.New(), Email: "owner@example.com", Username: "owner"}).Error)
		var owner domain.User
		require.NoError(t, tx.First(&owner, "email = ?", "owner@example.com").Error)

		libraryRepo := repository.NewLibraryRepository(tx)
		service := NewLibraryService(libraryRepo, nil)

		catalog := &domain.BookCatalog{
			Title:      "Book One",
			Authors:    "Author",
			SourceType: "user_upload",
		}
		require.NoError(t, libraryRepo.CreateCatalogBook(ctx, catalog))

		_, err := service.UpsertLibraryBook(ctx, owner.ID, applicationdto.CreateLibraryBookInput{
			CatalogBookID: catalog.ID,
			IsPublic:      boolPtr(true),
		})
		require.Error(t, err)

		var httpErr *errs.ErrorResponse
		require.ErrorAs(t, err, &httpErr)
		require.Equal(t, http.StatusBadRequest, httpErr.Status)
		require.Equal(t, "Validation failed", httpErr.Message)
		return nil
	})
	require.NoError(t, err)
}

func TestLibraryServiceBookmarkAndNoteLifecycle(t *testing.T) {
	testDB, cleanup := internaltesting.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	err := internaltesting.WithRollbackTransaction(ctx, testDB, func(tx *gorm.DB) error {
		require.NoError(t, tx.Create(&domain.User{ID: uuid.New(), Email: "reader@example.com", Username: "reader"}).Error)
		var reader domain.User
		require.NoError(t, tx.First(&reader, "email = ?", "reader@example.com").Error)

		libraryRepo := repository.NewLibraryRepository(tx)
		service := NewLibraryService(libraryRepo, nil)

		catalog := &domain.BookCatalog{
			Title:      "Book One",
			Authors:    "Author",
			SourceType: "user_upload",
		}
		require.NoError(t, libraryRepo.CreateCatalogBook(ctx, catalog))

		book, err := service.UpsertLibraryBook(ctx, reader.ID, applicationdto.CreateLibraryBookInput{
			CatalogBookID: catalog.ID,
		})
		require.NoError(t, err)

		bookmark, err := service.CreateBookmark(ctx, reader.ID, book.ID, applicationdto.CreateBookmarkInput{
			Mode:        domain.ReadingModeEPUB,
			LocatorJSON: []byte(`{"cfi":"epubcfi(/6/2[chapter-1])"}`),
		})
		require.NoError(t, err)
		require.NotEqual(t, uuid.Nil, bookmark.ID)

		note, err := service.CreateNote(ctx, reader.ID, book.ID, applicationdto.CreateNoteInput{
			Mode:        domain.ReadingModeEPUB,
			LocatorJSON: []byte(`{"cfi":"epubcfi(/6/2[chapter-1])"}`),
			Content:     "Important passage",
		})
		require.NoError(t, err)
		require.NotEqual(t, uuid.Nil, note.ID)

		visibleBookmarks, err := service.ListBookmarks(ctx, reader.ID, book.ID, false)
		require.NoError(t, err)
		require.Len(t, visibleBookmarks, 1)

		visibleNotes, err := service.ListNotes(ctx, reader.ID, book.ID, false)
		require.NoError(t, err)
		require.Len(t, visibleNotes, 1)

		require.NoError(t, service.DeleteBookmark(ctx, reader.ID, bookmark.ID))
		require.NoError(t, service.DeleteNote(ctx, reader.ID, note.ID))

		visibleBookmarks, err = service.ListBookmarks(ctx, reader.ID, book.ID, false)
		require.NoError(t, err)
		require.Len(t, visibleBookmarks, 0)

		visibleNotes, err = service.ListNotes(ctx, reader.ID, book.ID, false)
		require.NoError(t, err)
		require.Len(t, visibleNotes, 0)

		allBookmarks, err := service.ListBookmarks(ctx, reader.ID, book.ID, true)
		require.NoError(t, err)
		require.Len(t, allBookmarks, 1)
		require.True(t, allBookmarks[0].IsDeleted)

		allNotes, err := service.ListNotes(ctx, reader.ID, book.ID, true)
		require.NoError(t, err)
		require.Len(t, allNotes, 1)
		require.True(t, allNotes[0].IsDeleted)

		return nil
	})
	require.NoError(t, err)
}

func TestLibraryServiceCreateCatalogBook_ReusesChecksumMatch(t *testing.T) {
	testDB, cleanup := internaltesting.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	err := internaltesting.WithRollbackTransaction(ctx, testDB, func(tx *gorm.DB) error {
		libraryRepo := repository.NewLibraryRepository(tx)
		service := NewLibraryService(libraryRepo, nil)

		first, err := service.CreateCatalogBook(ctx, applicationdto.CreateCatalogBookInput{
			Title:   "Book One",
			Authors: "Author",
			Identifiers: map[string]string{
				"checksum": "abc123",
			},
			SourceType: stringPtr("mobile_import"),
		})
		require.NoError(t, err)

		second, err := service.CreateCatalogBook(ctx, applicationdto.CreateCatalogBookInput{
			Title:   "Book One Duplicate",
			Authors: "Another Author",
			Identifiers: map[string]string{
				"checksum": "abc123",
			},
			SourceType: stringPtr("mobile_import"),
		})
		require.NoError(t, err)
		require.Equal(t, first.ID, second.ID)

		var count int64
		require.NoError(t, tx.Model(&domain.BookCatalog{}).Count(&count).Error)
		require.EqualValues(t, 1, count)
		return nil
	})
	require.NoError(t, err)
}

func TestCommunityServiceSaveBook_ClonesOwnedRows(t *testing.T) {
	testDB, cleanup := internaltesting.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	err := internaltesting.WithRollbackTransaction(ctx, testDB, func(tx *gorm.DB) error {
		require.NoError(t, tx.Create(&domain.User{ID: uuid.New(), Email: "owner@example.com", Username: "owner"}).Error)
		require.NoError(t, tx.Create(&domain.User{ID: uuid.New(), Email: "reader@example.com", Username: "reader"}).Error)

		var owner domain.User
		var reader domain.User
		require.NoError(t, tx.First(&owner, "email = ?", "owner@example.com").Error)
		require.NoError(t, tx.First(&reader, "email = ?", "reader@example.com").Error)

		libraryRepo := repository.NewLibraryRepository(tx)
		communityService := NewCommunityService(libraryRepo)

		catalog := &domain.BookCatalog{
			Title:      "Shared Book",
			Authors:    "Author",
			SourceType: "user_upload",
		}
		require.NoError(t, libraryRepo.CreateCatalogBook(ctx, catalog))

		sourceAsset := &domain.BookAsset{
			CatalogBookID:  catalog.ID,
			UploaderUserID: owner.ID,
			StoragePath:    "books/shared.epub",
			MimeType:       "application/epub+zip",
			SizeBytes:      1234,
			Checksum:       "abc123",
			IngestStatus:   domain.BookAssetIngestStatusCompleted,
		}
		require.NoError(t, libraryRepo.CreateBookAsset(ctx, sourceAsset))

		sourceAssetID := sourceAsset.ID
		publicBook, err := libraryRepo.UpsertUserLibraryBook(ctx, &domain.UserLibraryBook{
			UserID:           owner.ID,
			CatalogBookID:    catalog.ID,
			PreferredAssetID: &sourceAssetID,
			State:            domain.UserLibraryBookStateActive,
			IsPublic:         true,
		})
		require.NoError(t, err)

		saved, err := communityService.SaveBook(ctx, reader.ID, publicBook.ID)
		require.NoError(t, err)
		require.Equal(t, reader.ID, saved.UserID)
		require.Equal(t, catalog.ID, saved.CatalogBookID)
		require.NotNil(t, saved.SourceLibraryBookID)
		require.Equal(t, publicBook.ID, *saved.SourceLibraryBookID)
		require.NotNil(t, saved.PreferredAssetID)
		require.False(t, saved.IsPublic)

		clonedAsset, err := libraryRepo.GetBookAssetByID(ctx, *saved.PreferredAssetID)
		require.NoError(t, err)
		require.Equal(t, reader.ID, clonedAsset.UploaderUserID)
		require.NotNil(t, clonedAsset.SourceAssetID)
		require.Equal(t, sourceAsset.ID, *clonedAsset.SourceAssetID)
		require.Equal(t, sourceAsset.StoragePath, clonedAsset.StoragePath)
		return nil
	})
	require.NoError(t, err)
}

func TestCommunityServiceSaveBook_IsIdempotentPerSourceBook(t *testing.T) {
	testDB, cleanup := internaltesting.SetupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	err := internaltesting.WithRollbackTransaction(ctx, testDB, func(tx *gorm.DB) error {
		require.NoError(t, tx.Create(&domain.User{ID: uuid.New(), Email: "owner@example.com", Username: "owner"}).Error)
		require.NoError(t, tx.Create(&domain.User{ID: uuid.New(), Email: "reader@example.com", Username: "reader"}).Error)

		var owner domain.User
		var reader domain.User
		require.NoError(t, tx.First(&owner, "email = ?", "owner@example.com").Error)
		require.NoError(t, tx.First(&reader, "email = ?", "reader@example.com").Error)

		libraryRepo := repository.NewLibraryRepository(tx)
		communityService := NewCommunityService(libraryRepo)

		catalog := &domain.BookCatalog{
			Title:      "Shared Book",
			Authors:    "Author",
			SourceType: "user_upload",
		}
		require.NoError(t, libraryRepo.CreateCatalogBook(ctx, catalog))

		sourceAsset := &domain.BookAsset{
			CatalogBookID:  catalog.ID,
			UploaderUserID: owner.ID,
			StoragePath:    "books/shared.epub",
			MimeType:       "application/epub+zip",
			SizeBytes:      1234,
			Checksum:       "abc123",
			IngestStatus:   domain.BookAssetIngestStatusCompleted,
		}
		require.NoError(t, libraryRepo.CreateBookAsset(ctx, sourceAsset))

		sourceAssetID := sourceAsset.ID
		publicBook, err := libraryRepo.UpsertUserLibraryBook(ctx, &domain.UserLibraryBook{
			UserID:           owner.ID,
			CatalogBookID:    catalog.ID,
			PreferredAssetID: &sourceAssetID,
			State:            domain.UserLibraryBookStateActive,
			IsPublic:         true,
		})
		require.NoError(t, err)

		first, err := communityService.SaveBook(ctx, reader.ID, publicBook.ID)
		require.NoError(t, err)
		second, err := communityService.SaveBook(ctx, reader.ID, publicBook.ID)
		require.NoError(t, err)
		require.Equal(t, first.ID, second.ID)
		return nil
	})
	require.NoError(t, err)
}

func boolPtr(v bool) *bool {
	return &v
}

func stringPtr(v string) *string {
	return &v
}
