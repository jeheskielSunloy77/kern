import {
	chooseReadingStateWinner,
	shouldApplyRemoteAnnotation,
} from './merge'

describe('sync merge rules', () => {
	it('prefers higher reading progress before timestamps', () => {
		const winner = chooseReadingStateWinner(
			{
				progressPercent: 72,
				updatedAt: '2026-03-24T10:00:00.000Z',
			},
			{
				progressPercent: 41,
				updatedAt: '2026-03-24T11:00:00.000Z',
			}
		)

		expect(winner).toBe('local')
	})

	it('falls back to the newest timestamp when progress ties', () => {
		const winner = chooseReadingStateWinner(
			{
				progressPercent: 51,
				updatedAt: '2026-03-24T09:00:00.000Z',
			},
			{
				progressPercent: 51,
				updatedAt: '2026-03-24T12:00:00.000Z',
			}
		)

		expect(winner).toBe('remote')
	})

	it('does not overwrite a pending local annotation with a remote copy', () => {
		const shouldApply = shouldApplyRemoteAnnotation(
			{
				updatedAt: '2026-03-24T08:00:00.000Z',
			},
			{
				updatedAt: '2026-03-24T09:00:00.000Z',
			},
			true
		)

		expect(shouldApply).toBe(false)
	})

	it('applies a newer remote annotation when there is no pending local change', () => {
		const shouldApply = shouldApplyRemoteAnnotation(
			{
				updatedAt: '2026-03-24T08:00:00.000Z',
			},
			{
				updatedAt: '2026-03-24T09:00:00.000Z',
			},
			false
		)

		expect(shouldApply).toBe(true)
	})
})
