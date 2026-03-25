import { PropsWithChildren, useMemo } from 'react'

import {
	Literata_400Regular,
	Literata_600SemiBold,
	Literata_700Bold,
	useFonts as useLiterataFonts,
} from '@expo-google-fonts/literata'
import {
	Manrope_400Regular,
	Manrope_600SemiBold,
	Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts as useExpoFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Theme, TamaguiProvider } from 'tamagui'

import { ReaderProvider } from '@epubjs-react-native/core'

import { SessionBootstrap } from './session-bootstrap'
import { DATABASE_NAME, initializeDatabase } from '../storage/database'
import { tamaguiConfig } from '../theme/tamagui.config'

void SplashScreen.preventAutoHideAsync().catch(() => {})

export function AppProviders({ children }: PropsWithChildren) {
	const [googleFontsLoaded] = useLiterataFonts({
		Literata_400Regular,
		Literata_600SemiBold,
		Literata_700Bold,
	})
	const [uiFontsLoaded] = useExpoFonts({
		Manrope_400Regular,
		Manrope_600SemiBold,
		Manrope_700Bold,
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
			<TamaguiProvider config={tamaguiConfig} defaultTheme="paper">
				<Theme name="paper">
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
				</Theme>
			</TamaguiProvider>
		</GestureHandlerRootView>
	)
}
