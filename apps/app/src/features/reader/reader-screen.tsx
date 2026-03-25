import { useEffect, useMemo, useRef, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Linking, Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSQLiteContext } from 'expo-sqlite'
import { Input, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui'

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
				<XStack alignItems="center" gap="$3">
					<Spinner color="$accentSolid" />
					<Text color="$muted">Opening your book...</Text>
				</XStack>
			</ScreenShell>
		)
	}

	if (!bookQuery.data || !prefsQuery.data) {
		return (
			<ScreenShell>
				<PanelCard>
					<Text color="$danger">This book could not be loaded.</Text>
					<ActionButton
						backgroundColor="$accentSoft"
						color="$accent"
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
		<SafeAreaView style={{ flex: 1, backgroundColor: '#f5eddc' }}>
			<YStack flex={1}>
				<XStack
					paddingHorizontal="$4"
					paddingVertical="$3"
					alignItems="center"
					justifyContent="space-between"
					backgroundColor="$background"
				>
					<YStack flex={1} paddingRight="$3">
						<Text fontFamily="$heading" fontSize="$6" color="$ink" numberOfLines={1}>
							{bookQuery.data.title}
						</Text>
						<Text color="$muted" numberOfLines={1}>
							{section?.label || bookQuery.data.authors}
						</Text>
					</YStack>
					<ActionButton
						backgroundColor="$accentSoft"
						color="$accent"
						onPress={() => {
							router.back()
						}}
					>
						Close
					</ActionButton>
				</XStack>

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
						<YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
							<Spinner color="$accentSolid" />
							<Text color="$muted">Rendering your offline reader...</Text>
						</YStack>
					)}
				/>

				<XStack
					padding="$3"
					backgroundColor="$background"
					gap="$2"
					flexWrap="wrap"
				>
					<ActionButton backgroundColor="$accentSoft" color="$accent" onPress={() => goPrevious()}>
						Prev
					</ActionButton>
					<ActionButton backgroundColor="$accentSoft" color="$accent" onPress={() => goNext()}>
						Next
					</ActionButton>
					<ActionButton backgroundColor="$accentSoft" color="$accent" onPress={() => setSearchSheetOpen(true)}>
						Search
					</ActionButton>
					<ActionButton backgroundColor="$accentSoft" color="$accent" onPress={() => setNotesSheetOpen(true)}>
						Notes
					</ActionButton>
					<ActionButton backgroundColor="$accentSoft" color="$accent" onPress={() => setPrefsSheetOpen(true)}>
						Aa
					</ActionButton>
					<ActionButton
						backgroundColor={currentBookmarked ? '$accentSolid' : '$accentSoft'}
						color={currentBookmarked ? 'white' : '$accent'}
						onPress={() => {
							void handleToggleBookmark()
						}}
					>
						Bookmark
					</ActionButton>
				</XStack>
			</YStack>

			<SheetModal
				visible={searchSheetOpen}
				title="Search this book"
				onClose={() => setSearchSheetOpen(false)}
			>
				<YStack gap="$3" flex={1}>
					<Input
						value={searchTerm}
						onChangeText={setSearchTerm}
						placeholder="Find text inside the EPUB"
						backgroundColor="$backgroundSoft"
						borderColor="$borderColor"
						color="$ink"
					/>
					<XStack gap="$3">
						<ActionButton
							backgroundColor="$accentSolid"
							color="white"
							onPress={() => {
								search(searchTerm)
							}}
						>
							Run Search
						</ActionButton>
						<ActionButton
							backgroundColor="$accentSoft"
							color="$accent"
							onPress={() => {
								clearSearchResults()
								setSearchTerm('')
							}}
						>
							Clear
						</ActionButton>
					</XStack>
					<ScrollView>
						<YStack gap="$3">
							{searchResults.results.map((result) => (
								<Pressable
									key={`${result.cfi}-${result.section.href}`}
									onPress={() => {
										goToLocation(result.cfi)
										setSearchSheetOpen(false)
									}}
								>
									<PanelCard>
										<Text fontFamily="$heading" color="$ink">
											{result.section.label}
										</Text>
										<Text color="$muted">{result.excerpt}</Text>
									</PanelCard>
								</Pressable>
							))}
						</YStack>
					</ScrollView>
				</YStack>
			</SheetModal>

			<SheetModal
				visible={notesSheetOpen}
				title="Bookmarks, highlights, and notes"
				onClose={() => setNotesSheetOpen(false)}
			>
				<ScrollView>
					<YStack gap="$4">
						<PanelCard>
							<Text fontFamily="$heading" fontSize="$6" color="$ink">
								Bookmarks
							</Text>
							{(bookmarksQuery.data ?? [])
								.filter((bookmark) => !bookmark.isDeleted)
								.map((bookmark) => (
									<PanelCard key={bookmark.id}>
										<Text color="$ink">{bookmark.label || 'Saved place'}</Text>
										<Text color="$muted">
											{String(bookmark.locator.href ?? bookmark.locator.cfi ?? '')}
										</Text>
									</PanelCard>
								))}
						</PanelCard>
						<PanelCard>
							<Text fontFamily="$heading" fontSize="$6" color="$ink">
								Highlights
							</Text>
							{(highlightsQuery.data ?? [])
								.filter((highlight) => !highlight.isDeleted)
								.map((highlight) => (
									<PanelCard key={highlight.id}>
										<Text color="$ink">{highlight.excerpt || 'Highlight'}</Text>
										<XStack gap="$3">
											<ActionButton
												backgroundColor="$accentSoft"
												color="$accent"
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
												backgroundColor="$backgroundSoft"
												color="$danger"
												onPress={() => {
													void removeHighlight(highlight)
												}}
											>
												Delete
											</ActionButton>
										</XStack>
									</PanelCard>
								))}
						</PanelCard>
						<PanelCard>
							<Text fontFamily="$heading" fontSize="$6" color="$ink">
								Notes
							</Text>
							{(notesQuery.data ?? [])
								.filter((note) => !note.isDeleted)
								.map((note) => (
									<PanelCard key={note.id}>
										<Text color="$ink">{note.content}</Text>
										{note.excerpt ? <Text color="$muted">{note.excerpt}</Text> : null}
										<XStack gap="$3" flexWrap="wrap">
											<ActionButton
												backgroundColor="$accentSoft"
												color="$accent"
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
												backgroundColor="$accentSoft"
												color="$accent"
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
												backgroundColor="$backgroundSoft"
												color="$danger"
												onPress={() => {
													void removeNote(note)
												}}
											>
												Delete
											</ActionButton>
										</XStack>
									</PanelCard>
								))}
						</PanelCard>
					</YStack>
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
				<SafeAreaView style={{ flex: 1, backgroundColor: '#f5eddc' }}>
					<YStack flex={1} padding="$5" gap="$4">
						<Text fontFamily="$heading" fontSize="$7" color="$ink">
							{noteDraft?.mode === 'edit' ? 'Edit note' : 'New note'}
						</Text>
						<Text color="$muted">{noteDraft?.excerpt}</Text>
						<Input
							value={noteDraft?.content ?? ''}
							onChangeText={(value) => {
								setNoteDraft((current) => (current ? { ...current, content: value } : current))
							}}
							multiline
							numberOfLines={8}
							textAlignVertical="top"
							backgroundColor="$backgroundSoft"
							borderColor="$borderColor"
							color="$ink"
						/>
						<XStack gap="$3">
							<ActionButton
								backgroundColor="$accentSolid"
								color="white"
								onPress={() => {
									void saveNoteDraft()
								}}
							>
								Save note
							</ActionButton>
							<ActionButton
								backgroundColor="$accentSoft"
								color="$accent"
								onPress={() => setNoteDraft(null)}
							>
								Cancel
							</ActionButton>
						</XStack>
					</YStack>
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
		<YStack gap="$4">
			<PanelCard>
				<Text color="$ink">Theme</Text>
				<XStack gap="$3" flexWrap="wrap">
					{(['paper', 'sepia', 'night'] as const).map((theme) => (
						<ActionButton
							key={theme}
							backgroundColor={preferences.theme === theme ? '$accentSolid' : '$accentSoft'}
							color={preferences.theme === theme ? 'white' : '$accent'}
							onPress={() => {
								void update({ theme })
							}}
						>
							{theme}
						</ActionButton>
					))}
				</XStack>
			</PanelCard>

			<PanelCard>
				<Text color="$ink">Font size</Text>
				<XStack gap="$3">
					<ActionButton
						backgroundColor="$accentSoft"
						color="$accent"
						onPress={() => {
							void update({ fontScale: Math.max(80, preferences.fontScale - 10) })
						}}
					>
						Smaller
					</ActionButton>
					<ActionButton
						backgroundColor="$accentSoft"
						color="$accent"
						onPress={() => {
							void update({ fontScale: Math.min(160, preferences.fontScale + 10) })
						}}
					>
						Larger
					</ActionButton>
				</XStack>
				<Text color="$muted">{preferences.fontScale}%</Text>
			</PanelCard>

			<PanelCard>
				<Text color="$ink">Flow</Text>
				<XStack gap="$3">
					{(['paginated', 'scrolled-doc'] as ReaderFlow[]).map((flow) => (
						<ActionButton
							key={flow}
							backgroundColor={preferences.flow === flow ? '$accentSolid' : '$accentSoft'}
							color={preferences.flow === flow ? 'white' : '$accent'}
							onPress={() => {
								void update({ flow })
							}}
						>
							{flow}
						</ActionButton>
					))}
				</XStack>
			</PanelCard>
		</YStack>
	)
}
