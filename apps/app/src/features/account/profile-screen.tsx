import { View, Text } from 'react-native'

import { ScreenShell } from '../../components/screen-shell'
import { PanelCard } from '../../components/panel-card'

export function ProfileScreen() {
	return (
		<ScreenShell>
			<View className="flex-col gap-4 py-4">
				<Text className="font-heading text-4xl text-kern-ink">
					Profile
				</Text>
				<Text className="font-ui text-kern-muted text-lg">
					Reading habits and account settings.
				</Text>
			</View>

			<PanelCard>
				<View className="flex-col gap-2 items-center py-2">
					<Text className="font-heading text-2xl text-kern-ink">
						Guest Reader
					</Text>
					<Text className="text-kern-muted text-center font-ui mt-1">
						Your library stays private on this device until you sign in. (Authentication mocked per Stitch design)
					</Text>
				</View>
			</PanelCard>
		</ScreenShell>
	)
}
