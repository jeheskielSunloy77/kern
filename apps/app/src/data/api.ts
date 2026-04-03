import { appConfig } from '../config/app-config'
import { persistSession, useSessionStore } from '../state/session-store'
import type { ReaderLocator } from '../storage/models'
import { coerceErrorMessage } from '../storage/utils'
import type {
	ApiBookmark,
	ApiCatalogBook,
	ApiHighlight,
	ApiLibraryBook,
	ApiNote,
	ApiReadingState,
	ApiSession,
	PaginatedResponse,
} from './types'

type JsonBody = Record<string, unknown>

export class ApiError extends Error {
	status: number
	payload?: unknown

	constructor(message: string, status: number, payload?: unknown) {
		super(message)
		this.name = 'ApiError'
		this.status = status
		this.payload = payload
	}
}

type RequestOptions = {
	auth?: boolean
	retryOnUnauthorized?: boolean
}

async function requestJson<T>(
	path: string,
	init: RequestInit = {},
	options: RequestOptions = {}
): Promise<T> {
	const auth = options.auth ?? true
	const retryOnUnauthorized = options.retryOnUnauthorized ?? true
	const baseUrl = appConfig.apiBaseUrl

	if (!baseUrl) {
		throw new Error('Set EXPO_PUBLIC_API_URL to the API origin before using sync.')
	}

	const session = useSessionStore.getState().session
	const headers = new Headers(init.headers)
	const hasBody = typeof init.body !== 'undefined'
	if (hasBody && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json')
	}
	if (auth && session?.token.token) {
		headers.set('Authorization', `Bearer ${session.token.token}`)
	}

	const response = await fetch(`${baseUrl}${path}`, {
		...init,
		headers,
	})

	const payload = await readPayload(response)

	if (
		response.status === 401 &&
		auth &&
		retryOnUnauthorized &&
		session?.refreshToken.token
	) {
		await refreshSession(session.refreshToken.token)
		return requestJson<T>(path, init, {
			auth,
			retryOnUnauthorized: false,
		})
	}

	if (!response.ok) {
		throw new ApiError(
			readMessage(payload) || `Request failed with status ${response.status}.`,
			response.status,
			payload
		)
	}

	return unwrapData<T>(payload)
}

async function readPayload(response: Response) {
	const contentType = response.headers.get('content-type') ?? ''
	if (!contentType.includes('application/json')) {
		return null
	}

	return response.json().catch(() => null)
}

function unwrapData<T>(payload: unknown) {
	if (
		payload &&
		typeof payload === 'object' &&
		'data' in payload &&
		'status' in payload &&
		'success' in payload
	) {
		return (payload as { data: T }).data
	}

	return payload as T
}

function readMessage(payload: unknown) {
	if (!payload || typeof payload !== 'object') {
		return null
	}
	if ('message' in payload && typeof payload.message === 'string') {
		return payload.message
	}
	return null
}

async function refreshSession(refreshToken: string) {
	const baseUrl = appConfig.apiBaseUrl
	const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ refreshToken }),
	})
	const payload = await readPayload(response)

	if (!response.ok) {
		await persistSession(null)
		throw new ApiError(
			readMessage(payload) || 'Your session has expired.',
			response.status,
			payload
		)
	}

	const session = payload as ApiSession
	await persistSession(session)
	return session
}

async function collectAllPages<T>(
	fetchPage: (offset: number) => Promise<PaginatedResponse<T>>
) {
	const items: T[] = []
	let offset = 0
	let total = Number.POSITIVE_INFINITY
	const limit = 100

	while (offset < total) {
		const page = await fetchPage(offset)
		items.push(...page.data)
		total = page.total
		offset += limit
		if (page.data.length === 0) {
			break
		}
	}

	return items
}

