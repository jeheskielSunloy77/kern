import { PropsWithChildren } from 'react'
import { View } from 'react-native'

export function PanelCard({ children }: PropsWithChildren) {
	return (
		<View className="bg-kern-surface-container rounded-[24px] p-4 flex-col gap-y-3">
			{children}
		</View>
	)
}
