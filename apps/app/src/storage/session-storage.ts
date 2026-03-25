import * as SecureStore from 'expo-secure-store'

import type { AuthSession } from '../state/session-store'

const SESSION_KEY = 'kern.mobile.session'

export async function loadSessionSnapshot(): Promise<AuthSession | null> {
	const raw = await SecureStore.getItemAsync(SESSION_KEY)
	if (!raw) {
		return null
	}

	try {
		return JSON.parse(raw) as AuthSession
	} catch {
		await SecureStore.deleteItemAsync(SESSION_KEY)
		return null
	}
}

export async function saveSessionSnapshot(session: AuthSession) {
	await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
}

export async function clearSessionSnapshot() {
	await SecureStore.deleteItemAsync(SESSION_KEY)
}
