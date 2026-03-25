import { create } from 'zustand'

import {
	clearSessionSnapshot,
	loadSessionSnapshot,
	saveSessionSnapshot,
} from '../storage/session-storage'

export type UserProfile = {
	id: string
	email: string
	username: string
	avatarUrl?: string
	emailVerifiedAt?: string
}

export type AuthToken = {
	token: string
	expiresAt: string
}

export type AuthSession = {
	user: UserProfile
	token: AuthToken
	refreshToken: AuthToken
}

type SyncStatus =
	| {
			phase: 'idle' | 'running' | 'success'
			message?: string
			lastFinishedAt?: string
	  }
	| {
			phase: 'error'
			message: string
			lastFinishedAt?: string
	  }

type SessionState = {
	hydrated: boolean
	session: AuthSession | null
	syncStatus: SyncStatus
	setHydrated: (hydrated: boolean) => void
	setSession: (session: AuthSession | null) => void
	setSyncStatus: (status: SyncStatus) => void
}

export const useSessionStore = create<SessionState>((set) => ({
	hydrated: false,
	session: null,
	syncStatus: {
		phase: 'idle',
	},
	setHydrated: (hydrated) => set({ hydrated }),
	setSession: (session) => set({ session }),
	setSyncStatus: (syncStatus) => set({ syncStatus }),
}))

export async function hydrateSessionFromStorage() {
	const snapshot = await loadSessionSnapshot()
	useSessionStore.getState().setSession(snapshot)
	useSessionStore.getState().setHydrated(true)
}

export async function persistSession(session: AuthSession | null) {
	if (session) {
		await saveSessionSnapshot(session)
	} else {
		await clearSessionSnapshot()
	}

	useSessionStore.getState().setSession(session)
}
