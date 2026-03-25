type ComparableReadingState = {
	progressPercent: number
	updatedAt: string
}

type ComparableAnnotation = {
	updatedAt: string
}

export function chooseReadingStateWinner(
	localState: ComparableReadingState,
	remoteState: ComparableReadingState
) {
	if (localState.progressPercent !== remoteState.progressPercent) {
		return localState.progressPercent > remoteState.progressPercent
			? 'local'
			: 'remote'
	}

	return new Date(localState.updatedAt).getTime() >=
		new Date(remoteState.updatedAt).getTime()
		? 'local'
		: 'remote'
}

export function shouldApplyRemoteAnnotation(
	localAnnotation: ComparableAnnotation | null,
	remoteAnnotation: ComparableAnnotation,
	hasPendingLocalChange: boolean
) {
	if (!localAnnotation) {
		return true
	}

	if (hasPendingLocalChange) {
		return false
	}

	return (
		new Date(remoteAnnotation.updatedAt).getTime() >
		new Date(localAnnotation.updatedAt).getTime()
	)
}
