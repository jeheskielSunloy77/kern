import { PropsWithChildren } from 'react'

import { Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export function SheetModal({
	visible,
	title,
	onClose,
	children,
}: PropsWithChildren<{
	visible: boolean
	title: string
	onClose: () => void
}>) {
	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<SafeAreaView style={{ flex: 1 }} className="bg-kern-surface">
				<View className="flex-1 p-5 gap-4">
					<Pressable onPress={onClose}>
						<Text className="text-kern-primary font-ui">Close</Text>
					</Pressable>
					<Text className="font-heading text-[28px] text-kern-ink">
						{title}
					</Text>
					{children}
				</View>
			</SafeAreaView>
		</Modal>
	)
}
