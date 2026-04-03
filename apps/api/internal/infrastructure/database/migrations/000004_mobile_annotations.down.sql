DROP INDEX IF EXISTS idx_notes_deleted_at;
DROP INDEX IF EXISTS idx_notes_user_library_book_id;
DROP INDEX IF EXISTS idx_notes_user_id;
DROP TABLE IF EXISTS notes;

DROP INDEX IF EXISTS idx_bookmarks_deleted_at;
DROP INDEX IF EXISTS idx_bookmarks_user_library_book_id;
DROP INDEX IF EXISTS idx_bookmarks_user_id;
DROP TABLE IF EXISTS bookmarks;
