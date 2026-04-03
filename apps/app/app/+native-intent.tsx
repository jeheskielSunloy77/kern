import { buildImportRoute, normalizeIncomingFileUri } from '../src/platform/native-intent'

export function redirectSystemPath({
	path,
}: {
	path: string
	initial: boolean
}) {
	const uri = normalizeIncomingFileUri(path)
	if (uri) {
		return buildImportRoute(uri)
	}

	return path
}
