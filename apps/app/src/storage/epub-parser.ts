import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

import type { ParsedEpub, TocItem } from './models'

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	removeNSPrefix: true,
	trimValues: true,
})

type ManifestItem = {
	id: string
	href: string
	mediaType?: string
	properties?: string
}

type NcxNavPoint = {
	content?: { '@_src'?: string }
	navLabel?: { text?: string }
	navPoint?: NcxNavPoint[] | NcxNavPoint
}

export async function parseEpubBuffer(
	arrayBuffer: ArrayBuffer
): Promise<ParsedEpub> {
	const zip = await JSZip.loadAsync(arrayBuffer)
	const containerXml = await readZipText(zip, 'META-INF/container.xml')
	const container = parser.parse(containerXml)
	const rootfile = toArray(
		container?.container?.rootfiles?.rootfile ?? container?.rootfiles?.rootfile
	)[0]

	const opfPath = String(rootfile?.['@_full-path'] ?? '').trim()
	if (!opfPath) {
		throw new Error('The EPUB container is missing its package document.')
	}

	const opfXml = await readZipText(zip, opfPath)
	const pkg = parser.parse(opfXml)?.package
	if (!pkg) {
		throw new Error('The EPUB package document could not be parsed.')
	}

	const metadata = pkg.metadata ?? {}
	const manifestItems = toArray(pkg.manifest?.item).map<ManifestItem>((item) => ({
		id: String(item?.['@_id'] ?? ''),
		href: String(item?.['@_href'] ?? ''),
		mediaType: item?.['@_media-type']
			? String(item['@_media-type'])
			: undefined,
		properties: item?.['@_properties']
			? String(item['@_properties'])
			: undefined,
	}))
	const manifestById = new Map(
		manifestItems.map((item) => [item.id, item] satisfies [string, ManifestItem])
	)
	const spineRefs = toArray(pkg.spine?.itemref).map((item) =>
		String(item?.['@_idref'] ?? '')
	)
	const basePath = dirname(opfPath)
	const toc = await parseToc(zip, pkg, manifestById, basePath)
	const cover = await parseCover(zip, metadata, manifestItems, basePath)

	const sectionsForIndex = await Promise.all(
		spineRefs
			.map((idref) => manifestById.get(idref))
			.filter((item): item is ManifestItem => Boolean(item))
			.filter((item) => item.mediaType === 'application/xhtml+xml')
			.map(async (item) => {
				const sectionPath = resolveHref(basePath, item.href)
				const sectionXml = await readZipText(zip, sectionPath)
				return {
					href: item.href,
					content: sanitizeSearchText(sectionXml),
				}
			})
	)

	const identifiers = toIdentifierMap(metadata.identifier)
	const title = firstText(metadata.title) || 'Untitled book'
	const authors = toArray(metadata.creator)
		.map((entry) => firstText(entry))
		.filter(Boolean)
		.join(', ')

	return {
		metadata: {
			title,
			authors,
			language: firstText(metadata.language) || undefined,
			description: firstText(metadata.description) || undefined,
			publisher: firstText(metadata.publisher) || undefined,
			identifiers,
		},
		opfPath,
		toc,
		cover,
		sectionsForIndex,
	}
}

