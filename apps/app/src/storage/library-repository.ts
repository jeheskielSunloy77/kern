import * as Crypto from 'expo-crypto'
import type { SQLiteDatabase } from 'expo-sqlite'

import type {
	BookRecord,
	BookmarkRecord,
	HighlightRecord,
	NoteRecord,
	ReaderLocator,
	ReaderPreferenceRecord,
	ReadingStateRecord,
} from './models'
import {
	clamp,
	fromSqliteBool,
	getLocatorCfi,
	nowIso,
	safeJsonParse,
	toSqliteBool,
} from './utils'

type BookRow = {
	id: string
	checksum: string
	file_uri: string
	file_name: string
	title: string
	authors: string
	language: string | null
	description: string | null
	publisher: string | null
	cover_uri: string | null
	identifiers_json: string
	toc_json: string
	import_status: 'ready' | 'failed'
	last_opened_at: string | null
	created_at: string
	updated_at: string
}

type ReadingStateRow = {
	book_id: string
	locator_json: string
	progress_percent: number
	updated_at: string
	remote_version: number | null
	remote_updated_at: string | null
}

type AnnotationRow = {
	id: string
	book_id: string
	locator_json: string
	label?: string | null
	excerpt?: string | null
	content?: string | null
	color?: string | null
	remote_id: string | null
	is_deleted: number
	synced_at: string | null
	created_at: string
	updated_at: string
	deleted_at: string | null
}

type ReaderPreferenceRow = {
	book_id: string
	theme: ReaderPreferenceRecord['theme']
	font_scale: number
	line_height: number
	margin: number
	font_family: ReaderPreferenceRecord['fontFamily']
	flow: ReaderPreferenceRecord['flow']
	updated_at: string
}

export async function listBooks(db: SQLiteDatabase) {
	const rows = await db.getAllAsync<BookRow>(
		`SELECT * FROM books ORDER BY COALESCE(last_opened_at, created_at) DESC`
	)
	return rows.map(mapBookRow)
}

export async function getBookById(db: SQLiteDatabase, id: string) {
	const row = await db.getFirstAsync<BookRow>(`SELECT * FROM books WHERE id = ?`, id)
	return row ? mapBookRow(row) : null
}

export async function getBookByChecksum(db: SQLiteDatabase, checksum: string) {
	const row = await db.getFirstAsync<BookRow>(
		`SELECT * FROM books WHERE checksum = ?`,
		checksum
	)
	return row ? mapBookRow(row) : null
}