export const api = {
	async register(input: { email: string; username: string; password: string }) {
		return requestJson<ApiSession>('/api/v1/auth/register', {
			method: 'POST',
			body: JSON.stringify(input),
		}, {
			auth: false,
		})
	},

	async login(input: { identifier: string; password: string }) {
		return requestJson<ApiSession>('/api/v1/auth/login', {
			method: 'POST',
			body: JSON.stringify(input),
		}, {
			auth: false,
		})
	},

	async loginWithGoogle(idToken: string) {
		return requestJson<ApiSession>('/api/v1/auth/google/mobile', {
			method: 'POST',
			body: JSON.stringify({ idToken }),
		}, {
			auth: false,
		})
	},

	async me() {
		return requestJson<ApiSession['user']>('/api/v1/auth/me')
	},

	async logout(refreshToken?: string) {
		try {
			await requestJson('/api/v1/auth/logout', {
				method: 'POST',
				body: JSON.stringify({ refreshToken }),
			})
		} catch {
			// local logout still matters even if the network request fails
		}
	},

	async listCatalogBooks() {
		return collectAllPages<ApiCatalogBook>((offset) =>
			requestJson<PaginatedResponse<ApiCatalogBook>>(
				`/api/v1/library/catalog/books?limit=100&offset=${offset}`
			)
		)
	},

	async createCatalogBook(input: {
		title: string
		authors: string
		identifiers: Record<string, string>
		language?: string
		sourceType?: string
	}) {
		return requestJson<ApiCatalogBook>('/api/v1/library/catalog/books', {
			method: 'POST',
			body: JSON.stringify(input),
		})
	},

	async listLibraryBooks() {
		return collectAllPages<ApiLibraryBook>((offset) =>
			requestJson<PaginatedResponse<ApiLibraryBook>>(
				`/api/v1/library/books?limit=100&offset=${offset}`
			)
		)
	},

	async upsertLibraryBook(input: {
		catalogBookId: string
		preferredAssetId?: string
		isPublic?: boolean
	}) {
		return requestJson<ApiLibraryBook>('/api/v1/library/books', {
			method: 'POST',
			body: JSON.stringify(input),
		})
	},

	async getReadingState(libraryBookId: string) {
		return requestJson<ApiReadingState>(
			`/api/v1/library/books/${libraryBookId}/reading-states/epub`
		)
	},

	async upsertReadingState(
		libraryBookId: string,
		input: {
			locatorJson: ReaderLocator
			progressPercent: number
			ifMatchVersion?: number
		}
	) {
		return requestJson<ApiReadingState>(
			`/api/v1/library/books/${libraryBookId}/reading-states/epub`,
			{
				method: 'PUT',
				body: JSON.stringify(input),
			}
		)
	},

	async listHighlights(libraryBookId: string, includeDeleted = false) {
		return requestJson<ApiHighlight[]>(
			`/api/v1/library/books/${libraryBookId}/highlights?includeDeleted=${includeDeleted}`
		)
	},

	async createHighlight(
		libraryBookId: string,
		input: { locatorJson: ReaderLocator; excerpt?: string }
	) {
		return requestJson<ApiHighlight>(
			`/api/v1/library/books/${libraryBookId}/highlights`,
			{
				method: 'POST',
				body: JSON.stringify({
					mode: 'epub',
					locatorJson: input.locatorJson,
					excerpt: input.excerpt,
					visibility: 'private',
				}),
			}
		)
	},

	async updateHighlight(
		highlightId: string,
		input: { locatorJson?: ReaderLocator; excerpt?: string }
	) {
		return requestJson<ApiHighlight>(`/api/v1/library/highlights/${highlightId}`, {
			method: 'PATCH',
			body: JSON.stringify(input),
		})
	},

	async deleteHighlight(highlightId: string) {
		return requestJson(`/api/v1/library/highlights/${highlightId}`, {
			method: 'DELETE',
		})
	},

	async listBookmarks(libraryBookId: string, includeDeleted = false) {
		return requestJson<ApiBookmark[]>(
			`/api/v1/library/books/${libraryBookId}/bookmarks?includeDeleted=${includeDeleted}`
		)
	},

	async createBookmark(
		libraryBookId: string,
		input: { locatorJson: ReaderLocator; label?: string }
	) {
		return requestJson<ApiBookmark>(
			`/api/v1/library/books/${libraryBookId}/bookmarks`,
			{
				method: 'POST',
				body: JSON.stringify({
					mode: 'epub',
					locatorJson: input.locatorJson,
					label: input.label,
				}),
			}
		)
	},

	async updateBookmark(
		bookmarkId: string,
		input: { locatorJson?: ReaderLocator; label?: string }
	) {
		return requestJson<ApiBookmark>(`/api/v1/library/bookmarks/${bookmarkId}`, {
			method: 'PATCH',
			body: JSON.stringify(input),
		})
	},

	async deleteBookmark(bookmarkId: string) {
		return requestJson(`/api/v1/library/bookmarks/${bookmarkId}`, {
			method: 'DELETE',
		})
	},

	async listNotes(libraryBookId: string, includeDeleted = false) {
		return requestJson<ApiNote[]>(
			`/api/v1/library/books/${libraryBookId}/notes?includeDeleted=${includeDeleted}`
		)
	},

	async createNote(
		libraryBookId: string,
		input: { locatorJson: ReaderLocator; excerpt?: string; content: string }
	) {
		return requestJson<ApiNote>(`/api/v1/library/books/${libraryBookId}/notes`, {
			method: 'POST',
			body: JSON.stringify({
				mode: 'epub',
				locatorJson: input.locatorJson,
				excerpt: input.excerpt,
				content: input.content,
			}),
		})
	},

	async updateNote(
		noteId: string,
		input: { locatorJson?: ReaderLocator; excerpt?: string; content?: string }
	) {
		return requestJson<ApiNote>(`/api/v1/library/notes/${noteId}`, {
			method: 'PATCH',
			body: JSON.stringify(input),
		})
	},

	async deleteNote(noteId: string) {
		return requestJson(`/api/v1/library/notes/${noteId}`, {
			method: 'DELETE',
		})
	},
}

export function isNotFoundError(error: unknown) {
	return error instanceof ApiError && error.status === 404
}

export function explainApiError(error: unknown) {
	if (error instanceof ApiError) {
		return error.message
	}
	return coerceErrorMessage(error)
}
