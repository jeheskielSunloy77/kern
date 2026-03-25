import type { SQLiteDatabase } from 'expo-sqlite'

import { api, ApiError, explainApiError, isNotFoundError } from '../data/api'
import type {
	ApiBookmark,
	ApiHighlight,
	ApiNote,
	ApiReadingState,
} from '../data/types'
import { useSessionStore } from '../state/session-store'
import {
	applyRemoteReadingState,
	getBookById,
	getBookmarkById,
	getHighlightById,
	getNoteById,
	getReadingState,
	listBooks,
	listBookmarks as listLocalBookmarks,
	listHighlights as listLocalHighlights,
	listNotes as listLocalNotes,
	restoreBookmarkRemoteLink,
	saveRemoteReadingMetadata,
	setHighlightRemoteLink,
	setNoteRemoteLink,
	syncBookmarkFromRemote,
	syncHighlightFromRemote,
	syncNoteFromRemote,
} from '../storage/library-repository'
import {
	completeSyncItem,
} from '../storage/sync-repository'
import {
	clearSyncAccounts,
	failSyncItem,
	getSyncLink,
	listPendingSyncItems,
	listSyncLinks,
	markAccountSynced,
	upsertSyncAccount,
	upsertSyncLink,
} from '../storage/sync-repository'
import { nowIso } from '../storage/utils'
import { chooseReadingStateWinner, shouldApplyRemoteAnnotation } from './merge'

let syncInFlight = false

export async function runSync(db: SQLiteDatabase, reason = 'manual') {
	const session = useSessionStore.getState().session
	if (!session || syncInFlight) {
		return
	}

	syncInFlight = true
	useSessionStore
		.getState()
		.setSyncStatus({ phase: 'running', message: `Syncing after ${reason}...` })

	try {
		await upsertSyncAccount(db, {
			userId: session.user.id,
			email: session.user.email,
			username: session.user.username,
		})

		const books = await listBooks(db)
		for (const book of books) {
			await ensureRemoteLink(db, book.id)
		}

		let firstError: string | null = null
		const queue = await listPendingSyncItems(db)
		for (const item of queue) {
			try {
				await processQueueItem(db, item)
				await completeSyncItem(db, item.id)
			} catch (error) {
				const message = explainApiError(error)
				firstError = firstError ?? message
				await failSyncItem(db, item.id, message)
			}
		}

		const links = await listSyncLinks(db)
		const pendingAfterPush = await listPendingSyncItems(db)
		const pendingIds = new Set(pendingAfterPush.map((item) => item.entityId))

		for (const link of links) {
			if (!link.remoteLibraryBookId) {
				continue
			}
			try {
				await pullBook(db, link.bookId, link.remoteLibraryBookId, pendingIds)
			} catch (error) {
				firstError = firstError ?? explainApiError(error)
			}
		}

		const finishedAt = nowIso()
		await markAccountSynced(db, session.user.id, finishedAt)

		useSessionStore.getState().setSyncStatus(
			firstError
				? {
						phase: 'error',
						message: firstError,
						lastFinishedAt: finishedAt,
				  }
				: {
						phase: 'success',
						message: `Library synced across ${books.length} local books.`,
						lastFinishedAt: finishedAt,
				  }
		)
	} catch (error) {
		useSessionStore.getState().setSyncStatus({
			phase: 'error',
			message: explainApiError(error),
			lastFinishedAt: nowIso(),
		})
		if (error instanceof ApiError && error.status === 401) {
			await clearSyncAccounts(db)
		}
	} finally {
		syncInFlight = false
	}
}

async function ensureRemoteLink(db: SQLiteDatabase, bookId: string) {
	const existingLink = await getSyncLink(db, bookId)
	if (existingLink?.remoteLibraryBookId) {
		return existingLink
	}

	const book = await getBookById(db, bookId)
	if (!book) {
		throw new Error('The local book could not be found for sync.')
	}

	const catalog = await api.createCatalogBook({
		title: book.title,
		authors: book.authors,
		identifiers: {
			...book.identifiers,
			checksum: book.checksum,
		},
		language: book.language,
		sourceType: 'mobile_import',
	})
	const libraryBook = await api.upsertLibraryBook({
		catalogBookId: catalog.id,
	})

	await upsertSyncLink(db, {
		bookId,
		remoteCatalogBookId: catalog.id,
		remoteLibraryBookId: libraryBook.id,
		matchedBy: 'checksum',
	})

	return getSyncLink(db, bookId)
}

