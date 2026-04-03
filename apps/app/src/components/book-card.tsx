import { Pressable, Image, View, Text } from 'react-native'
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
				<View className="flex-row gap-4 items-center">
					<View className="w-[72px] h-[104px] rounded-sm overflow-hidden bg-kern-primary-container items-center justify-center">
						{book.coverUri ? (
							<Image
								source={{ uri: book.coverUri }}
								style={{ width: 72, height: 104 }}
								resizeMode="cover"
							/>
						) : (
							<Text className="font-ui text-[10px] text-kern-primary text-center tracking-widest">
								EPUB
							</Text>
						)}
					</View>
					
					<View className="flex-1 gap-1">
						<Text className="font-heading text-lg text-kern-ink leading-tight">
							{book.title}
						</Text>
						<Text className="font-ui text-sm text-kern-muted">
							{book.authors || 'Unknown author'}
						</Text>
						{progressLabel ? (
							<Text className="text-kern-primary text-xs font-ui tracking-wide">
								{progressLabel}
							</Text>
						) : null}
					</View>
				</View>
			</PanelCard>
		</Pressable>
	)
}
