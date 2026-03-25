import type { ReactNode } from 'react'

import { Pressable } from 'react-native'

import { Text, YStack } from 'tamagui'

export function ActionButton({
	children,
	onPress,
	backgroundColor = '$accentSoft',
	color = '$ink',
	disabled = false,
}: {
	children: ReactNode
	onPress: () => void
	backgroundColor?: string
	color?: string
	disabled?: boolean
}) {
	return (
		<Pressable
			onPress={disabled ? undefined : onPress}
			style={({ pressed }) => ({
				opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
			})}
		>
			<YStack
				paddingHorizontal="$4"
				paddingVertical="$3"
				borderRadius="$3"
				minHeight={44}
				alignItems="center"
				justifyContent="center"
				backgroundColor={backgroundColor}
				borderWidth={1}
				borderColor="$borderColor"
			>
				<Text color={color} fontWeight="600">
					{children}
				</Text>
			</YStack>
		</Pressable>
	)
}