async function processQueueItem(
	db: SQLiteDatabase,
	item: Awaited<ReturnType<typeof listPendingSyncItems>>[number]
) {
	switch (item.entityType) {
		case 'reading_state':
			await pushReadingState(db, item.bookId ?? item.entityId)
			return
		case 'bookmark':
			await pushBookmark(db, item.entityId)
			return
		case 'highlight':
			await pushHighlight(db, item.entityId)
			return
		case 'note':
			await pushNote(db, item.entityId)
			return
		default:
			return
	}
}

async function pushReadingState(db: SQLiteDatabase, bookId: string) {
	const link = await ensureRemoteLink(db, bookId)
	if (!link?.remoteLibraryBookId) {
		return
	}

	const state = await getReadingState(db, bookId)
	if (!state) {
		return
	}

	try {
		const remote = await api.upsertReadingState(link.remoteLibraryBookId, {
			locatorJson: state.locator,
			progressPercent: state.progressPercent,
			ifMatchVersion: state.remoteVersion,
		})
		await saveRemoteReadingMetadata(
			db,
			bookId,
			remote.version,
			remote.updatedAt
		)
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 409) {
			throw error
		}

		const remote = await api.getReadingState(link.remoteLibraryBookId)
		const winner = chooseReadingStateWinner(state, remote)
		if (winner === 'remote') {
			await applyRemoteReadingState(
				db,
				bookId,
				remote.locatorJson,
				remote.progressPercent,
				remote.version,
				remote.updatedAt
			)
			return
		}

		const updated = await api.upsertReadingState(link.remoteLibraryBookId, {
			locatorJson: state.locator,
			progressPercent: state.progressPercent,
			ifMatchVersion: remote.version,
		})
		await saveRemoteReadingMetadata(
			db,
			bookId,
			updated.version,
			updated.updatedAt
		)
	}
}

async function pushBookmark(db: SQLiteDatabase, bookmarkId: string) {
	const bookmark = await getBookmarkById(db, bookmarkId)
	if (!bookmark) {
		return
	}

	const link = await ensureRemoteLink(db, bookmark.bookId)
	if (!link?.remoteLibraryBookId) {
		return
	}

	if (bookmark.remoteId) {
		if (bookmark.isDeleted) {
			await api.deleteBookmark(bookmark.remoteId)
			await restoreBookmarkRemoteLink(
				db,
				bookmark.id,
				bookmark.remoteId,
				nowIso()
			)
			return
		}

		const updated = await api.updateBookmark(bookmark.remoteId, {
			locatorJson: bookmark.locator,
			label: bookmark.label,
		})
		await restoreBookmarkRemoteLink(
			db,
			bookmark.id,
			updated.id,
			updated.updatedAt
		)
		return
	}

	if (bookmark.isDeleted) {
		return
	}

	const created = await api.createBookmark(link.remoteLibraryBookId, {
		locatorJson: bookmark.locator,
		label: bookmark.label,
	})
	await restoreBookmarkRemoteLink(db, bookmark.id, created.id, created.updatedAt)
}

async function pushHighlight(db: SQLiteDatabase, highlightId: string) {
	const highlight = await getHighlightById(db, highlightId)
	if (!highlight) {
		return
	}

	const link = await ensureRemoteLink(db, highlight.bookId)
	if (!link?.remoteLibraryBookId) {
		return
	}

	if (highlight.remoteId) {
		if (highlight.isDeleted) {
			await api.deleteHighlight(highlight.remoteId)
			await setHighlightRemoteLink(db, highlight.id, highlight.remoteId, nowIso())
			return
		}

		const updated = await api.updateHighlight(highlight.remoteId, {
			locatorJson: highlight.locator,
			excerpt: highlight.excerpt,
		})
		await setHighlightRemoteLink(db, highlight.id, updated.id, updated.updatedAt)
		return
	}

	if (highlight.isDeleted) {
		return
	}

	const created = await api.createHighlight(link.remoteLibraryBookId, {
		locatorJson: highlight.locator,
		excerpt: highlight.excerpt,
	})
	await setHighlightRemoteLink(db, highlight.id, created.id, created.updatedAt)
}

async function pushNote(db: SQLiteDatabase, noteId: string) {
	const note = await getNoteById(db, noteId)
	if (!note) {
		return
	}

	const link = await ensureRemoteLink(db, note.bookId)
	if (!link?.remoteLibraryBookId) {
		return
	}

	if (note.remoteId) {
		if (note.isDeleted) {
			await api.deleteNote(note.remoteId)
			await setNoteRemoteLink(db, note.id, note.remoteId, nowIso())
			return
		}

		const updated = await api.updateNote(note.remoteId, {
			locatorJson: note.locator,
			excerpt: note.excerpt,
			content: note.content,
		})
		await setNoteRemoteLink(db, note.id, updated.id, updated.updatedAt)
		return
	}

	if (note.isDeleted) {
		return
	}

	const created = await api.createNote(link.remoteLibraryBookId, {
		locatorJson: note.locator,
		excerpt: note.excerpt,
		content: note.content,
	})
	await setNoteRemoteLink(db, note.id, created.id, created.updatedAt)
}

