import Constants from 'expo-constants'

type ExtraConfig = {
	apiUrl?: string
	googleAndroidClientId?: string
	googleWebClientId?: string
}

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig

export const appConfig = {
	apiBaseUrl: (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? '').replace(
		/\/$/,
		''
	),
	googleAndroidClientId:
		process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ??
		extra.googleAndroidClientId ??
		'',
	googleWebClientId:
		process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
		extra.googleWebClientId ??
		'',
}
