import { useEffect, useMemo, useRef, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Linking, Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSQLiteContext } from 'expo-sqlite'
import { TextInput, ScrollView, ActivityIndicator, Text, View } from 'react-native'

import { Reader, useReader } from '@epubjs-react-native/core'
import { useFileSystem } from '@epubjs-react-native/expo-file-system'

import { ActionButton } from '../../components/action-button'
import { PanelCard } from '../../components/panel-card'
import { SheetModal } from '../../components/sheet-modal'
import { api } from '../../data/api'
import { ScreenShell } from '../../components/screen-shell'
import {
	createBookmark,
	createHighlight,
	createNote,
	getBookById,
	getReaderPreferences,
	getReadingState,
	isCurrentPageBookmarked,
	listBookmarks,
	listHighlights,
	listNotes,
	markBookmarkDeleted,
	markHighlightDeleted,
	markNoteDeleted,
	saveReaderPreferences,
	saveReadingState,
	touchBookOpenedAt,
	updateNoteContent,
} from '../../storage/library-repository'
import type {
	BookRecord,
	HighlightRecord,
	NoteRecord,
	ReaderFlow,
	ReaderLocator,
	ReaderPreferenceRecord,
	ReaderThemeName,
} from '../../storage/models'
import { enqueueSyncItem } from '../../storage/sync-repository'
import { getLocatorCfi } from '../../storage/utils'

type NoteDraft =
	| {
			mode: 'create'
			cfiRange: string
			excerpt: string
			content: string
	  }
	| {
			mode: 'edit'
			noteId: string
			cfiRange?: string
			excerpt?: string
			content: string
	  }

