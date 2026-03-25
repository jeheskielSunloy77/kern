import { PropsWithChildren } from 'react'

import { SafeAreaView } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

export function FullScreenCard({ children }: PropsWithChildren) {
	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: '#f5eddc' }}>
			<YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
				{children}
			</YStack>
		</SafeAreaView>
	)
}
