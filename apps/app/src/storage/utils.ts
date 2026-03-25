import * as Crypto from 'expo-crypto'

export function nowIso() {
	return new Date().toISOString()
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
	if (!value) {
		return fallback
	}

	try {
		return JSON.parse(value) as T
	} catch {
		return fallback
	}
}

export function toSqliteBool(value: boolean) {
	return value ? 1 : 0
}

export function fromSqliteBool(value: number | null | undefined) {
	return value === 1
}

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

export function bytesToHex(bytes: Uint8Array<ArrayBuffer>) {
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

export async function sha256Hex(data: ArrayBuffer) {
	const digest = await Crypto.digest(
		Crypto.CryptoDigestAlgorithm.SHA256,
		data
	)
	return bytesToHex(new Uint8Array(digest))
}

export function coerceErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message
	}

	return 'Something went wrong.'
}

export function getLocatorCfi(locator: Record<string, unknown> | null | undefined) {
	if (!locator) {
		return undefined
	}

	const explicit = locator.cfi
	if (typeof explicit === 'string' && explicit.length > 0) {
		return explicit
	}

	const start = locator.start
	if (start && typeof start === 'object' && 'cfi' in start) {
		const cfi = start.cfi
		if (typeof cfi === 'string' && cfi.length > 0) {
			return cfi
		}
	}

	return undefined
}
