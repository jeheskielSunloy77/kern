import { useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Href, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { ActionButton } from '../../components/action-button'
import { BookCard } from '../../components/book-card'
import { PanelCard } from '../../components/panel-card'
import { ScreenShell } from '../../components/screen-shell'
import { pickAndImportEpub } from '../../storage/import-epub'
import { getReadingState, listBooks } from '../../storage/library-repository'
import { coerceErrorMessage } from '../../storage/utils'

export function LibraryScreen() {
	const db = useSQLiteContext()
	const router = useRouter()
	const queryClient = useQueryClient()
	const [importError, setImportError] = useState<string | null>(null)
	const [importing, setImporting] = useState(false)

	const booksQuery = useQuery({
		queryKey: ['books'],
		queryFn: () => listBooks(db),
	})

	async function handleImport() {
		try {
			setImporting(true)
			setImportError(null)
			const imported = await pickAndImportEpub(db)
			if (!imported) {
				return
			}
			await queryClient.invalidateQueries({ queryKey: ['books'] })
			router.push({
				pathname: '/book/[bookId]' as Href,
				params: { bookId: imported.book.id },
			} as Href)
		} catch (error) {
			setImportError(coerceErrorMessage(error))
		} finally {
			setImporting(false)
		}
	}

	return (
		<ScreenShell>
			<YStack gap="$4">
				<Text fontFamily="$heading" fontSize="$8" color="$ink">
					Library
				</Text>
				<Text color="$muted" fontSize="$5">
					Your imported EPUB collection lives here. Open a title, continue where you
					left off, or add something new.
				</Text>
			</YStack>

			<PanelCard>
				<XStack gap="$3" flexWrap="wrap" alignItems="center">
					<ActionButton
						backgroundColor="$accentSolid"
						color="white"
						onPress={() => {
							void handleImport()
						}}
						disabled={importing}
					>
						{importing ? 'Importing...' : 'Import EPUB'}
					</ActionButton>
				</XStack>
				<Text color="$muted">
					Books are sorted by your most recent reading activity so the next title is
					always near the top.
				</Text>
				{importError ? <Text color="$danger">{importError}</Text> : null}
			</PanelCard>

			<PanelCard>
				<Text fontFamily="$heading" fontSize="$7" color="$ink">
					All books
				</Text>
				{booksQuery.isLoading ? (
					<XStack alignItems="center" gap="$3">
						<Spinner color="$accentSolid" />
						<Text color="$muted">Loading your imported books...</Text>
					</XStack>
				) : null}
				{booksQuery.data?.length ? (
					<YStack gap="$3">
						{booksQuery.data.map((book) => (
							<BookWithProgress
								key={book.id}
								book={book}
								onPress={() => {
									router.push({
										pathname: '/book/[bookId]' as Href,
										params: { bookId: book.id },
									} as Href)
								}}
							/>
						))}
					</YStack>
				) : null}
				{!booksQuery.isLoading && !booksQuery.data?.length ? (
					<YStack gap="$3">
						<Text color="$muted">
							Your library is empty. Start by importing an EPUB from your device.
						</Text>
						<Text color="$muted">
							Everything stays available offline after import, with or without an
							account.
						</Text>
					</YStack>
				) : null}
			</PanelCard>
		</ScreenShell>
	)
}

function BookWithProgress({
	book,
	onPress,
}: {
	book: Awaited<ReturnType<typeof listBooks>>[number]
	onPress: () => void
}) {
	const db = useSQLiteContext()
	const readingStateQuery = useQuery({
		queryKey: ['reading-state', book.id],
		queryFn: () => getReadingState(db, book.id),
	})

	const progress =
		typeof readingStateQuery.data?.progressPercent === 'number'
			? `${Math.round(readingStateQuery.data.progressPercent)}% read`
			: undefined

	return <BookCard book={book} onPress={onPress} progressLabel={progress} />
}
