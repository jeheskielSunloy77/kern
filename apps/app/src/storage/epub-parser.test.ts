import JSZip from 'jszip'

import { parseEpubBuffer } from './epub-parser'

describe('parseEpubBuffer', () => {
	it('extracts metadata, toc, and searchable text from a minimal epub archive', async () => {
		const zip = new JSZip()

		zip.file(
			'META-INF/container.xml',
			`<?xml version="1.0"?>
			<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
				<rootfiles>
					<rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
				</rootfiles>
			</container>`
		)

		zip.file(
			'OPS/package.opf',
			`<?xml version="1.0" encoding="utf-8"?>
			<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
				<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
					<dc:title>Test Book</dc:title>
					<dc:creator>Jay Reader</dc:creator>
					<dc:language>en</dc:language>
					<dc:identifier id="book-id">urn:test:book</dc:identifier>
				</metadata>
				<manifest>
					<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
					<item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
				</manifest>
				<spine>
					<itemref idref="chapter-1"/>
				</spine>
			</package>`
		)

		zip.file(
			'OPS/nav.xhtml',
			`<html xmlns="http://www.w3.org/1999/xhtml">
				<body>
					<nav epub:type="toc">
						<ol>
							<li><a href="chapter-1.xhtml">Chapter One</a></li>
						</ol>
					</nav>
				</body>
			</html>`
		)

		zip.file(
			'OPS/chapter-1.xhtml',
			`<html xmlns="http://www.w3.org/1999/xhtml">
				<body>
					<h1>Chapter One</h1>
					<p>The import pipeline should index this sentence.</p>
				</body>
			</html>`
		)

		const archive = await zip.generateAsync({ type: 'uint8array' })
		const arrayBuffer = archive.slice().buffer as ArrayBuffer

		const parsed = await parseEpubBuffer(arrayBuffer)

		expect(parsed.metadata.title).toBe('Test Book')
		expect(parsed.metadata.authors).toBe('Jay Reader')
		expect(parsed.metadata.language).toBe('en')
		expect(parsed.metadata.identifiers['book-id']).toBe('urn:test:book')
		expect(parsed.toc).toEqual([
			{
				id: 'chapter-1.xhtml',
				href: 'chapter-1.xhtml',
				label: 'Chapter One',
				subitems: [],
			},
		])
		expect(parsed.sectionsForIndex[0]?.content).toContain(
			'import pipeline should index this sentence'
		)
	})
})
