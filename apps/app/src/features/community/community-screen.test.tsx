jest.mock('tamagui', () => {
	const React = require('react')
	const { Text } = require('react-native')

	return {
		Text,
		YStack: ({ children }: { children: React.ReactNode }) => children,
	}
})

jest.mock('../../components/panel-card', () => ({
	PanelCard: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../components/screen-shell', () => ({
	ScreenShell: ({ children }: { children: React.ReactNode }) => children,
}))

import { render } from '@testing-library/react-native'

import { CommunityScreen } from './community-screen'

describe('CommunityScreen', () => {
	it('renders the requested placeholder copy', () => {
		const screen = render(<CommunityScreen />)

		expect(screen.getByText('Comming soon')).toBeTruthy()
	})
})
