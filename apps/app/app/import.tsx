import { useEffect, useState } from 'react'

import { Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useSQLiteContext } from 'expo-sqlite'
import { ActivityIndicator, Text, View } from 'react-native'

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
			<View className="gap-4 items-center flex-col">
				<ActivityIndicator size="large" color="#496360" />
				<Text className="font-heading text-3xl text-kern-ink">
					Importing
				</Text>
				<Text className="text-center text-kern-muted font-ui">
					{message}
				</Text>
			</View>
		</FullScreenCard>
	)
}
