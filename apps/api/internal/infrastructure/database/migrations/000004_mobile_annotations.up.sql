CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_library_book_id UUID NOT NULL REFERENCES user_library_books(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    locator_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    label TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (mode IN ('epub'))
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks (user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_library_book_id ON bookmarks (user_library_book_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_deleted_at ON bookmarks (deleted_at);

CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_library_book_id UUID NOT NULL REFERENCES user_library_books(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    locator_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    excerpt TEXT,
    content TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (mode IN ('epub'))
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_library_book_id ON notes (user_library_book_id);
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes (deleted_at);
