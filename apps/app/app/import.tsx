import { useEffect, useState } from 'react'

import { Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { Spinner, Text, YStack } from 'tamagui'

import { FullScreenCard } from '../src/components/full-screen-card'
import { importEpubFromUri } from '../src/storage/import-epub'

export default function ImportRoute() {
	const params = useLocalSearchParams<{ uri?: string; name?: string }>()
	const db = useSQLiteContext()
	const router = useRouter()
	const [message, setMessage] = useState('Preparing import...')

	useEffect(() => {
		let cancelled = false

		async function run() {
			if (!params.uri) {
				router.replace('/' as Href)
				return
			}

			try {
				setMessage('Importing EPUB into your local library...')
				const result = await importEpubFromUri(
					db,
					String(params.uri),
					params.name ? String(params.name) : undefined
				)
				if (!cancelled) {
					router.replace({
						pathname: '/book/[bookId]' as Href,
						params: { bookId: result.book.id },
					} as Href)
				}
			} catch (error) {
				if (!cancelled) {
					setMessage(
						error instanceof Error ? error.message : 'Import failed.'
					)
					setTimeout(() => {
						router.replace('/' as Href)
					}, 1600)
				}
			}
		}

		void run()

		return () => {
			cancelled = true
		}
	}, [db, params.name, params.uri, router])

	return (
		<FullScreenCard>
			<YStack gap="$4" alignItems="center">
				<Spinner size="large" color="$accentSolid" />
				<Text fontFamily="$heading" fontSize="$7" color="$ink">
					Importing
				</Text>
				<Text textAlign="center" color="$muted">
					{message}
				</Text>
			</YStack>
		</FullScreenCard>
	)
}
