import { PropsWithChildren } from 'react'

import { SafeAreaView } from 'react-native-safe-area-context'
import { View } from 'react-native'

export function FullScreenCard({ children }: PropsWithChildren) {
	return (
		<SafeAreaView style={{ flex: 1 }} className="bg-kern-surface">
			<View className="flex-1 justify-center items-center p-6 bg-kern-surface">
				{children}
			</View>
		</SafeAreaView>
	)
}
