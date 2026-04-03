import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

export function ActionButton({
	children,
	onPress,
	className = 'bg-kern-primary',
	textClassName = 'text-[#e0fef9]',
	disabled = false,
}: {
	children: ReactNode
	onPress: () => void
	className?: string
	textClassName?: string
	disabled?: boolean
}) {
	return (
		<Pressable
			onPress={disabled ? undefined : onPress}
			className={`px-4 py-3 rounded-2xl min-h-[44px] items-center justify-center ${className} ${disabled ? 'opacity-45' : ''}`}
			style={({ pressed }) => ({
				opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
			})}
		>
			<Text className={`font-ui-bold font-semibold ${textClassName}`}>
				{children}
			</Text>
		</Pressable>
	)
}
