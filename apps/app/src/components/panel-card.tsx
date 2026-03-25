import { PropsWithChildren } from 'react'

import { YStack } from 'tamagui'

export function PanelCard({ children }: PropsWithChildren) {
	return (
		<YStack
			backgroundColor="$card"
			borderColor="$borderColor"
			borderWidth={1}
			borderRadius="$3"
			padding="$4"
			gap="$3"
		>
			{children}
		</YStack>
	)
}
