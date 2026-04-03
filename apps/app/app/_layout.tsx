import { Stack } from 'expo-router'

import '../global.css';
import { AppProviders } from '../src/bootstrap/app-providers'

export default function RootLayout() {
	return (
		<AppProviders>
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: {
						backgroundColor: '#f5eddc',
					},
				}}
			>
				<Stack.Screen name="(tabs)" />
				<Stack.Screen name="index" />
				<Stack.Screen
					name="book/[bookId]"
					options={{
						animation: 'slide_from_right',
						presentation: 'fullScreenModal',
					}}
				/>
				<Stack.Screen
					name="import"
					options={{
						presentation: 'transparentModal',
						animation: 'fade',
					}}
				/>
			</Stack>
		</AppProviders>
	)
}
