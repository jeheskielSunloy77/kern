export type TocItem = {
	id: string
	href: string
	label: string
	subitems: TocItem[]
}

export type ReaderLocator = {
	cfi?: string
	cfiRange?: string
	href?: string
	location?: number
	percentage?: number
	displayed?: {
		page: number
		total: number
	}
	start?: {
		cfi?: string
		href?: string
		index?: number
		percentage?: number
		displayed?: {
			page: number
			total: number
		}
	}
	end?: {
		cfi?: string
		href?: string
		index?: number
		percentage?: number
		displayed?: {
			page: number
			total: number
		}
	}
	[key: string]: unknown
}

export type ReaderThemeName = 'paper' | 'sepia' | 'night'
export type ReaderFlow = 'paginated' | 'scrolled-doc'
export type ReaderFontFamily = 'serif' | 'sans'

export type BookRecord = {
	id: string
	checksum: string
	fileUri: string
	fileName: string
	title: string
	authors: string
	language?: string
	description?: string
	publisher?: string
	coverUri?: string
	identifiers: Record<string, string>
	toc: TocItem[]
	importStatus: 'ready' | 'failed'
	lastOpenedAt?: string
	createdAt: string
	updatedAt: string
}

export type ReadingStateRecord = {
	bookId: string
	locator: ReaderLocator
	progressPercent: number
	updatedAt: string
	remoteVersion?: number
	remoteUpdatedAt?: string
}

export type BookmarkRecord = {
	id: string
	bookId: string
	locator: ReaderLocator
	label?: string
	remoteId?: string
	isDeleted: boolean
	syncedAt?: string
	createdAt: string
	updatedAt: string
	deletedAt?: string
}

export type HighlightRecord = {
	id: string
	bookId: string
	locator: ReaderLocator
	excerpt?: string
	color: string
	remoteId?: string
	isDeleted: boolean
	syncedAt?: string
	createdAt: string
	updatedAt: string
	deletedAt?: string
}

export type NoteRecord = {
	id: string
	bookId: string
	locator: ReaderLocator
	excerpt?: string
	content: string
	remoteId?: string
	isDeleted: boolean
	syncedAt?: string
	createdAt: string
	updatedAt: string
	deletedAt?: string
}

export type ReaderPreferenceRecord = {
	bookId: string
	theme: ReaderThemeName
	fontScale: number
	lineHeight: number
	margin: number
	fontFamily: ReaderFontFamily
	flow: ReaderFlow
	updatedAt: string
}

export type SyncAccountRecord = {
	userId: string
	email: string
	username: string
	lastSyncedAt?: string
	createdAt: string
	updatedAt: string
}

export type SyncLinkRecord = {
	bookId: string
	remoteCatalogBookId?: string
	remoteLibraryBookId?: string
	matchedBy: string
	createdAt: string
	updatedAt: string
}

export type SyncQueueEntity =
	| 'reading_state'
	| 'bookmark'
	| 'highlight'
	| 'note'

export type SyncQueueRecord = {
	id: string
	entityType: SyncQueueEntity
	entityId: string
	action: 'reconcile'
	bookId?: string
	payload: Record<string, unknown>
	attempts: number
	nextRetryAt?: string
	lastError?: string
	status: 'pending' | 'failed'
	createdAt: string
	updatedAt: string
}

export type ParsedEpub = {
	metadata: {
		title: string
		authors: string
		language?: string
		description?: string
		publisher?: string
		identifiers: Record<string, string>
	}
	opfPath: string
	toc: TocItem[]
	cover?: {
		base64: string
		mimeType: string
	}
	sectionsForIndex: Array<{
		href: string
		content: string
	}>
}