export function ReaderScreen() {
	const params = useLocalSearchParams<{ bookId: string }>()
	const bookId = String(params.bookId)
	const router = useRouter()
	const db = useSQLiteContext()
	const queryClient = useQueryClient()
	const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const {
		addAnnotation,
		changeFlow,
		changeFontFamily,
		changeFontSize,
		changeTheme,
		clearSearchResults,
		currentLocation,
		goNext,
		goPrevious,
		goToLocation,
		removeAnnotationByCfi,
		removeSelection,
		search,
		searchResults,
		section,
	} = useReader()

	const [searchSheetOpen, setSearchSheetOpen] = useState(false)
	const [notesSheetOpen, setNotesSheetOpen] = useState(false)
	const [prefsSheetOpen, setPrefsSheetOpen] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null)

	const bookQuery = useQuery({
		queryKey: ['book', bookId],
		queryFn: () => getBookById(db, bookId),
	})
	const stateQuery = useQuery({
		queryKey: ['reading-state', bookId],
		queryFn: () => getReadingState(db, bookId),
	})
	const bookmarksQuery = useQuery({
		queryKey: ['bookmarks', bookId],
		queryFn: () => listBookmarks(db, bookId),
	})
	const highlightsQuery = useQuery({
		queryKey: ['highlights', bookId],
		queryFn: () => listHighlights(db, bookId),
	})
	const notesQuery = useQuery({
		queryKey: ['notes', bookId],
		queryFn: () => listNotes(db, bookId),
	})
	const prefsQuery = useQuery({
		queryKey: ['preferences', bookId],
		queryFn: () => getReaderPreferences(db, bookId),
	})

	useEffect(() => {
		if (!bookId) {
			return
		}
		void touchBookOpenedAt(db, bookId)
		void queryClient.invalidateQueries({ queryKey: ['books'] })
	}, [bookId, db, queryClient])

	useEffect(() => {
		return () => {
			if (persistTimer.current) {
				clearTimeout(persistTimer.current)
			}
		}
	}, [])

	useEffect(() => {
		const prefs = prefsQuery.data
		if (!prefs) {
			return
		}

		changeFontSize(`${prefs.fontScale}%`)
		changeFontFamily(prefs.fontFamily === 'serif' ? 'Georgia, serif' : 'Helvetica, Arial, sans-serif')
		changeTheme(buildReaderTheme(prefs))
		changeFlow(prefs.flow)
	}, [
		changeFlow,
		changeFontFamily,
		changeFontSize,
		changeTheme,
		prefsQuery.data,
	])

	const annotations = useMemo(
		() =>
			(highlightsQuery.data ?? [])
				.filter((highlight) => !highlight.isDeleted)
				.map((highlight) => ({
					type: 'highlight' as const,
					data: { localId: highlight.id },
					cfiRange: String(highlight.locator.cfiRange ?? ''),
					sectionIndex:
						typeof highlight.locator.sectionIndex === 'number'
							? highlight.locator.sectionIndex
							: 0,
					cfiRangeText: highlight.excerpt ?? '',
					styles: {
						color: highlight.color,
						opacity: 0.36,
					},
				}))
				.filter((annotation) => annotation.cfiRange.length > 0),
		[highlightsQuery.data]
	)

	const currentBookmarked = isCurrentPageBookmarked(
		bookmarksQuery.data ?? [],
		currentLocation ?? null
	)

	async function queueInvalidate(entityType: 'reading_state' | 'bookmark' | 'highlight' | 'note', entityId: string) {
		await enqueueSyncItem(db, {
			entityType,
			entityId,
			bookId,
		})
	}

	async function persistLocation(locator: ReaderLocator, progressPercent: number) {
		const saved = await saveReadingState(db, bookId, locator, progressPercent)
		if (saved) {
			await queueInvalidate('reading_state', bookId)
			await queryClient.invalidateQueries({ queryKey: ['reading-state', bookId] })
		}
	}

	async function handleCreateHighlight(cfiRange: string, excerpt: string) {
		const locator = buildSelectionLocator(cfiRange, excerpt, currentLocation, section)
		const created = await createHighlight(db, {
			bookId,
			locator,
			excerpt,
		})
		if (created) {
			addAnnotation(
				'highlight',
				cfiRange,
				{ localId: created.id },
				{ color: created.color, opacity: 0.36 }
			)
			await queueInvalidate('highlight', created.id)
			await queryClient.invalidateQueries({ queryKey: ['highlights', bookId] })
		}
		removeSelection()
	}

	async function handleToggleBookmark() {
		const activeLocator = buildLocationLocator(currentLocation, section, '')
		if (!activeLocator) {
			return
		}

		const existing = (bookmarksQuery.data ?? []).find(
			(bookmark) =>
				!bookmark.isDeleted &&
				getLocatorCfi(bookmark.locator) === getLocatorCfi(activeLocator)
		)

		if (existing) {
			await markBookmarkDeleted(db, existing.id)
			await queueInvalidate('bookmark', existing.id)
		} else {
			const created = await createBookmark(db, {
				bookId,
				locator: activeLocator,
				label: section?.label,
			})
			if (created) {
				await queueInvalidate('bookmark', created.id)
			}
		}

		await queryClient.invalidateQueries({ queryKey: ['bookmarks', bookId] })
	}

	async function saveNoteDraft() {
		if (!noteDraft) {
			return
		}

		if (noteDraft.mode === 'edit') {
			await updateNoteContent(db, noteDraft.noteId, noteDraft.content)
			await queueInvalidate('note', noteDraft.noteId)
		} else {
			const locator = buildSelectionLocator(
				noteDraft.cfiRange,
				noteDraft.excerpt,
				currentLocation,
				section
			)
			const created = await createNote(db, {
				bookId,
				locator,
				excerpt: noteDraft.excerpt,
				content: noteDraft.content,
			})
			if (created) {
				await queueInvalidate('note', created.id)
			}
		}

		setNoteDraft(null)
		removeSelection()
		await queryClient.invalidateQueries({ queryKey: ['notes', bookId] })
	}

	async function removeHighlight(highlight: HighlightRecord) {
		await markHighlightDeleted(db, highlight.id)
		await queueInvalidate('highlight', highlight.id)
		removeAnnotationByCfi(String(highlight.locator.cfiRange ?? ''))
		await queryClient.invalidateQueries({ queryKey: ['highlights', bookId] })
	}

	async function removeNote(note: NoteRecord) {
		await markNoteDeleted(db, note.id)
		await queueInvalidate('note', note.id)
		await queryClient.invalidateQueries({ queryKey: ['notes', bookId] })
	}

	if (bookQuery.isLoading || prefsQuery.isLoading) {
		return (
			<ScreenShell>
				<View className="flex-row" style={{ alignItems: "center" }} style={{ gap: 12 }}>
					<ActivityIndicator color="#496360" />
					<Text className="text-kern-muted">Opening your book...</Text>
				</View>
			</ScreenShell>
		)
	}

	if (!bookQuery.data || !prefsQuery.data) {
		return (
			<ScreenShell>
				<PanelCard>
					<Text textClassName="text-kern-danger">This book could not be loaded.</Text>
					<ActionButton
						className="bg-kern-surface-container"
						textClassName="text-kern-primary"
						onPress={() => {
							router.back()
						}}
					>
						Back
					</ActionButton>
				</PanelCard>
			</ScreenShell>
		)
	}

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: '#faf9f5' }}>
			<View className="flex-col" style={{ flex: 1 }}>
				<View className="flex-row"
					style={{ paddingHorizontal: 16 }}
					style={{ paddingVertical: 12 }}
					style={{ alignItems: "center" }}
					style={{ justifyContent: "space-between" }}
					className="bg-kern-surface"
				>
					<View className="flex-col" style={{ flex: 1 }} style={{ paddingRight: 12 }}>
						<Text className="font-heading" style={{ fontSize: 20 }} className="text-kern-ink" numberOfLines={1}>
							{bookQuery.data.title}
						</Text>
						<Text className="text-kern-muted" numberOfLines={1}>
							{section?.label || bookQuery.data.authors}
						</Text>
					</View>
					<ActionButton
						className="bg-kern-surface-container"
						textClassName="text-kern-primary"
						onPress={() => {
							router.back()
						}}
					>
						Close
					</ActionButton>
				</View>

				<Reader
					src={bookQuery.data.fileUri}
					fileSystem={useFileSystem}
					initialLocation={
						getLocatorCfi(stateQuery.data?.locator) ||
						String(stateQuery.data?.locator?.href ?? '')
					}
					initialAnnotations={annotations}
					enableSelection
					menuItems={[
						{
							label: 'Highlight',
							action: (cfiRange, text) => {
								void handleCreateHighlight(cfiRange, text)
								return true
							},
						},
						{
							label: 'Note',
							action: (cfiRange, text) => {
								setNoteDraft({
									mode: 'create',
									cfiRange,
									excerpt: text,
									content: '',
								})
								return false
							},
						},
					]}
					defaultTheme={buildReaderTheme(prefsQuery.data)}
					flow={prefsQuery.data.flow}
					onPressExternalLink={(url) => {
						void Linking.openURL(url)
					}}
					onLocationChange={(_, location, progress, currentSection) => {
						const locator = buildLocationLocator(location, currentSection, currentSection?.label ?? '')
						if (!locator) {
							return
						}
						if (persistTimer.current) {
							clearTimeout(persistTimer.current)
						}
						persistTimer.current = setTimeout(() => {
							void persistLocation(locator, progress)
						}, 900)
					}}
					renderOpeningBookComponent={() => (
						<View className="flex-col" style={{ flex: 1 }} style={{ alignItems: "center" }} style={{ justifyContent: "center" }} style={{ gap: 12 }}>
							<ActivityIndicator color="#496360" />
							<Text className="text-kern-muted">Rendering your offline reader...</Text>
						</View>
					)}
				/>

				<View className="flex-row"
					style={{ padding: 12 }}
					className="bg-kern-surface"
					style={{ gap: 8 }}
					style={{ flexWrap: "wrap" }}
				>
					<ActionButton className="bg-kern-surface-container" textClassName="text-kern-primary" onPress={() => goPrevious()}>
						Prev
					</ActionButton>
					<ActionButton className="bg-kern-surface-container" textClassName="text-kern-primary" onPress={() => goNext()}>
						Next
					</ActionButton>
					<ActionButton className="bg-kern-surface-container" textClassName="text-kern-primary" onPress={() => setSearchSheetOpen(true)}>
						Search
					</ActionButton>
					<ActionButton className="bg-kern-surface-container" textClassName="text-kern-primary" onPress={() => setNotesSheetOpen(true)}>
						Notes
					</ActionButton>
					<ActionButton className="bg-kern-surface-container" textClassName="text-kern-primary" onPress={() => setPrefsSheetOpen(true)}>
						Aa
					</ActionButton>
					<ActionButton
						className={currentBookmarked ? "bg-kern-primary" : "bg-kern-surface-container"}
						textClassName={currentBookmarked ? "text-[#e0fef9]" : "text-kern-primary"}
						onPress={() => {
							void handleToggleBookmark()
						}}
					>
						Bookmark
					</ActionButton>
				</View>
			</View>

			<SheetModal
				visible={searchSheetOpen}
				title="Search this book"
				onClose={() => setSearchSheetOpen(false)}
			>
				<View className="flex-col" style={{ gap: 12 }} style={{ flex: 1 }}>
					<TextInput
						value={searchTerm}
						onChangeText={setSearchTerm}
						placeholder="Find text inside the EPUB"
						className="bg-kern-surface-container"
						style={{ borderColor: "#cbe8e3", borderWidth: 1 }}
						className="text-kern-ink"
					/>
					<View className="flex-row" style={{ gap: 12 }}>
						<ActionButton
							className="bg-kern-primary"
							textClassName="text-[#e0fef9]"
							onPress={() => {
								search(searchTerm)
							}}
						>
							Run Search
						</ActionButton>
						<ActionButton
							className="bg-kern-surface-container"
							textClassName="text-kern-primary"
							onPress={() => {
								clearSearchResults()
								setSearchTerm('')
							}}
						>
							Clear
						</ActionButton>
					</View>
					<ScrollView>
						<View className="flex-col" style={{ gap: 12 }}>
							{searchResults.results.map((result) => (
								<Pressable
									key={`${result.cfi}-${result.section.href}`}
									onPress={() => {
										goToLocation(result.cfi)
										setSearchSheetOpen(false)
									}}
								>
									<PanelCard>
										<Text className="font-heading" className="text-kern-ink">
											{result.section.label}
										</Text>
										<Text className="text-kern-muted">{result.excerpt}</Text>
									</PanelCard>
								</Pressable>
							))}
						</View>
					</ScrollView>
				</View>
			</SheetModal>

			<SheetModal
				visible={notesSheetOpen}
				title="Bookmarks, highlights, and notes"
				onClose={() => setNotesSheetOpen(false)}
			>
				<ScrollView>
					<View className="flex-col" style={{ gap: 16 }}>
						<PanelCard>
							<Text className="font-heading" style={{ fontSize: 20 }} className="text-kern-ink">
								Bookmarks
							</Text>
							{(bookmarksQuery.data ?? [])
								.filter((bookmark) => !bookmark.isDeleted)
								.map((bookmark) => (
									<PanelCard key={bookmark.id}>
										<Text className="text-kern-ink">{bookmark.label || 'Saved place'}</Text>
										<Text className="text-kern-muted">
											{String(bookmark.locator.href ?? bookmark.locator.cfi ?? '')}
										</Text>
									</PanelCard>
								))}
						</PanelCard>
						<PanelCard>
							<Text className="font-heading" style={{ fontSize: 20 }} className="text-kern-ink">
								Highlights
							</Text>
							{(highlightsQuery.data ?? [])
								.filter((highlight) => !highlight.isDeleted)
								.map((highlight) => (
									<PanelCard key={highlight.id}>
										<Text className="text-kern-ink">{highlight.excerpt || 'Highlight'}</Text>
										<View className="flex-row" style={{ gap: 12 }}>
											<ActionButton
												className="bg-kern-surface-container"
												textClassName="text-kern-primary"
												onPress={() => {
													const cfi = String(highlight.locator.cfiRange ?? highlight.locator.cfi ?? '')
													if (cfi) {
														goToLocation(cfi)
														setNotesSheetOpen(false)
													}
												}}
											>
												Jump
											</ActionButton>
											<ActionButton
												className="bg-kern-surface-container"
												textClassName="text-kern-danger"
												onPress={() => {
													void removeHighlight(highlight)
												}}
											>
												Delete
											</ActionButton>
										</View>
									</PanelCard>
								))}
						</PanelCard>
						<PanelCard>
							<Text className="font-heading" style={{ fontSize: 20 }} className="text-kern-ink">
								Notes
							</Text>
							{(notesQuery.data ?? [])
								.filter((note) => !note.isDeleted)
								.map((note) => (
									<PanelCard key={note.id}>
										<Text className="text-kern-ink">{note.content}</Text>
										{note.excerpt ? <Text className="text-kern-muted">{note.excerpt}</Text> : null}
										<View className="flex-row" style={{ gap: 12 }} style={{ flexWrap: "wrap" }}>
											<ActionButton
												className="bg-kern-surface-container"
												textClassName="text-kern-primary"
												onPress={() => {
													const cfi = String(note.locator.cfiRange ?? note.locator.cfi ?? '')
													if (cfi) {
														goToLocation(cfi)
														setNotesSheetOpen(false)
													}
												}}
											>
												Jump
											</ActionButton>
											<ActionButton
												className="bg-kern-surface-container"
												textClassName="text-kern-primary"
												onPress={() => {
													setNoteDraft({
														mode: 'edit',
														noteId: note.id,
														cfiRange: String(note.locator.cfiRange ?? ''),
														excerpt: note.excerpt,
														content: note.content,
													})
												}}
											>
												Edit
											</ActionButton>
											<ActionButton
												className="bg-kern-surface-container"
												textClassName="text-kern-danger"
												onPress={() => {
													void removeNote(note)
												}}
											>
												Delete
											</ActionButton>
										</View>
									</PanelCard>
								))}
						</PanelCard>
					</View>
				</ScrollView>
			</SheetModal>

			<SheetModal
				visible={prefsSheetOpen}
				title="Reader preferences"
				onClose={() => setPrefsSheetOpen(false)}
			>
				<PreferencesEditor
					preferences={prefsQuery.data}
					onChange={async (next) => {
						await saveReaderPreferences(db, next)
						await queryClient.invalidateQueries({ queryKey: ['preferences', bookId] })
					}}
				/>
			</SheetModal>

			<Modal
				visible={Boolean(noteDraft)}
				animationType="slide"
				presentationStyle="formSheet"
				onRequestClose={() => setNoteDraft(null)}
			>
				<SafeAreaView style={{ flex: 1, backgroundColor: '#faf9f5' }}>
					<View className="flex-col" style={{ flex: 1 }} style={{ padding: 20 }} style={{ gap: 16 }}>
						<Text className="font-heading" style={{ fontSize: 24 }} className="text-kern-ink">
							{noteDraft?.mode === 'edit' ? 'Edit note' : 'New note'}
						</Text>
						<Text className="text-kern-muted">{noteDraft?.excerpt}</Text>
						<TextInput
							value={noteDraft?.content ?? ''}
							onChangeText={(value) => {
								setNoteDraft((current) => (current ? { ...current, content: value } : current))
							}}
							multiline
							numberOfLines={8}
							textAlignVertical="top"
							className="bg-kern-surface-container"
							style={{ borderColor: "#cbe8e3", borderWidth: 1 }}
							className="text-kern-ink"
						/>
						<View className="flex-row" style={{ gap: 12 }}>
							<ActionButton
								className="bg-kern-primary"
								textClassName="text-[#e0fef9]"
								onPress={() => {
									void saveNoteDraft()
								}}
							>
								Save note
							</ActionButton>
							<ActionButton
								className="bg-kern-surface-container"
								textClassName="text-kern-primary"
								onPress={() => setNoteDraft(null)}
							>
								Cancel
							</ActionButton>
						</View>
					</View>
				</SafeAreaView>
			</Modal>
		</SafeAreaView>
	)
}

