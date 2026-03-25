import type { AuthSession } from '../state/session-store'
import type { ReaderLocator } from '../storage/models'

export type ApiSession = AuthSession

export type ApiCatalogBook = {
	id: string
	title: string
	authors: string
	identifiers: Record<string, string>
	language?: string
	sourceType: string
	createdAt: string
	updatedAt: string
}

export type ApiLibraryBook = {
	id: string
	userId: string
	catalogBookId: string
	preferredAssetId?: string
	sourceLibraryBookId?: string
	state: 'active' | 'archived'
	isPublic: boolean
	addedAt: string
	archivedAt?: string
	createdAt: string
	updatedAt: string
}

export type ApiReadingState = {
	id: string
	userId: string
	userLibraryBookId: string
	mode: 'epub'
	locatorJson: ReaderLocator
	progressPercent: number
	version: number
	createdAt: string
	updatedAt: string
}

export type ApiBookmark = {
	id: string
	userId: string
	userLibraryBookId: string
	mode: 'epub'
	locatorJson: ReaderLocator
	label?: string
	isDeleted: boolean
	createdAt: string
	updatedAt: string
}

export type ApiHighlight = {
	id: string
	userId: string
	userLibraryBookId: string
	mode: 'epub'
	locatorJson: ReaderLocator
	excerpt?: string
	visibility: 'private' | 'authenticated'
	isDeleted: boolean
	createdAt: string
	updatedAt: string
}

export type ApiNote = {
	id: string
	userId: string
	userLibraryBookId: string
	mode: 'epub'
	locatorJson: ReaderLocator
	excerpt?: string
	content: string
	isDeleted: boolean
	createdAt: string
	updatedAt: string
}

export type PaginatedResponse<T> = {
	data: T[]
	total: number
	page: number
	limit: number
	totalPages: number
	message: string
	status: number
	success: boolean
}