async function pullBook(
	db: SQLiteDatabase,
	bookId: string,
	remoteLibraryBookId: string,
	pendingEntityIds: Set<string>
) {
	await pullReadingState(db, bookId, remoteLibraryBookId)
	await pullBookmarks(db, bookId, remoteLibraryBookId, pendingEntityIds)
	await pullHighlights(db, bookId, remoteLibraryBookId, pendingEntityIds)
	await pullNotes(db, bookId, remoteLibraryBookId, pendingEntityIds)
}

async function pullReadingState(
	db: SQLiteDatabase,
	bookId: string,
	remoteLibraryBookId: string
) {
	const local = await getReadingState(db, bookId)
	let remote: ApiReadingState | null = null

	try {
		remote = await api.getReadingState(remoteLibraryBookId)
	} catch (error) {
		if (!isNotFoundError(error)) {
			throw error
		}
	}

	if (!remote) {
		return
	}

	if (!local) {
		await applyRemoteReadingState(
			db,
			bookId,
			remote.locatorJson,
			remote.progressPercent,
			remote.version,
			remote.updatedAt
		)
		return
	}

	const winner = chooseReadingStateWinner(local, remote)
	if (winner === 'remote') {
		await applyRemoteReadingState(
			db,
			bookId,
			remote.locatorJson,
			remote.progressPercent,
			remote.version,
			remote.updatedAt
		)
	}
}

async function pullBookmarks(
	db: SQLiteDatabase,
	bookId: string,
	remoteLibraryBookId: string,
	pendingEntityIds: Set<string>
) {
	const localBookmarks = await listLocalBookmarks(db, bookId)
	const remoteBookmarks = await api.listBookmarks(remoteLibraryBookId, true)

	for (const remote of remoteBookmarks) {
		const local = localBookmarks.find((item) => item.remoteId === remote.id) ?? null
		if (!shouldApplyRemoteAnnotation(local, remote, local ? pendingEntityIds.has(local.id) : false)) {
			continue
		}
		await syncBookmarkFromRemote(db, bookId, mapRemoteBookmark(remote))
	}
}

async function pullHighlights(
	db: SQLiteDatabase,
	bookId: string,
	remoteLibraryBookId: string,
	pendingEntityIds: Set<string>
) {
	const localHighlights = await listLocalHighlights(db, bookId)
	const remoteHighlights = await api.listHighlights(remoteLibraryBookId, true)

	for (const remote of remoteHighlights) {
		const local = localHighlights.find((item) => item.remoteId === remote.id) ?? null
		if (!shouldApplyRemoteAnnotation(local, remote, local ? pendingEntityIds.has(local.id) : false)) {
			continue
		}
		await syncHighlightFromRemote(db, bookId, mapRemoteHighlight(remote))
	}
}

async function pullNotes(
	db: SQLiteDatabase,
	bookId: string,
	remoteLibraryBookId: string,
	pendingEntityIds: Set<string>
) {
	const localNotes = await listLocalNotes(db, bookId)
	const remoteNotes = await api.listNotes(remoteLibraryBookId, true)

	for (const remote of remoteNotes) {
		const local = localNotes.find((item) => item.remoteId === remote.id) ?? null
		if (!shouldApplyRemoteAnnotation(local, remote, local ? pendingEntityIds.has(local.id) : false)) {
			continue
		}
		await syncNoteFromRemote(db, bookId, mapRemoteNote(remote))
	}
}

function mapRemoteBookmark(remote: ApiBookmark) {
	return {
		id: remote.id,
		locator: remote.locatorJson,
		label: remote.label,
		isDeleted: remote.isDeleted,
		updatedAt: remote.updatedAt,
		createdAt: remote.createdAt,
	}
}

function mapRemoteHighlight(remote: ApiHighlight) {
	return {
		id: remote.id,
		locator: remote.locatorJson,
		excerpt: remote.excerpt,
		isDeleted: remote.isDeleted,
		updatedAt: remote.updatedAt,
		createdAt: remote.createdAt,
	}
}

function mapRemoteNote(remote: ApiNote) {
	return {
		id: remote.id,
		locator: remote.locatorJson,
		excerpt: remote.excerpt,
		content: remote.content,
		isDeleted: remote.isDeleted,
		updatedAt: remote.updatedAt,
		createdAt: remote.createdAt,
	}
}
