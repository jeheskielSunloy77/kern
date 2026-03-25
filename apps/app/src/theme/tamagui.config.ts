import {
	createFont,
	createTamagui,
	createTokens,
} from 'tamagui'

const headingFont = createFont({
	family: 'Literata_600SemiBold',
	size: {
		1: 12,
		2: 14,
		3: 16,
		4: 18,
		5: 20,
		6: 24,
		7: 30,
		8: 36,
	},
	lineHeight: {
		1: 16,
		2: 18,
		3: 20,
		4: 24,
		5: 28,
		6: 32,
		7: 38,
		8: 42,
	},
	weight: {
		4: '400',
		6: '600',
		7: '700',
	},
})

const bodyFont = createFont({
	family: 'Manrope_400Regular',
	size: {
		1: 12,
		2: 14,
		3: 16,
		4: 18,
		5: 20,
		6: 24,
	},
	lineHeight: {
		1: 16,
		2: 20,
		3: 22,
		4: 26,
		5: 28,
		6: 32,
	},
	weight: {
		4: '400',
		6: '600',
		7: '700',
	},
})

const tokens = createTokens({
	color: {
		background: '#f5eddc',
		backgroundSoft: '#fcf7eb',
		card: '#fffdf7',
		border: '#dbcdb0',
		ink: '#2b241c',
		muted: '#766b5e',
		accent: '#51624b',
		accentSoft: '#dde8d7',
		accentSolid: '#5f7858',
		danger: '#a6453e',
		highlight: '#ead488',
	},
	space: {
		0: 0,
		1: 4,
		2: 8,
		3: 12,
		4: 16,
		5: 20,
		6: 24,
		7: 32,
		8: 40,
		true: 16,
	},
	size: {
		0: 0,
		1: 12,
		2: 14,
		3: 16,
		4: 18,
		5: 20,
		6: 24,
		7: 32,
		8: 40,
		true: 16,
	},
	radius: {
		0: 0,
		1: 6,
		2: 10,
		3: 16,
		4: 24,
	},
	zIndex: {
		0: 0,
		1: 100,
		2: 200,
	},
})

export const tamaguiConfig = createTamagui({
	tokens,
	fonts: {
		body: bodyFont,
		heading: headingFont,
	},
	themes: {
		paper: {
			background: '$background',
			backgroundSoft: '$backgroundSoft',
			color: '$ink',
			card: '$card',
			borderColor: '$border',
			accent: '$accent',
			accentSoft: '$accentSoft',
			accentSolid: '$accentSolid',
			ink: '$ink',
			muted: '$muted',
			danger: '$danger',
			highlight: '$highlight',
		},
	},
	defaultTheme: 'paper',
	defaultFont: 'body',
	shorthands: {
		bg: 'backgroundColor',
		br: 'borderRadius',
		px: 'paddingHorizontal',
		py: 'paddingVertical',
		mx: 'marginHorizontal',
		my: 'marginVertical',
	},
})
