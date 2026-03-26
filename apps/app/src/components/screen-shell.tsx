import { PropsWithChildren } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export function ScreenShell({
	children,
	scroll = true,
}: PropsWithChildren<{ scroll?: boolean }>) {
	const content = (
		<View className="flex-1 bg-kern-surface px-5 py-5 gap-y-5">
			{children}
		</View>
	)

	return (
		<SafeAreaView style={{ flex: 1 }} className="bg-kern-surface">
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