export async function createBook(
	db: SQLiteDatabase,
	input: Omit<BookRecord, 'lastOpenedAt'>
) {
	await db.runAsync(
		`INSERT INTO books (
			id, checksum, file_uri, file_name, title, authors, language, description,
			publisher, cover_uri, identifiers_json, toc_json, import_status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.id,
		input.checksum,
		input.fileUri,
		input.fileName,
		input.title,
		input.authors,
		input.language ?? null,
		input.description ?? null,
		input.publisher ?? null,
		input.coverUri ?? null,
		JSON.stringify(input.identifiers),
		JSON.stringify(input.toc),
		input.importStatus,
		input.createdAt,
		input.updatedAt
	)
	return input
}

export async function touchBookOpenedAt(db: SQLiteDatabase, bookId: string) {
	const timestamp = nowIso()
	await db.runAsync(
		`UPDATE books SET last_opened_at = ?, updated_at = ? WHERE id = ?`,
		timestamp,
		timestamp,
		bookId
	)
}

export async function storeSearchIndex(
	db: SQLiteDatabase,
	bookId: string,
	sections: Array<{ href: string; content: string }>
) {
	await db.runAsync(`DELETE FROM book_search_index WHERE book_id = ?`, bookId)
	for (const section of sections) {
		await db.runAsync(
			`INSERT INTO book_search_index (book_id, section_href, content) VALUES (?, ?, ?)`,
			bookId,
			section.href,
			section.content
		)
	}
}

export async function searchBookIndex(
	db: SQLiteDatabase,
	bookId: string,
	query: string
) {
	const term = query.trim()
	if (!term) {
		return []
	}

	return db.getAllAsync<{ section_href: string; content: string }>(
		`SELECT section_href, snippet(book_search_index, 2, '[', ']', ' ... ', 8) AS content
		 FROM book_search_index
		 WHERE book_search_index MATCH ? AND book_id = ?`,
		term.replace(/\s+/g, ' '),
		bookId
	)
}

export async function getReadingState(db: SQLiteDatabase, bookId: string) {
	const row = await db.getFirstAsync<ReadingStateRow>(
		`SELECT * FROM reading_states WHERE book_id = ?`,
		bookId
	)
	return row ? mapReadingStateRow(row) : null
}

export async function saveReadingState(
	db: SQLiteDatabase,
	bookId: string,
	locator: ReaderLocator,
	progressPercent: number
) {
	const updatedAt = nowIso()
	const current = await getReadingState(db, bookId)
	await db.runAsync(
		`INSERT INTO reading_states (
			book_id, locator_json, progress_percent, updated_at, remote_version, remote_updated_at
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(book_id) DO UPDATE SET
			locator_json = excluded.locator_json,
			progress_percent = excluded.progress_percent,
			updated_at = excluded.updated_at,
			remote_version = reading_states.remote_version,
			remote_updated_at = reading_states.remote_updated_at`,
		bookId,
		JSON.stringify(locator),
		clamp(progressPercent, 0, 100),
		updatedAt,
		current?.remoteVersion ?? null,
		current?.remoteUpdatedAt ?? null
	)
	return getReadingState(db, bookId)
}

export async function saveRemoteReadingMetadata(
	db: SQLiteDatabase,
	bookId: string,
	remoteVersion: number,
	remoteUpdatedAt: string
) {
	await db.runAsync(
		`UPDATE reading_states
		 SET remote_version = ?, remote_updated_at = ?, updated_at = updated_at
		 WHERE book_id = ?`,
		remoteVersion,
		remoteUpdatedAt,
		bookId
	)
}

export async function applyRemoteReadingState(
	db: SQLiteDatabase,
	bookId: string,
	locator: ReaderLocator,
	progressPercent: number,
	remoteVersion: number,
	remoteUpdatedAt: string
) {
	await db.runAsync(
		`INSERT INTO reading_states (
			book_id, locator_json, progress_percent, updated_at, remote_version, remote_updated_at
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(book_id) DO UPDATE SET
			locator_json = excluded.locator_json,
			progress_percent = excluded.progress_percent,
			updated_at = excluded.updated_at,
			remote_version = excluded.remote_version,
			remote_updated_at = excluded.remote_updated_at`,
		bookId,
		JSON.stringify(locator),
		clamp(progressPercent, 0, 100),
		remoteUpdatedAt,
		remoteVersion,
		remoteUpdatedAt
	)
}

export async function listBookmarks(db: SQLiteDatabase, bookId: string) {
	const rows = await db.getAllAsync<AnnotationRow>(
		`SELECT * FROM bookmarks WHERE book_id = ? ORDER BY updated_at DESC`,
		bookId
	)
	return rows.map(mapBookmarkRow)
}

export async function createBookmark(
	db: SQLiteDatabase,
	input: {
		bookId: string
		locator: ReaderLocator
		label?: string
		remoteId?: string
		syncedAt?: string
	}
) {
	const id = Crypto.randomUUID()
	const createdAt = nowIso()
	await db.runAsync(
		`INSERT INTO bookmarks (
			id, book_id, locator_json, label, remote_id, is_deleted, synced_at, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL)`,
		id,
		input.bookId,
		JSON.stringify(input.locator),
		input.label ?? null,
		input.remoteId ?? null,
		input.syncedAt ?? null,
		createdAt,
		createdAt
	)
	return getBookmarkById(db, id)
}

export async function getBookmarkById(db: SQLiteDatabase, id: string) {
	const row = await db.getFirstAsync<AnnotationRow>(
		`SELECT * FROM bookmarks WHERE id = ?`,
		id
	)
	return row ? mapBookmarkRow(row) : null
}

export async function markBookmarkDeleted(db: SQLiteDatabase, id: string) {
	const deletedAt = nowIso()
	await db.runAsync(
		`UPDATE bookmarks
		 SET is_deleted = 1, deleted_at = ?, updated_at = ?
		 WHERE id = ?`,
		deletedAt,
		deletedAt,
		id
	)
}

export async function restoreBookmarkRemoteLink(
	db: SQLiteDatabase,
	id: string,
	remoteId: string,
	syncedAt: string
) {
	await db.runAsync(
		`UPDATE bookmarks
		 SET remote_id = ?, synced_at = ?, updated_at = updated_at
		 WHERE id = ?`,
		remoteId,
		syncedAt,
		id
	)
}

export async function listHighlights(db: SQLiteDatabase, bookId: string) {
	const rows = await db.getAllAsync<AnnotationRow>(
		`SELECT * FROM highlights WHERE book_id = ? ORDER BY updated_at DESC`,
		bookId
	)
	return rows.map(mapHighlightRow)
}

export async function getHighlightById(db: SQLiteDatabase, id: string) {
	const row = await db.getFirstAsync<AnnotationRow>(
		`SELECT * FROM highlights WHERE id = ?`,
		id
	)
	return row ? mapHighlightRow(row) : null
}

export async function createHighlight(
	db: SQLiteDatabase,
	input: {
		bookId: string
		locator: ReaderLocator
		excerpt?: string
		color?: string
		remoteId?: string
		syncedAt?: string
	}
) {
	const id = Crypto.randomUUID()
	const createdAt = nowIso()
	await db.runAsync(
		`INSERT INTO highlights (
			id, book_id, locator_json, excerpt, color, remote_id, is_deleted, synced_at, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL)`,
		id,
		input.bookId,
		JSON.stringify(input.locator),
		input.excerpt ?? null,
		input.color ?? '#ead488',
		input.remoteId ?? null,
		input.syncedAt ?? null,
		createdAt,
		createdAt
	)
	return getHighlightById(db, id)
}

export async function markHighlightDeleted(db: SQLiteDatabase, id: string) {
	const deletedAt = nowIso()
	await db.runAsync(
		`UPDATE highlights
		 SET is_deleted = 1, deleted_at = ?, updated_at = ?
		 WHERE id = ?`,
		deletedAt,
		deletedAt,
		id
	)
}

export async function setHighlightRemoteLink(
	db: SQLiteDatabase,
	id: string,
	remoteId: string,
	syncedAt: string
) {
	await db.runAsync(
		`UPDATE highlights
		 SET remote_id = ?, synced_at = ?, updated_at = updated_at
		 WHERE id = ?`,
		remoteId,
		syncedAt,
		id
	)
}

export async function listNotes(db: SQLiteDatabase, bookId: string) {
	const rows = await db.getAllAsync<AnnotationRow>(
		`SELECT * FROM notes WHERE book_id = ? ORDER BY updated_at DESC`,
		bookId
	)
	return rows.map(mapNoteRow)
}

export async function getNoteById(db: SQLiteDatabase, id: string) {
	const row = await db.getFirstAsync<AnnotationRow>(
		`SELECT * FROM notes WHERE id = ?`,
		id
	)
	return row ? mapNoteRow(row) : null
}

export async function createNote(
	db: SQLiteDatabase,
	input: {
		bookId: string
		locator: ReaderLocator
		excerpt?: string
		content: string
		remoteId?: string
		syncedAt?: string
	}
) {
	const id = Crypto.randomUUID()
	const createdAt = nowIso()
	await db.runAsync(
		`INSERT INTO notes (
			id, book_id, locator_json, excerpt, content, remote_id, is_deleted, synced_at, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL)`,
		id,
		input.bookId,
		JSON.stringify(input.locator),
		input.excerpt ?? null,
		input.content.trim(),
		input.remoteId ?? null,
		input.syncedAt ?? null,
		createdAt,
		createdAt
	)
	return getNoteById(db, id)
}

export async function updateNoteContent(
	db: SQLiteDatabase,
	id: string,
	content: string
) {
	const updatedAt = nowIso()
	await db.runAsync(
		`UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`,
		content.trim(),
		updatedAt,
		id
	)
	return getNoteById(db, id)
}

export async function markNoteDeleted(db: SQLiteDatabase, id: string) {
	const deletedAt = nowIso()
	await db.runAsync(
		`UPDATE notes
		 SET is_deleted = 1, deleted_at = ?, updated_at = ?
		 WHERE id = ?`,
		deletedAt,
		deletedAt,
		id
	)
}

export async function setNoteRemoteLink(
	db: SQLiteDatabase,
	id: string,
	remoteId: string,
	syncedAt: string
) {
	await db.runAsync(
		`UPDATE notes
		 SET remote_id = ?, synced_at = ?, updated_at = updated_at
		 WHERE id = ?`,
		remoteId,
		syncedAt,
		id
	)
}

export async function getReaderPreferences(db: SQLiteDatabase, bookId: string) {
	const row = await db.getFirstAsync<ReaderPreferenceRow>(
		`SELECT * FROM reader_preferences WHERE book_id = ?`,
		bookId
	)
	if (row) {
		return mapReaderPreferenceRow(row)
	}

	const defaults: ReaderPreferenceRecord = {
		bookId,
		theme: 'paper',
		fontScale: 100,
		lineHeight: 150,
		margin: 16,
		fontFamily: 'serif',
		flow: 'paginated',
		updatedAt: nowIso(),
	}
	await saveReaderPreferences(db, defaults)
	return defaults
}

export async function saveReaderPreferences(
	db: SQLiteDatabase,
	input: ReaderPreferenceRecord
) {
	await db.runAsync(
		`INSERT INTO reader_preferences (
			book_id, theme, font_scale, line_height, margin, font_family, flow, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(book_id) DO UPDATE SET
			theme = excluded.theme,
			font_scale = excluded.font_scale,
			line_height = excluded.line_height,
			margin = excluded.margin,
			font_family = excluded.font_family,
			flow = excluded.flow,
			updated_at = excluded.updated_at`,
		input.bookId,
		input.theme,
		input.fontScale,
		input.lineHeight,
		input.margin,
		input.fontFamily,
		input.flow,
		input.updatedAt
	)
	return input
}

export function mapBookRow(row: BookRow): BookRecord {
	return {
		id: row.id,
		checksum: row.checksum,
		fileUri: row.file_uri,
		fileName: row.file_name,
		title: row.title,
		authors: row.authors,
		language: row.language ?? undefined,
		description: row.description ?? undefined,
		publisher: row.publisher ?? undefined,
		coverUri: row.cover_uri ?? undefined,
		identifiers: safeJsonParse(row.identifiers_json, {}),
		toc: safeJsonParse(row.toc_json, []),
		importStatus: row.import_status,
		lastOpenedAt: row.last_opened_at ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function mapReadingStateRow(row: ReadingStateRow): ReadingStateRecord {
	return {
		bookId: row.book_id,
		locator: safeJsonParse(row.locator_json, {}),
		progressPercent: row.progress_percent,
		updatedAt: row.updated_at,
		remoteVersion: row.remote_version ?? undefined,
		remoteUpdatedAt: row.remote_updated_at ?? undefined,
	}
}

function mapBookmarkRow(row: AnnotationRow): BookmarkRecord {
	return {
		id: row.id,
		bookId: row.book_id,
		locator: safeJsonParse(row.locator_json, {}),
		label: row.label ?? undefined,
		remoteId: row.remote_id ?? undefined,
		isDeleted: fromSqliteBool(row.is_deleted),
		syncedAt: row.synced_at ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		deletedAt: row.deleted_at ?? undefined,
	}
}

function mapHighlightRow(row: AnnotationRow): HighlightRecord {
	return {
		id: row.id,
		bookId: row.book_id,
		locator: safeJsonParse(row.locator_json, {}),
		excerpt: row.excerpt ?? undefined,
		color: row.color ?? '#ead488',
		remoteId: row.remote_id ?? undefined,
		isDeleted: fromSqliteBool(row.is_deleted),
		syncedAt: row.synced_at ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		deletedAt: row.deleted_at ?? undefined,
	}
}

function mapNoteRow(row: AnnotationRow): NoteRecord {
	return {
		id: row.id,
		bookId: row.book_id,
		locator: safeJsonParse(row.locator_json, {}),
		excerpt: row.excerpt ?? undefined,
		content: row.content ?? '',
		remoteId: row.remote_id ?? undefined,
		isDeleted: fromSqliteBool(row.is_deleted),
		syncedAt: row.synced_at ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		deletedAt: row.deleted_at ?? undefined,
	}
}

function mapReaderPreferenceRow(
	row: ReaderPreferenceRow
): ReaderPreferenceRecord {
	return {
		bookId: row.book_id,
		theme: row.theme,
		fontScale: row.font_scale,
		lineHeight: row.line_height,
		margin: row.margin,
		fontFamily: row.font_family,
		flow: row.flow,
		updatedAt: row.updated_at,
	}
}

export function isCurrentPageBookmarked(
	bookmarks: BookmarkRecord[],
	locator: Record<string, unknown> | null | undefined
) {
	const currentCfi = getLocatorCfi(locator)
	if (!currentCfi) {
		return false
	}

	return bookmarks.some(
		(bookmark) => !bookmark.isDeleted && getLocatorCfi(bookmark.locator) === currentCfi
	)
}

export async function syncBookmarkFromRemote(
	db: SQLiteDatabase,
	bookId: string,
	payload: {
		id: string
		locator: ReaderLocator
		label?: string
		isDeleted: boolean
		updatedAt: string
		createdAt: string
	}
) {
	const existing = await db.getFirstAsync<AnnotationRow>(
		`SELECT * FROM bookmarks WHERE remote_id = ?`,
		payload.id
	)
	const deletedAt = payload.isDeleted ? payload.updatedAt : null

	if (existing) {
		await db.runAsync(
			`UPDATE bookmarks SET
				book_id = ?, locator_json = ?, label = ?, is_deleted = ?, synced_at = ?,
				updated_at = ?, deleted_at = ?
			 WHERE remote_id = ?`,
			bookId,
			JSON.stringify(payload.locator),
			payload.label ?? null,
			toSqliteBool(payload.isDeleted),
			payload.updatedAt,
			payload.updatedAt,
			deletedAt,
			payload.id
		)
		return
	}

	await db.runAsync(
		`INSERT INTO bookmarks (
			id, book_id, locator_json, label, remote_id, is_deleted, synced_at, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		Crypto.randomUUID(),
		bookId,
		JSON.stringify(payload.locator),
		payload.label ?? null,
		payload.id,
		toSqliteBool(payload.isDeleted),
		payload.updatedAt,
		payload.createdAt,
		payload.updatedAt,
		deletedAt
	)
}

export async function syncHighlightFromRemote(
	db: SQLiteDatabase,
	bookId: string,
	payload: {
		id: string
		locator: ReaderLocator
		excerpt?: string
		isDeleted: boolean
		updatedAt: string
		createdAt: string
	}
) {
	const existing = await db.getFirstAsync<AnnotationRow>(
		`SELECT * FROM highlights WHERE remote_id = ?`,
		payload.id
	)
	const deletedAt = payload.isDeleted ? payload.updatedAt : null

	if (existing) {
		await db.runAsync(
			`UPDATE highlights SET
				book_id = ?, locator_json = ?, excerpt = ?, is_deleted = ?, synced_at = ?,
				updated_at = ?, deleted_at = ?
			 WHERE remote_id = ?`,
			bookId,
			JSON.stringify(payload.locator),
			payload.excerpt ?? null,
			toSqliteBool(payload.isDeleted),
			payload.updatedAt,
			payload.updatedAt,
			deletedAt,
			payload.id
		)
		return
	}

	await db.runAsync(
		`INSERT INTO highlights (
			id, book_id, locator_json, excerpt, color, remote_id, is_deleted, synced_at, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		Crypto.randomUUID(),
		bookId,
		JSON.stringify(payload.locator),
		payload.excerpt ?? null,
		'#ead488',
		payload.id,
		toSqliteBool(payload.isDeleted),
		payload.updatedAt,
		payload.createdAt,
		payload.updatedAt,
		deletedAt
	)
}

export async function syncNoteFromRemote(
	db: SQLiteDatabase,
	bookId: string,
	payload: {
		id: string
		locator: ReaderLocator
		excerpt?: string
		content: string
		isDeleted: boolean
		updatedAt: string
		createdAt: string
	}
) {
	const existing = await db.getFirstAsync<AnnotationRow>(
		`SELECT * FROM notes WHERE remote_id = ?`,
		payload.id
	)
	const deletedAt = payload.isDeleted ? payload.updatedAt : null

	if (existing) {
		await db.runAsync(
			`UPDATE notes SET
				book_id = ?, locator_json = ?, excerpt = ?, content = ?, is_deleted = ?, synced_at = ?,
				updated_at = ?, deleted_at = ?
			 WHERE remote_id = ?`,
			bookId,
			JSON.stringify(payload.locator),
			payload.excerpt ?? null,
			payload.content,
			toSqliteBool(payload.isDeleted),
			payload.updatedAt,
			payload.updatedAt,
			deletedAt,
			payload.id
		)
		return
	}

	await db.runAsync(
		`INSERT INTO notes (
			id, book_id, locator_json, excerpt, content, remote_id, is_deleted, synced_at, created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		Crypto.randomUUID(),
		bookId,
		JSON.stringify(payload.locator),
		payload.excerpt ?? null,
		payload.content,
		payload.id,
		toSqliteBool(payload.isDeleted),
		payload.updatedAt,
		payload.createdAt,
		payload.updatedAt,
		deletedAt
	)
}