function buildSelectionLocator(
	cfiRange: string,
	excerpt: string,
	currentLocation: ReaderLocator | null,
	section: { href: string; label: string } | null
) {
	return {
		...(currentLocation ?? {}),
		cfiRange,
		cfi: cfiRange,
		href: section?.href ?? currentLocation?.start?.href ?? currentLocation?.href,
		chapter: section?.label,
		excerpt,
		sectionIndex:
			typeof currentLocation?.start?.index === 'number'
				? currentLocation.start.index
				: 0,
	}
}

function buildLocationLocator(
	currentLocation: ReaderLocator | null,
	section: { href: string; label: string } | null,
	excerpt: string
) {
	if (!currentLocation) {
		return null
	}

	return {
		...currentLocation,
		cfi: currentLocation.start?.cfi ?? currentLocation.cfi,
		href: section?.href ?? currentLocation.start?.href ?? currentLocation.href,
		chapter: section?.label,
		excerpt,
		sectionIndex:
			typeof currentLocation.start?.index === 'number'
				? currentLocation.start.index
				: 0,
	}
}

function buildReaderTheme(preferences: ReaderPreferenceRecord) {
	const palette: Record<ReaderThemeName, { background: string; color: string }> = {
		paper: { background: '#f9f3e7', color: '#241f18' },
		sepia: { background: '#efe0c2', color: '#3a2d1f' },
		night: { background: '#171717', color: '#f2eadf' },
	}
	const colors = palette[preferences.theme]

	return {
		body: {
			background: colors.background,
			color: colors.color,
			'line-height': String(preferences.lineHeight / 100),
			padding: `0 ${preferences.margin}px`,
			'font-family':
				preferences.fontFamily === 'serif'
					? 'Georgia, serif'
					: 'Helvetica, Arial, sans-serif',
		},
		p: {
			'line-height': String(preferences.lineHeight / 100),
			margin: '0 0 0.8em 0',
		},
		'::selection': {
			background: '#ead488',
		},
	}
}

