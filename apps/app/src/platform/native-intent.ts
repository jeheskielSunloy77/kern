export function normalizeIncomingFileUri(path: string | null | undefined) {
	if (!path) {
		return null
	}

	const decoded = decodeURIComponent(path)

	if (
		decoded.startsWith('content://') ||
		decoded.startsWith('file://') ||
		decoded.endsWith('.epub')
	) {
		return decoded
	}

	try {
		const url = new URL(decoded)
		const candidate = url.searchParams.get('uri')
		if (candidate) {
			return candidate
		}
	} catch {
		return null
	}

	return null
}

export function buildImportRoute(uri: string, name?: string) {
	const query = new URLSearchParams({ uri })
	if (name) {
		query.set('name', name)
	}
	return `/import?${query.toString()}`
}
