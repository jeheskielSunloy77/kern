import { PropsWithChildren, useEffect } from 'react'

import NetInfo from '@react-native-community/netinfo'
import { AppState } from 'react-native'
import { useSQLiteContext } from 'expo-sqlite'

import { hydrateSessionFromStorage, useSessionStore } from '../state/session-store'
import { runSync } from '../sync/engine'

export function SessionBootstrap({ children }: PropsWithChildren) {
	const db = useSQLiteContext()

	useEffect(() => {
		void hydrateSessionFromStorage()
	}, [])

	useEffect(() => {
		const appStateSub = AppState.addEventListener('change', (nextState) => {
			if (nextState === 'active' && useSessionStore.getState().session) {
				void runSync(db, 'foreground-resume')
			}
		})

		const netInfoSub = NetInfo.addEventListener((state) => {
			if (state.isConnected && useSessionStore.getState().session) {
				void runSync(db, 'connectivity-restored')
			}
		})

		return () => {
			appStateSub.remove()
			netInfoSub()
		}
	}, [db])

	return children
}
