import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
	name: 'kern',
	slug: 'kern-reader',
	scheme: 'kernreader',
	version: '1.0.0',
	orientation: 'portrait',
	icon: './assets/icon.png',
	userInterfaceStyle: 'light',
	splash: {
		image: './assets/splash-icon.png',
		resizeMode: 'contain',
		backgroundColor: '#f5eddc',
	},
	assetBundlePatterns: ['**/*'],
	plugins: ['expo-router'],
	experiments: {
		typedRoutes: true,
	},
	android: {
		package: 'com.kern.reader',
		adaptiveIcon: {
			foregroundImage: './assets/android-icon-foreground.png',
			backgroundImage: './assets/android-icon-background.png',
			monochromeImage: './assets/android-icon-monochrome.png',
		},
		intentFilters: [
			{
				action: 'VIEW',
				category: ['DEFAULT', 'BROWSABLE'],
				data: [{ mimeType: 'application/epub+zip' }],
			},
			{
				action: 'VIEW',
				category: ['DEFAULT', 'BROWSABLE'],
				data: [{ scheme: 'file' }, { scheme: 'content' }],
			},
		],
	},
	extra: {
		apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080',
		googleAndroidClientId:
			process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
		googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
	},
}

export default config
