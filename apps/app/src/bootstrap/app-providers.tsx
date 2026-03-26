import { PropsWithChildren, useMemo } from 'react'

import {
	Inter_400Regular,
	Inter_600SemiBold,
	Inter_700Bold,
} from '@expo-google-fonts/inter'
import {
	Newsreader_400Regular,
	Newsreader_600SemiBold,
	Newsreader_700Bold,
	useFonts as useNewsreaderFonts,
} from '@expo-google-fonts/newsreader'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts as useExpoFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { ReaderProvider } from '@epubjs-react-native/core'

import { SessionBootstrap } from './session-bootstrap'
import { DATABASE_NAME, initializeDatabase } from '../storage/database'

void SplashScreen.preventAutoHideAsync().catch(() => {})

export function AppProviders({ children }: PropsWithChildren) {
	const [googleFontsLoaded] = useNewsreaderFonts({
		Newsreader_400Regular,
		Newsreader_600SemiBold,
		Newsreader_700Bold,
	})
	const [uiFontsLoaded] = useExpoFonts({
		Inter_400Regular,
		Inter_600SemiBold,
		Inter_700Bold,
	})
	const queryClient = useMemo(() => new QueryClient(), [])
	const fontsReady = googleFontsLoaded && uiFontsLoaded

	if (fontsReady) {
		void SplashScreen.hideAsync().catch(() => {})
	}

	if (!fontsReady) {
		return null
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<QueryClientProvider client={queryClient}>
				<ReaderProvider>
					<SQLiteProvider
						databaseName={DATABASE_NAME}
						onInit={initializeDatabase}
						useSuspense={false}
					>
						<SessionBootstrap>{children}</SessionBootstrap>
					</SQLiteProvider>
				</ReaderProvider>
			</QueryClientProvider>
		</GestureHandlerRootView>
	)
}
