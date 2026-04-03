import { useState } from 'react'
import { ActivityIndicator, View, Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Href, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'

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
			<View className="py-4 flex-col gap-1">
				<Text className="font-heading text-4xl text-kern-ink">
					My Library
				</Text>
				<Text className="font-ui text-kern-muted">
					{booksQuery.data ? `${booksQuery.data.length} Volumes Collected` : '... Volumes Collected'}
				</Text>
			</View>

			<PanelCard>
				<View className="flex-row gap-3 flex-wrap items-center">
					<ActionButton
						className="bg-kern-primary"
						textClassName="text-[#e0fef9]"
						onPress={() => {
							void handleImport()
						}}
						disabled={importing}
					>
						{importing ? 'Importing...' : 'Import EPUB'}
					</ActionButton>
				</View>
				<Text className="text-kern-muted font-ui leading-tight mt-1">
					Books are sorted by your most recent reading activity so the next title is
					always near the top.
				</Text>
				{importError ? <Text className="text-kern-danger font-ui">{importError}</Text> : null}
			</PanelCard>

			<View className="flex-col gap-4 mt-2">
				{booksQuery.isLoading ? (
					<View className="flex-row items-center gap-3">
						<ActivityIndicator color="#496360" />
						<Text className="text-kern-muted font-ui">Loading your imported books...</Text>
					</View>
				) : null}
				
				{booksQuery.data?.length ? (
					<View className="flex-col gap-3">
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
					</View>
				) : null}
				
				{!booksQuery.isLoading && !booksQuery.data?.length ? (
					<View className="flex-col gap-3 p-4 bg-kern-surface-container rounded-[24px]">
						<Text className="text-kern-muted font-ui">
							Your library is empty. Start by importing an EPUB from your device.
						</Text>
						<Text className="text-kern-muted font-ui">
							Everything stays available offline after import.
						</Text>
					</View>
				) : null}
			</View>
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
