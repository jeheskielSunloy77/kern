import { PropsWithChildren } from 'react'

import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

export function ScreenShell({
	children,
	scroll = true,
}: PropsWithChildren<{ scroll?: boolean }>) {
	const content = (
		<YStack flex={1} padding="$5" gap="$5" backgroundColor="$background">
			{children}
		</YStack>
	)

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: '#f5eddc' }}>
			{scroll ? (
				<ScrollView
					contentContainerStyle={{ flexGrow: 1 }}
					showsVerticalScrollIndicator={false}
				>
					{content}
				</ScrollView>
			) : (
				content
			)}
		</SafeAreaView>
	)
}
