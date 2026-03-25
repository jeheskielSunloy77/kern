import { useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Href, useRouter } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'
import { useSQLiteContext } from 'expo-sqlite'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { ActionButton } from '../../components/action-button'
import { BookCard } from '../../components/book-card'
import { PanelCard } from '../../components/panel-card'
import { ScreenShell } from '../../components/screen-shell'
import { useSessionStore } from '../../state/session-store'
import { pickAndImportEpub } from '../../storage/import-epub'
import { getReadingState, listBooks } from '../../storage/library-repository'
import { getSyncAccount } from '../../storage/sync-repository'
import { coerceErrorMessage } from '../../storage/utils'

export function HomeScreen() {
	const db = useSQLiteContext()
	const router = useRouter()
	const queryClient = useQueryClient()
	const session = useSessionStore((state) => state.session)
	const syncStatus = useSessionStore((state) => state.syncStatus)
	const [importError, setImportError] = useState<string | null>(null)
	const [importing, setImporting] = useState(false)

	const booksQuery = useQuery({
		queryKey: ['books'],
		queryFn: () => listBooks(db),
	})
	const accountQuery = useQuery({
		queryKey: ['sync-account'],
		queryFn: () => getSyncAccount(db),
	})

	const books = booksQuery.data ?? []
	const leadBook = books[0] ?? null
	const recentBooks = books.slice(0, 3)

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
			<PanelCard>
				<YStack gap="$4">
					<YStack gap="$2">
						<Text color="$accent" fontSize="$2" fontWeight="700" textTransform="uppercase">
							Kern mobile
						</Text>
						<Text fontFamily="$heading" fontSize="$8" color="$ink">
							Read local. Sync when it helps.
						</Text>
						<Text color="$muted" fontSize="$4">
							A calmer reading dashboard with your next action, your active book,
							and your account state in one place.
						</Text>
					</YStack>
					<XStack gap="$3" flexWrap="wrap">
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
						<ActionButton
							backgroundColor="$backgroundSoft"
							color="$ink"
							onPress={() => {
								router.navigate('/library' as Href)
							}}
						>
							Open Library
						</ActionButton>
					</XStack>
					{importError ? <Text color="$danger">{importError}</Text> : null}
				</YStack>
			</PanelCard>

			<XStack gap="$3" flexWrap="wrap">
				<MetricCard
					title="Library"
					value={booksQuery.isLoading ? '...' : String(books.length)}
					copy="Imported books ready offline"
				/>
				<MetricCard
					title="Sync"
					value={syncStatus.phase}
					copy={session ? 'Account connected' : 'Local only'}
				/>
			</XStack>

			<PanelCard>
				<Text fontFamily="$heading" fontSize="$7" color="$ink">
					Continue reading
				</Text>
				{booksQuery.isLoading ? (
					<XStack alignItems="center" gap="$3">
						<Spinner color="$accentSolid" />
						<Text color="$muted">Loading your dashboard...</Text>
					</XStack>
				) : null}
				{leadBook ? (
					<ContinueReadingCard
						book={leadBook}
						onPress={() => {
							router.push({
								pathname: '/book/[bookId]' as Href,
								params: { bookId: leadBook.id },
							} as Href)
						}}
					/>
				) : (
					<YStack gap="$3">
						<Text color="$muted">
							Import your first EPUB to build a personal reading stack.
						</Text>
						<Text color="$muted">
							Kern keeps the files on-device first and only syncs reading data when
							you connect an account.
						</Text>
					</YStack>
				)}
			</PanelCard>

			<PanelCard>
				<XStack justifyContent="space-between" alignItems="center">
					<YStack gap="$1" flex={1}>
						<Text fontFamily="$heading" fontSize="$7" color="$ink">
							Account snapshot
						</Text>
						<Text color="$muted">
							{accountQuery.data
								? `Connected as ${accountQuery.data.username}`
								: 'No account connected yet'}
						</Text>
					</YStack>
					<ActionButton
						backgroundColor="$accentSoft"
						color="$accent"
						onPress={() => {
							router.navigate('/account' as Href)
						}}
					>
						{session ? 'Manage Account' : 'Connect Account'}
					</ActionButton>
				</XStack>
				<Text color={syncStatus.phase === 'error' ? '$danger' : '$muted'}>
					{accountQuery.data
						? `Last sync ${accountQuery.data.lastSyncedAt ?? 'has not run yet'}.`
						: 'Your library stays private on this device until you sign in.'}
				</Text>
				{syncStatus.message ? (
					<Text color={syncStatus.phase === 'error' ? '$danger' : '$muted'}>
						{syncStatus.message}
					</Text>
				) : null}
			</PanelCard>

			<PanelCard>
				<XStack justifyContent="space-between" alignItems="center">
					<Text fontFamily="$heading" fontSize="$7" color="$ink">
						Recent books
					</Text>
					<ActionButton
						backgroundColor="$backgroundSoft"
						color="$ink"
						onPress={() => {
							router.navigate('/library' as Href)
						}}
					>
						View all
					</ActionButton>
				</XStack>
				{recentBooks.length ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{ gap: 12, paddingRight: 4 }}
					>
						{recentBooks.map((book) => (
							<RecentBookCard
								key={book.id}
								title={book.title}
								authors={book.authors}
								onPress={() => {
									router.push({
										pathname: '/book/[bookId]' as Href,
										params: { bookId: book.id },
									} as Href)
								}}
							/>
						))}
					</ScrollView>
				) : (
					<Text color="$muted">Your recent books will show up here after import.</Text>
				)}
			</PanelCard>
		</ScreenShell>
	)
}

function MetricCard({
	title,
	value,
	copy,
}: {
	title: string
	value: string
	copy: string
}) {
	return (
		<YStack
			flexBasis="48%"
			flexGrow={1}
			backgroundColor="$card"
			borderColor="$borderColor"
			borderWidth={1}
			borderRadius="$3"
			padding="$4"
			gap="$2"
		>
			<Text color="$muted" fontSize="$2" textTransform="uppercase" fontWeight="700">
				{title}
			</Text>
			<Text fontFamily="$heading" fontSize="$7" color="$ink">
				{value}
			</Text>
			<Text color="$muted">{copy}</Text>
		</YStack>
	)
}

function ContinueReadingCard({
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
			: 'Ready to open'

	return <BookCard book={book} onPress={onPress} progressLabel={progress} />
}

function RecentBookCard({
	title,
	authors,
	onPress,
}: {
	title: string
	authors?: string
	onPress: () => void
}) {
	return (
		<Pressable onPress={onPress}>
			<PanelCard>
				<YStack width={160} gap="$2">
					<Text fontFamily="$heading" fontSize="$5" color="$ink" numberOfLines={2}>
						{title}
					</Text>
					<Text color="$muted" numberOfLines={1}>
						{authors || 'Unknown author'}
					</Text>
				</YStack>
			</PanelCard>
		</Pressable>
	)
}
