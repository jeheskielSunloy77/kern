import { Tabs } from 'expo-router'
import { Text, YStack } from 'tamagui'

function TabGlyph({
	label,
	focused,
}: {
	label: string
	focused: boolean
}) {
	return (
		<YStack alignItems="center" gap="$1">
			<YStack
				width={focused ? 28 : 8}
				height={6}
				borderRadius="$4"
				backgroundColor={focused ? '$accentSolid' : '$border'}
			/>
			<Text
				fontFamily="$body"
				fontSize="$2"
				fontWeight={focused ? '700' : '600'}
				color={focused ? '$ink' : '$muted'}
			>
				{label}
			</Text>
		</YStack>
	)
}

export default function TabsLayout() {
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				sceneStyle: {
					backgroundColor: '#f5eddc',
				},
				tabBarShowLabel: false,
				tabBarStyle: {
					backgroundColor: '#fcf7eb',
					borderTopColor: '#d8ccb3',
					borderTopWidth: 1,
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
				name="home"
				options={{
					tabBarIcon: ({ focused }) => (
						<TabGlyph label="Home" focused={focused} />
					),
				}}
			/>
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
				name="account"
				options={{
					tabBarIcon: ({ focused }) => (
						<TabGlyph label="Account" focused={focused} />
					),
				}}
			/>
		</Tabs>
	)
}
