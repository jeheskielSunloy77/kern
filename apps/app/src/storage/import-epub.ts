import * as DocumentPicker from 'expo-document-picker'
import { Directory, File, Paths } from 'expo-file-system'
import type { SQLiteDatabase } from 'expo-sqlite'
import * as Crypto from 'expo-crypto'

import { createBook, getBookByChecksum, storeSearchIndex } from './library-repository'
import type { ParsedEpub } from './models'
import { parseEpubBuffer } from './epub-parser'
import { nowIso, sha256Hex } from './utils'

const APP_DIRECTORY = new Directory(Paths.document, 'kern')
const BOOKS_DIRECTORY = new Directory(APP_DIRECTORY, 'books')
const COVERS_DIRECTORY = new Directory(APP_DIRECTORY, 'covers')

export async function pickAndImportEpub(db: SQLiteDatabase) {
	const result = await DocumentPicker.getDocumentAsync({
		type: ['application/epub+zip', 'application/octet-stream', '*/*'],
		copyToCacheDirectory: true,
		multiple: false,
	})

	if (result.canceled || !result.assets[0]) {
		return null
	}

	const asset = result.assets[0]
	return importEpubFromUri(db, asset.uri, asset.name)
}

export async function importEpubFromUri(
	db: SQLiteDatabase,
	uri: string,
	fileName = 'imported-book.epub'
) {
	if (!uri) {
		throw new Error('No EPUB file was provided for import.')
	}

	ensureStorageDirectories()

	const source = new File(uri)
	const bytes = await source.bytes()
	const checksum = await sha256Hex(bytes.buffer)
	const existing = await getBookByChecksum(db, checksum)

	if (existing) {
		return {
			book: existing,
			deduped: true,
		}
	}

	const parsed = await parseEpubBuffer(bytes.buffer)
	const bookId = Crypto.randomUUID()
	const targetFile = new File(BOOKS_DIRECTORY, `${bookId}.epub`)
	targetFile.create({ overwrite: true, intermediates: true })
	targetFile.write(bytes)

	const coverUri = persistCoverAsset(bookId, parsed)
	const timestamp = nowIso()
	const book = await createBook(db, {
		id: bookId,
		checksum,
		fileUri: targetFile.uri,
		fileName,
		title: parsed.metadata.title,
		authors: parsed.metadata.authors,
		language: parsed.metadata.language,
		description: parsed.metadata.description,
		publisher: parsed.metadata.publisher,
		coverUri: coverUri ?? undefined,
		identifiers: {
			...parsed.metadata.identifiers,
			checksum,
			opfPath: parsed.opfPath,
		},
		toc: parsed.toc,
		importStatus: 'ready',
		createdAt: timestamp,
		updatedAt: timestamp,
	})

	await storeSearchIndex(db, bookId, parsed.sectionsForIndex)

	return {
		book,
		deduped: false,
	}
}

function ensureStorageDirectories() {
	APP_DIRECTORY.create({ idempotent: true, intermediates: true })
	BOOKS_DIRECTORY.create({ idempotent: true, intermediates: true })
	COVERS_DIRECTORY.create({ idempotent: true, intermediates: true })
}

function persistCoverAsset(bookId: string, parsed: ParsedEpub) {
	if (!parsed.cover) {
		return null
	}

	const extension = parsed.cover.mimeType.includes('png') ? 'png' : 'jpg'
	const file = new File(COVERS_DIRECTORY, `${bookId}.${extension}`)
	file.create({ overwrite: true, intermediates: true })
	file.write(parsed.cover.base64, { encoding: 'base64' })
	return file.uri
}
