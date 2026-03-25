import { useEffect, useState } from 'react'

import * as Google from 'expo-auth-session/providers/google'
import * as WebBrowser from 'expo-web-browser'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSQLiteContext } from 'expo-sqlite'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { ActionButton } from '../../components/action-button'
import { FormField } from '../../components/form-field'
import { PanelCard } from '../../components/panel-card'
import { ScreenShell } from '../../components/screen-shell'
import { appConfig } from '../../config/app-config'
import { api, explainApiError } from '../../data/api'
import { persistSession, useSessionStore } from '../../state/session-store'
import { clearSyncAccounts, getSyncAccount, listSyncLinks, upsertSyncAccount } from '../../storage/sync-repository'
import { runSync } from '../../sync/engine'

WebBrowser.maybeCompleteAuthSession()

export function AccountScreen() {
	const db = useSQLiteContext()
	const queryClient = useQueryClient()
	const session = useSessionStore((state) => state.session)
	const syncStatus = useSessionStore((state) => state.syncStatus)
	const [mode, setMode] = useState<'login' | 'register'>('login')
	const [identifier, setIdentifier] = useState('')
	const [email, setEmail] = useState('')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const accountQuery = useQuery({
		queryKey: ['sync-account'],
		queryFn: () => getSyncAccount(db),
	})
	const syncLinksQuery = useQuery({
		queryKey: ['sync-links'],
		queryFn: () => listSyncLinks(db),
	})

	const googleConfigured = Boolean(
		appConfig.googleAndroidClientId || appConfig.googleWebClientId
	)
	const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
		androidClientId:
			appConfig.googleAndroidClientId || 'missing-google-client-id',
		webClientId: appConfig.googleWebClientId || 'missing-google-client-id',
	})

	useEffect(() => {
		const idToken =
			response?.type === 'success'
				? response.params?.id_token || response.authentication?.idToken
				: null

		if (!idToken) {
			return
		}

		void handleGoogleAuth(String(idToken))
	}, [response])

	async function finishSession(nextSession: Awaited<ReturnType<typeof api.login>>) {
		await persistSession(nextSession)
		await upsertSyncAccount(db, {
			userId: nextSession.user.id,
			email: nextSession.user.email,
			username: nextSession.user.username,
		})
		await queryClient.invalidateQueries({ queryKey: ['sync-account'] })
		await runSync(db, 'sign-in')
	}

	async function handleEmailAuth() {
		try {
			setBusy(true)
			setError(null)

			if (mode === 'login') {
				const nextSession = await api.login({ identifier, password })
				await finishSession(nextSession)
			} else {
				const nextSession = await api.register({ email, username, password })
				await finishSession(nextSession)
			}
		} catch (nextError) {
			setError(explainApiError(nextError))
		} finally {
			setBusy(false)
		}
	}

	async function handleGoogleAuth(idToken: string) {
		try {
			setBusy(true)
			setError(null)
			const nextSession = await api.loginWithGoogle(idToken)
			await finishSession(nextSession)
		} catch (nextError) {
			setError(explainApiError(nextError))
		} finally {
			setBusy(false)
		}
	}

	async function handleLogout() {
		if (!session) {
			return
		}

		setBusy(true)
		await api.logout(session.refreshToken.token)
		await persistSession(null)
		await clearSyncAccounts(db)
		await queryClient.invalidateQueries({ queryKey: ['sync-account'] })
		setBusy(false)
	}

	return (
		<ScreenShell>
			<YStack gap="$3">
				<Text fontFamily="$heading" fontSize="$8" color="$ink">
					Account
				</Text>
				<Text color="$muted" fontSize="$4">
					Connect sync when you want continuity across devices. Stay local-first when
					you do not.
				</Text>
			</YStack>

			<PanelCard>
				<Text color="$muted">
					Mobile stays local-first. Sync carries reading state, bookmarks,
					highlights, and notes, but it does not upload raw EPUB files.
				</Text>
			</PanelCard>

			{session ? (
				<PanelCard>
					<Text fontFamily="$heading" fontSize="$7" color="$ink">
						Connected
					</Text>
					<Text color="$muted">Signed in as {session.user.username}</Text>
					<Text color="$muted">{session.user.email}</Text>
					<Text color="$muted">
						Last sync: {accountQuery.data?.lastSyncedAt ?? 'Not synced yet'}
					</Text>
					<Text color="$muted">
						Linked library matches: {syncLinksQuery.data?.length ?? 0}
					</Text>
					<XStack gap="$3" flexWrap="wrap">
						<ActionButton
							backgroundColor="$accentSolid"
							color="white"
							onPress={() => {
								void runSync(db, 'manual')
							}}
							disabled={busy}
						>
							Run Sync
						</ActionButton>
						<ActionButton backgroundColor="$backgroundSoft" color="$danger" onPress={() => void handleLogout()}>
							Log Out
						</ActionButton>
					</XStack>
					<Text color={syncStatus.phase === 'error' ? '$danger' : '$muted'}>
						{syncStatus.message ?? 'Idle'}
					</Text>
				</PanelCard>
			) : (
				<PanelCard>
					<XStack gap="$3">
						<ActionButton
							backgroundColor={mode === 'login' ? '$accentSolid' : '$accentSoft'}
							color={mode === 'login' ? 'white' : '$accent'}
							onPress={() => setMode('login')}
						>
							Login
						</ActionButton>
						<ActionButton
							backgroundColor={mode === 'register' ? '$accentSolid' : '$accentSoft'}
							color={mode === 'register' ? 'white' : '$accent'}
							onPress={() => setMode('register')}
						>
							Register
						</ActionButton>
					</XStack>
					{mode === 'login' ? (
						<FormField
							label="Email or username"
							value={identifier}
							onChangeText={setIdentifier}
							placeholder="reader@example.com"
						/>
					) : (
						<>
							<FormField
								label="Email"
								value={email}
								onChangeText={setEmail}
								keyboardType="email-address"
								placeholder="reader@example.com"
							/>
							<FormField
								label="Username"
								value={username}
								onChangeText={setUsername}
								placeholder="jay"
							/>
						</>
					)}
					<FormField
						label="Password"
						value={password}
						onChangeText={setPassword}
						secureTextEntry
						placeholder="At least 8 characters"
					/>
					<XStack gap="$3" flexWrap="wrap" alignItems="center">
						<ActionButton
							backgroundColor="$accentSolid"
							color="white"
							onPress={() => {
								void handleEmailAuth()
							}}
							disabled={busy}
						>
							{busy ? 'Working...' : mode === 'login' ? 'Login' : 'Create account'}
						</ActionButton>
						<ActionButton
							backgroundColor="$accentSoft"
							color="$accent"
							disabled={!googleConfigured || busy || !request}
							onPress={() => {
								void promptAsync()
							}}
						>
							Continue with Google
						</ActionButton>
						{busy ? <Spinner color="$accentSolid" /> : null}
					</XStack>
					{!googleConfigured ? (
						<Text color="$muted">
							Set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` to enable Google sign-in.
						</Text>
					) : null}
					{error ? <Text color="$danger">{error}</Text> : null}
				</PanelCard>
			)}
		</ScreenShell>
	)
}
