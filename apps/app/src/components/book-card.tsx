import { Pressable } from 'react-native'
import { Image } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'

import type { BookRecord } from '../storage/models'
import { PanelCard } from './panel-card'

export function BookCard({
	book,
	onPress,
	progressLabel,
}: {
	book: BookRecord
	onPress: () => void
	progressLabel?: string
}) {
	return (
		<Pressable onPress={onPress}>
			<PanelCard>
				<XStack gap="$4" alignItems="center">
					<YStack
						width={72}
						height={104}
						borderRadius="$2"
						overflow="hidden"
						backgroundColor="$accentSoft"
						alignItems="center"
						justifyContent="center"
					>
						{book.coverUri ? (
							<Image
								source={{ uri: book.coverUri }}
								style={{ width: 72, height: 104 }}
								resizeMode="cover"
							/>
						) : (
							<Text
								fontFamily="$heading"
								fontSize="$6"
								color="$accent"
								textAlign="center"
							>
								EPUB
							</Text>
						)}
					</YStack>
					<YStack flex={1} gap="$2">
						<Text fontFamily="$heading" fontSize="$6" color="$ink">
							{book.title}
						</Text>
						<Text color="$muted">{book.authors || 'Unknown author'}</Text>
						{progressLabel ? (
							<Text color="$accentSolid">{progressLabel}</Text>
						) : null}
						<Text color="$muted">
							{book.language ? `Language: ${book.language}` : 'Offline import'}
						</Text>
					</YStack>
				</XStack>
			</PanelCard>
		</Pressable>
	)
}
