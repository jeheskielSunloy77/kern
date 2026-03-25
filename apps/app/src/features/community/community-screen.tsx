import { Text, YStack } from 'tamagui'

import { PanelCard } from '../../components/panel-card'
import { ScreenShell } from '../../components/screen-shell'

export function CommunityScreen() {
	return (
		<ScreenShell>
			<YStack gap='$3'>
				<Text fontFamily='$heading' fontSize='$8' color='$ink'>
					Community
				</Text>
				<Text color='$muted' fontSize='$4'>
					A dedicated place for reader conversations, shared highlights, and circles
					will live here.
				</Text>
			</YStack>

			<PanelCard>
				<YStack
					gap='$4'
					minHeight={220}
					justifyContent='center'
					alignItems='center'
				>
					<YStack
						width={72}
						height={72}
						borderRadius='$4'
						backgroundColor='$accentSoft'
						alignItems='center'
						justifyContent='center'
					>
						<Text fontFamily='$heading' fontSize='$7' color='$accent'>
							C
						</Text>
					</YStack>
					<YStack gap='$2' alignItems='center'>
						<Text fontFamily='$heading' fontSize='$7' color='$ink'>
							Coming soon
						</Text>
						<Text color='$muted' textAlign='center'>
							Community is on the roadmap. For now, your reading space stays fast,
							private, and offline-first.
						</Text>
					</YStack>
				</YStack>
			</PanelCard>
		</ScreenShell>
	)
}
