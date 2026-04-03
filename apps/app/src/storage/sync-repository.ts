import * as Crypto from 'expo-crypto'
import type { SQLiteDatabase } from 'expo-sqlite'

import type {
	SyncAccountRecord,
	SyncLinkRecord,
	SyncQueueEntity,
	SyncQueueRecord,
} from './models'
import { nowIso, safeJsonParse } from './utils'

type SyncAccountRow = {
	user_id: string
	email: string
	username: string
	last_synced_at: string | null
	created_at: string
	updated_at: string
}

type SyncLinkRow = {
	book_id: string
	remote_catalog_book_id: string | null
	remote_library_book_id: string | null
	matched_by: string
	created_at: string
	updated_at: string
}

type SyncQueueRow = {
	id: string
	entity_type: SyncQueueEntity
	entity_id: string
	action: 'reconcile'
	book_id: string | null
	payload_json: string
	attempts: number
	next_retry_at: string | null
	last_error: string | null
	status: 'pending' | 'failed'
	created_at: string
	updated_at: string
}

export async function upsertSyncAccount(
	db: SQLiteDatabase,
	account: Omit<SyncAccountRecord, 'createdAt' | 'updatedAt' | 'lastSyncedAt'> & {
		lastSyncedAt?: string
	}
) {
	const now = nowIso()
	await db.runAsync(
		`INSERT INTO sync_accounts (
			user_id, email, username, last_synced_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET
			email = excluded.email,
			username = excluded.username,
			last_synced_at = COALESCE(excluded.last_synced_at, sync_accounts.last_synced_at),
			updated_at = excluded.updated_at`,
		account.userId,
		account.email,
		account.username,
		account.lastSyncedAt ?? null,
		now,
		now
	)
}

export async function getSyncAccount(db: SQLiteDatabase) {
	const row = await db.getFirstAsync<SyncAccountRow>(
		`SELECT * FROM sync_accounts ORDER BY updated_at DESC LIMIT 1`
	)
	return row ? mapSyncAccountRow(row) : null
}

export async function clearSyncAccounts(db: SQLiteDatabase) {
	await db.runAsync(`DELETE FROM sync_accounts`)
}

export async function markAccountSynced(
	db: SQLiteDatabase,
	userId: string,
	lastSyncedAt: string
) {
	await db.runAsync(
		`UPDATE sync_accounts SET last_synced_at = ?, updated_at = ? WHERE user_id = ?`,
		lastSyncedAt,
		lastSyncedAt,
		userId
	)
}

export async function upsertSyncLink(
	db: SQLiteDatabase,
	input: Omit<SyncLinkRecord, 'createdAt' | 'updatedAt'>
) {
	const now = nowIso()
	await db.runAsync(
		`INSERT INTO sync_links (
			book_id, remote_catalog_book_id, remote_library_book_id, matched_by, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(book_id) DO UPDATE SET
			remote_catalog_book_id = COALESCE(excluded.remote_catalog_book_id, sync_links.remote_catalog_book_id),
			remote_library_book_id = COALESCE(excluded.remote_library_book_id, sync_links.remote_library_book_id),
			matched_by = excluded.matched_by,
			updated_at = excluded.updated_at`,
		input.bookId,
		input.remoteCatalogBookId ?? null,
		input.remoteLibraryBookId ?? null,
		input.matchedBy,
		now,
		now
	)
}

export async function getSyncLink(db: SQLiteDatabase, bookId: string) {
	const row = await db.getFirstAsync<SyncLinkRow>(
		`SELECT * FROM sync_links WHERE book_id = ?`,
		bookId
	)
	return row ? mapSyncLinkRow(row) : null
}

export async function listSyncLinks(db: SQLiteDatabase) {
	const rows = await db.getAllAsync<SyncLinkRow>(`SELECT * FROM sync_links`)
	return rows.map(mapSyncLinkRow)
}

export async function enqueueSyncItem(
	db: SQLiteDatabase,
	input: {
		entityType: SyncQueueEntity
		entityId: string
		bookId?: string
		payload?: Record<string, unknown>
	}
) {
	const now = nowIso()
	await db.runAsync(
		`INSERT INTO sync_queue (
			id, entity_type, entity_id, action, book_id, payload_json, attempts, status, created_at, updated_at
		) VALUES (?, ?, ?, 'reconcile', ?, ?, 0, 'pending', ?, ?)
		ON CONFLICT(entity_type, entity_id) DO UPDATE SET
			book_id = excluded.book_id,
			payload_json = excluded.payload_json,
			status = 'pending',
			last_error = NULL,
			next_retry_at = NULL,
			updated_at = excluded.updated_at`,
		Crypto.randomUUID(),
		input.entityType,
		input.entityId,
		input.bookId ?? null,
		JSON.stringify(input.payload ?? {}),
		now,
		now
	)
}

export async function listPendingSyncItems(db: SQLiteDatabase) {
	const rows = await db.getAllAsync<SyncQueueRow>(
		`SELECT * FROM sync_queue
		 WHERE status = 'pending'
		 ORDER BY updated_at ASC`
	)
	return rows.map(mapSyncQueueRow)
}

export async function failSyncItem(
	db: SQLiteDatabase,
	id: string,
	errorMessage: string
) {
	const now = nowIso()
	await db.runAsync(
		`UPDATE sync_queue
		 SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ?
		 WHERE id = ?`,
		errorMessage,
		now,
		id
	)
}

export async function completeSyncItem(db: SQLiteDatabase, id: string) {
	await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, id)
}

export function mapSyncAccountRow(row: SyncAccountRow): SyncAccountRecord {
	return {
		userId: row.user_id,
		email: row.email,
		username: row.username,
		lastSyncedAt: row.last_synced_at ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function mapSyncLinkRow(row: SyncLinkRow): SyncLinkRecord {
	return {
		bookId: row.book_id,
		remoteCatalogBookId: row.remote_catalog_book_id ?? undefined,
		remoteLibraryBookId: row.remote_library_book_id ?? undefined,
		matchedBy: row.matched_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function mapSyncQueueRow(row: SyncQueueRow): SyncQueueRecord {
	return {
		id: row.id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		action: row.action,
		bookId: row.book_id ?? undefined,
		payload: safeJsonParse(row.payload_json, {}),
		attempts: row.attempts,
		nextRetryAt: row.next_retry_at ?? undefined,
		lastError: row.last_error ?? undefined,
		status: row.status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}
