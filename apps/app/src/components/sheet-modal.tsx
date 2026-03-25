import { PropsWithChildren } from 'react'

import { Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, YStack } from 'tamagui'

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
			<SafeAreaView style={{ flex: 1, backgroundColor: '#f5eddc' }}>
				<YStack flex={1} padding="$5" gap="$4">
					<Pressable onPress={onClose}>
						<Text color="$accentSolid">Close</Text>
					</Pressable>
					<Text fontFamily="$heading" fontSize="$7" color="$ink">
						{title}
					</Text>
					{children}
				</YStack>
			</SafeAreaView>
		</Modal>
	)
}
