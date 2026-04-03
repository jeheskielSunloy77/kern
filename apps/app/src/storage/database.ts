import type { SQLiteDatabase } from 'expo-sqlite'

export const DATABASE_NAME = 'kern-mobile.db'

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS books (
	id TEXT PRIMARY KEY NOT NULL,
	checksum TEXT NOT NULL UNIQUE,
	file_uri TEXT NOT NULL,
	file_name TEXT NOT NULL,
	title TEXT NOT NULL,
	authors TEXT NOT NULL DEFAULT '',
	language TEXT,
	description TEXT,
	publisher TEXT,
	cover_uri TEXT,
	identifiers_json TEXT NOT NULL DEFAULT '{}',
	toc_json TEXT NOT NULL DEFAULT '[]',
	import_status TEXT NOT NULL DEFAULT 'ready',
	last_opened_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_states (
	book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	locator_json TEXT NOT NULL DEFAULT '{}',
	progress_percent REAL NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL,
	remote_version INTEGER,
	remote_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS bookmarks (
	id TEXT PRIMARY KEY NOT NULL,
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	locator_json TEXT NOT NULL DEFAULT '{}',
	label TEXT,
	remote_id TEXT,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	synced_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS highlights (
	id TEXT PRIMARY KEY NOT NULL,
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	locator_json TEXT NOT NULL DEFAULT '{}',
	excerpt TEXT,
	color TEXT NOT NULL DEFAULT '#ead488',
	remote_id TEXT,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	synced_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
	id TEXT PRIMARY KEY NOT NULL,
	book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	locator_json TEXT NOT NULL DEFAULT '{}',
	excerpt TEXT,
	content TEXT NOT NULL,
	remote_id TEXT,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	synced_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS reader_preferences (
	book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	theme TEXT NOT NULL DEFAULT 'paper',
	font_scale INTEGER NOT NULL DEFAULT 100,
	line_height INTEGER NOT NULL DEFAULT 150,
	margin INTEGER NOT NULL DEFAULT 16,
	font_family TEXT NOT NULL DEFAULT 'serif',
	flow TEXT NOT NULL DEFAULT 'paginated',
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_accounts (
	user_id TEXT PRIMARY KEY NOT NULL,
	email TEXT NOT NULL,
	username TEXT NOT NULL,
	last_synced_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_links (
	book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	remote_catalog_book_id TEXT,
	remote_library_book_id TEXT,
	matched_by TEXT NOT NULL DEFAULT 'checksum',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
	id TEXT PRIMARY KEY NOT NULL,
	entity_type TEXT NOT NULL,
	entity_id TEXT NOT NULL,
	action TEXT NOT NULL,
	book_id TEXT,
	payload_json TEXT NOT NULL DEFAULT '{}',
	attempts INTEGER NOT NULL DEFAULT 0,
	next_retry_at TEXT,
	last_error TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_entity_action_idx
ON sync_queue(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS books_last_opened_idx ON books(last_opened_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_book_idx ON bookmarks(book_id, is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS highlights_book_idx ON highlights(book_id, is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_book_idx ON notes(book_id, is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS sync_queue_status_idx ON sync_queue(status, updated_at ASC);

CREATE VIRTUAL TABLE IF NOT EXISTS book_search_index
USING fts5(book_id UNINDEXED, section_href UNINDEXED, content);
`

export async function initializeDatabase(db: SQLiteDatabase) {
	await db.execAsync(schema)
}
