import { Tabs } from 'expo-router'
import { Text, View } from 'react-native'

function TabGlyph({
	label,
	focused,
}: {
	label: string
	focused: boolean
}) {
	return (
		<View className="items-center gap-1">
			<View
				className={`h-1.5 rounded-full ${focused ? 'w-7 bg-kern-primary' : 'w-2 bg-kern-surface-highest'}`}
			/>
			<Text
				className={`font-ui text-xs ${focused ? 'font-bold text-kern-ink' : 'font-semibold text-kern-muted'}`}
			>
				{label}
			</Text>
		</View>
	)
}

export default function TabsLayout() {
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				sceneStyle: {
					backgroundColor: '#faf9f5', // kern-surface
				},
				tabBarShowLabel: false,
				tabBarStyle: {
					backgroundColor: '#f4f4ef', // kern-surface-low
					borderTopWidth: 0,
					elevation: 0,
					height: 82,
					paddingTop: 10,
					paddingBottom: 12,
				},
				tabBarItemStyle: {
					paddingVertical: 4,
				},
			}}
		>
			<Tabs.Screen
				name="library"
				options={{
					tabBarIcon: ({ focused }) => (
						<TabGlyph label="Library" focused={focused} />
					),
				}}
			/>
			<Tabs.Screen
				name="community"
				options={{
					tabBarIcon: ({ focused }) => (
						<TabGlyph label="Community" focused={focused} />
					),
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					tabBarIcon: ({ focused }) => (
						<TabGlyph label="Profile" focused={focused} />
					),
				}}
			/>
		</Tabs>
	)
}