function sanitizeSearchText(source: string) {
	return source
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

async function parseCover(
	zip: JSZip,
	metadata: Record<string, unknown>,
	manifestItems: ManifestItem[],
	basePath: string
) {
	const metadataMetas = toArray(metadata.meta)
	const coverMeta = metadataMetas.find((entry) => {
		const item = (entry ?? {}) as Record<string, unknown>
		return item['@_name'] === 'cover' && Boolean(item['@_content'])
	}) as Record<string, unknown> | undefined
	const coverItem =
		manifestItems.find((item) => item.properties?.includes('cover-image')) ??
		manifestItems.find((item) => item.id === coverMeta?.['@_content'])

	if (!coverItem || !coverItem.mediaType) {
		return undefined
	}

	const file = zip.file(resolveHref(basePath, coverItem.href))
	if (!file) {
		return undefined
	}

	return {
		base64: await file.async('base64'),
		mimeType: coverItem.mediaType,
	}
}

async function parseToc(
	zip: JSZip,
	pkg: Record<string, unknown>,
	manifestById: Map<string, ManifestItem>,
	basePath: string
) {
	const spineRecord = (pkg.spine ?? {}) as Record<string, unknown>
	const navItem =
		Array.from(manifestById.values()).find((item) =>
			item.properties?.includes('nav')
		) ?? null

	if (navItem) {
		const navPath = resolveHref(basePath, navItem.href)
		const navXml = await readZipText(zip, navPath)
		const parsed = parser.parse(navXml)
		const navs = toArray(parsed?.html?.body?.nav)
		const tocNav =
			navs.find((nav) => nav?.['@_epub:type'] === 'toc') ?? navs[0] ?? null
		if (tocNav?.ol?.li) {
			return parseNavItems(tocNav.ol.li)
		}
	}

	const tocId = String(spineRecord['@_toc'] ?? '')
	const ncxItem = manifestById.get(tocId)
	if (!ncxItem) {
		return []
	}

	const ncxXml = await readZipText(zip, resolveHref(basePath, ncxItem.href))
	const ncx = parser.parse(ncxXml)
	return parseNcxNavPoints(ncx?.ncx?.navMap?.navPoint)
}

function parseNavItems(items: unknown): TocItem[] {
	return toArray(items).map((item) => {
		const navItem = (item ?? {}) as Record<string, any>
		const anchor = (navItem.a ?? {}) as Record<string, unknown>
		const nested = navItem.ol?.li ?? []
		return {
			id: String(anchor?.['@_href'] ?? firstText(anchor) ?? cryptoId()),
			href: String(anchor?.['@_href'] ?? ''),
			label: firstText(anchor) || 'Section',
			subitems: parseNavItems(nested),
		}
	})
}

function parseNcxNavPoints(points: unknown): TocItem[] {
	return toArray(points).map((point) => {
		const navPoint = point as NcxNavPoint
		return {
			id: navPoint.content?.['@_src'] ?? cryptoId(),
			href: navPoint.content?.['@_src'] ?? '',
			label: navPoint.navLabel?.text ?? 'Section',
			subitems: parseNcxNavPoints(navPoint.navPoint),
		}
	})
}

function toIdentifierMap(source: unknown) {
	const entries = toArray(source)
	const identifiers: Record<string, string> = {}

	entries.forEach((entry, index) => {
		const record = (entry ?? {}) as Record<string, unknown>
		const key = String(record['@_id'] ?? record['@_opf:scheme'] ?? `id-${index}`)
		const value = firstText(record)
		if (value) {
			identifiers[key] = value
		}
	})

	return identifiers
}

function firstText(value: unknown): string {
	if (!value) {
		return ''
	}
	if (typeof value === 'string') {
		return value.trim()
	}
	if (typeof value === 'object') {
		if ('#text' in (value as Record<string, unknown>)) {
			const text = (value as Record<string, unknown>)['#text']
			return typeof text === 'string' ? text.trim() : ''
		}
		if ('text' in (value as Record<string, unknown>)) {
			const text = (value as Record<string, unknown>).text
			return typeof text === 'string' ? text.trim() : ''
		}
	}
	return ''
}

async function readZipText(zip: JSZip, path: string) {
	const file = zip.file(path)
	if (!file) {
		throw new Error(`Missing EPUB resource: ${path}`)
	}
	return file.async('string')
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
	if (!value) {
		return []
	}
	return Array.isArray(value) ? value : [value]
}

function dirname(path: string) {
	const parts = path.split('/')
	parts.pop()
	return parts.join('/')
}

function resolveHref(basePath: string, href: string) {
	const stack = [...(basePath ? basePath.split('/') : []), ...href.split('/')]
	const resolved: string[] = []

	stack.forEach((segment) => {
		if (!segment || segment === '.') {
			return
		}
		if (segment === '..') {
			resolved.pop()
			return
		}
		resolved.push(segment)
	})

	return resolved.join('/')
}

function cryptoId() {
	return Math.random().toString(36).slice(2, 10)
}