function PreferencesEditor({
	preferences,
	onChange,
}: {
	preferences: ReaderPreferenceRecord
	onChange: (next: ReaderPreferenceRecord) => Promise<void>
}) {
	const update = (patch: Partial<ReaderPreferenceRecord>) =>
		onChange({
			...preferences,
			...patch,
			updatedAt: new Date().toISOString(),
		})

	return (
		<View className="flex-col" style={{ gap: 16 }}>
			<PanelCard>
				<Text className="text-kern-ink">Theme</Text>
				<View className="flex-row" style={{ gap: 12 }} style={{ flexWrap: "wrap" }}>
					{(['paper', 'sepia', 'night'] as const).map((theme) => (
						<ActionButton
							key={theme}
							className={preferences.theme === theme ? "bg-kern-primary" : "bg-kern-surface-container"}
							textClassName={preferences.theme === theme ? "text-[#e0fef9]" : "text-kern-primary"}
							onPress={() => {
								void update({ theme })
							}}
						>
							{theme}
						</ActionButton>
					))}
				</View>
			</PanelCard>

			<PanelCard>
				<Text className="text-kern-ink">Font size</Text>
				<View className="flex-row" style={{ gap: 12 }}>
					<ActionButton
						className="bg-kern-surface-container"
						textClassName="text-kern-primary"
						onPress={() => {
							void update({ fontScale: Math.max(80, preferences.fontScale - 10) })
						}}
					>
						Smaller
					</ActionButton>
					<ActionButton
						className="bg-kern-surface-container"
						textClassName="text-kern-primary"
						onPress={() => {
							void update({ fontScale: Math.min(160, preferences.fontScale + 10) })
						}}
					>
						Larger
					</ActionButton>
				</View>
				<Text className="text-kern-muted">{preferences.fontScale}%</Text>
			</PanelCard>

			<PanelCard>
				<Text className="text-kern-ink">Flow</Text>
				<View className="flex-row" style={{ gap: 12 }}>
					{(['paginated', 'scrolled-doc'] as ReaderFlow[]).map((flow) => (
						<ActionButton
							key={flow}
							className={preferences.flow === flow ? "bg-kern-primary" : "bg-kern-surface-container"}
							textClassName={preferences.flow === flow ? "text-[#e0fef9]" : "text-kern-primary"}
							onPress={() => {
								void update({ flow })
							}}
						>
							{flow}
						</ActionButton>
					))}
				</View>
			</PanelCard>
		</View>
	)
}
