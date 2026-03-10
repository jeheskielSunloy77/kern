package epub

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	stdhtml "html"
	"io"
	"path"
	"regexp"
	"strings"

	xhtml "golang.org/x/net/html"

	"github.com/jeheskielSunloy77/kern/tui/internal/domain"
)

type containerDoc struct {
	Rootfiles struct {
		Items []struct {
			FullPath string `xml:"full-path,attr"`
		} `xml:"rootfile"`
	} `xml:"rootfiles"`
}

type packageDoc struct {
	Metadata struct {
		Titles   []string `xml:"title"`
		Creators []string `xml:"creator"`
	} `xml:"metadata"`
	Manifest struct {
		Items []struct {
			ID   string `xml:"id,attr"`
			Href string `xml:"href,attr"`
		} `xml:"item"`
	} `xml:"manifest"`
	Spine struct {
		Itemrefs []struct {
			IDRef string `xml:"idref,attr"`
		} `xml:"itemref"`
	} `xml:"spine"`
}

type extractedSection struct {
	Text               string
	ChapterLineIndexes []int
	InlineStyles       []domain.InlineStyleSpan
}

type headingEntry struct {
	Tag  string
	Text string
}

var chapterHeadingPatterns = []*regexp.Regexp{
	// Latin/Cyrillic/Arabic/Hebrew-style chapter prefixes with optional numbering.
	regexp.MustCompile(`(?i)^(chapter|part|book|volume|vol\.?|prologue|epilogue|chapitre|livre|partie|prologue|épilogue|cap[ií]tulo|capitulo|parte|pr[oó]logo|ep[ií]logo|capitolo|parte|prologo|epilogo|kapitel|teil|hoofdstuk|deel|rozdzia(?:ł|l)|cz[eę]ść|kapitola|d[ií]l|capitol(?:ul)?|parte|glava|глава|розділ|частина|bab|b[oö]l[uü]m|jilid|الفصل|פרק)(?:[\s\p{Zs}\-–—:：._,]+([0-9]+|[ivxlcdm]+|[a-z]|[一二三四五六七八九十百千零〇]+))?(?:[\s\p{Zs}\-–—:：._,].*)?$`),
	// CJK chapter forms: 第十二章, 第 3 部, etc.
	regexp.MustCompile(`^第[\s\p{Zs}]*([0-9]+|[一二三四五六七八九十百千零〇]+)[\s\p{Zs}]*(章|部|卷|节|節|話|话|回|篇)(?:[\s\p{Zs}\-–—:：._,].*)?$`),
	// Korean chapter forms: 제 3 장
	regexp.MustCompile(`^제[\s\p{Zs}]*([0-9]+|[一二三四五六七八九十百千零〇]+)[\s\p{Zs}]*(장|부|권)(?:[\s\p{Zs}\-–—:：._,].*)?$`),
}

var standaloneChapterLabelPattern = regexp.MustCompile(`(?i)^([0-9]+|[ivxlcdm]+|[一二三四五六七八九十百千零〇]+)$`)

func Extract(ctx context.Context, pathToEPUB string) (domain.EPUBCache, error) {
	if err := ctx.Err(); err != nil {
		return domain.EPUBCache{}, err
	}

	archive, err := zip.OpenReader(pathToEPUB)
	if err != nil {
		return domain.EPUBCache{}, fmt.Errorf("open epub: %w", err)
	}
	defer archive.Close()

	files := make(map[string]*zip.File, len(archive.File))
	for _, file := range archive.File {
		files[normalize(file.Name)] = file
	}

	containerBytes, err := readZipFile(files, "META-INF/container.xml")
	if err != nil {
		return domain.EPUBCache{}, fmt.Errorf("read container.xml: %w", err)
	}

	var container containerDoc
	if err := xml.Unmarshal(containerBytes, &container); err != nil {
		return domain.EPUBCache{}, fmt.Errorf("decode container.xml: %w", err)
	}

	if len(container.Rootfiles.Items) == 0 {
		return domain.EPUBCache{}, fmt.Errorf("epub has no rootfile entries")
	}

	opfPath := normalize(container.Rootfiles.Items[0].FullPath)
	opfBytes, err := readZipFile(files, opfPath)
	if err != nil {
		return domain.EPUBCache{}, fmt.Errorf("read package document: %w", err)
	}

	var pkg packageDoc
	if err := xml.Unmarshal(opfBytes, &pkg); err != nil {
		return domain.EPUBCache{}, fmt.Errorf("decode package document: %w", err)
	}

	manifest := map[string]string{}
	for _, item := range pkg.Manifest.Items {
		manifest[item.ID] = item.Href
	}

	opfDir := path.Dir(opfPath)
	sections := make([]string, 0, len(pkg.Spine.Itemrefs))
	sectionChapterLineIndexes := make([][]int, 0, len(pkg.Spine.Itemrefs))
	sectionInlineStyles := make([][]domain.InlineStyleSpan, 0, len(pkg.Spine.Itemrefs))
	for _, itemRef := range pkg.Spine.Itemrefs {
		if err := ctx.Err(); err != nil {
			return domain.EPUBCache{}, err
		}

		href, ok := manifest[itemRef.IDRef]
		if !ok {
			continue
		}

		chapterPath := normalize(path.Join(opfDir, href))
		chapterBytes, err := readZipFile(files, chapterPath)
		if err != nil {
			continue
		}

		extracted := extractSection(chapterBytes)
		if extracted.Text != "" {
			sections = append(sections, extracted.Text)
			sectionChapterLineIndexes = append(sectionChapterLineIndexes, extracted.ChapterLineIndexes)
			sectionInlineStyles = append(sectionInlineStyles, extracted.InlineStyles)
		}
	}

	if len(sections) == 0 {
		return domain.EPUBCache{}, fmt.Errorf("no readable text extracted from epub")
	}

	cache := domain.EPUBCache{
		Title:                     firstNonEmpty(pkg.Metadata.Titles...),
		Author:                    firstNonEmpty(pkg.Metadata.Creators...),
		Sections:                  sections,
		SectionChapterLineIndexes: sectionChapterLineIndexes,
		SectionInlineStyles:       sectionInlineStyles,
	}

	if cache.Title == "" {
		cache.Title = "Untitled EPUB"
	}
	if cache.Author == "" {
		cache.Author = "Unknown"
	}

	return cache, nil
}

func readZipFile(files map[string]*zip.File, name string) ([]byte, error) {
	file, ok := files[normalize(name)]
	if !ok {
		return nil, fmt.Errorf("%s not found", name)
	}

	reader, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	defer reader.Close()

	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", name, err)
	}
	return content, nil
}

func extractSection(content []byte) extractedSection {
	tokenizer := xhtml.NewTokenizer(bytes.NewReader(content))
	lines := make([][]styledWord, 0, 64)
	currentLine := make([]styledWord, 0, 16)
	explicitHeadings := make([]headingEntry, 0, 8)
	currentHeadingParts := make([]string, 0, 8)
	headingDepth := 0
	currentHeadingTag := ""
	styleStack := make([]domain.InlineStyle, 0, 8)

	flushLine := func(forceEmpty bool) {
		if len(currentLine) > 0 {
			lines = append(lines, currentLine)
			currentLine = make([]styledWord, 0, 16)
			return
		}
		if forceEmpty {
			lines = append(lines, nil)
		}
	}

	for {
		typeToken := tokenizer.Next()
		switch typeToken {
		case xhtml.ErrorToken:
			if tokenizer.Err() == io.EOF {
				flushLine(false)
				cleaned := normalizeStyledLines(lines)
				sectionText, inlineStyles := buildSectionTextAndStyles(cleaned)
				if sectionText == "" {
					return extractedSection{}
				}
				lines := strings.Split(sectionText, "\n")
				explicitIndexes := findHeadingLineIndexes(lines, explicitHeadings)
				if len(explicitIndexes) > 0 {
					return extractedSection{
						Text:               sectionText,
						ChapterLineIndexes: explicitIndexes,
						InlineStyles:       inlineStyles,
					}
				}
				return extractedSection{
					Text:               sectionText,
					ChapterLineIndexes: detectFallbackHeadingLineIndexes(lines),
					InlineStyles:       inlineStyles,
				}
			}
			return extractedSection{}
		case xhtml.StartTagToken, xhtml.EndTagToken:
			token := tokenizer.Token()
			if typeToken == xhtml.StartTagToken {
				styleStack = append(styleStack, styleFromTag(token.Data))
				if isBlockTag(token.Data) {
					flushLine(true)
				}
			} else {
				if len(styleStack) > 0 {
					styleStack = styleStack[:len(styleStack)-1]
				}
				if isBlockTag(token.Data) {
					flushLine(true)
				}
			}
			if typeToken == xhtml.StartTagToken && isHeadingTag(token.Data) {
				if headingDepth == 0 {
					currentHeadingParts = currentHeadingParts[:0]
					currentHeadingTag = strings.ToLower(token.Data)
				}
				headingDepth++
			}
			if typeToken == xhtml.EndTagToken && isHeadingTag(token.Data) {
				if headingDepth > 0 {
					headingDepth--
				}
				if headingDepth == 0 {
					heading := normalizeInlineWhitespace(strings.Join(currentHeadingParts, " "))
					if heading != "" && isChapterHeading(currentHeadingTag, heading) {
						explicitHeadings = append(explicitHeadings, headingEntry{
							Tag:  currentHeadingTag,
							Text: heading,
						})
					}
					currentHeadingParts = currentHeadingParts[:0]
					currentHeadingTag = ""
				}
			}
		case xhtml.TextToken:
			text := strings.TrimSpace(stdhtml.UnescapeString(string(tokenizer.Text())))
			if text != "" {
				text = strings.ReplaceAll(text, "\u00a0", " ")
				words := strings.Fields(text)
				activeStyle := mergeStyles(styleStack)
				for _, word := range words {
					currentLine = append(currentLine, styledWord{
						Text:  word,
						Style: activeStyle,
					})
				}
				if headingDepth > 0 {
					currentHeadingParts = append(currentHeadingParts, text)
				}
			}
		}
	}
}

func isHeadingTag(tag string) bool {
	switch strings.ToLower(tag) {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		return true
	default:
		return false
	}
}

type styledWord struct {
	Text  string
	Style domain.InlineStyle
}

func isBlockTag(tag string) bool {
	switch strings.ToLower(tag) {
	case "p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "li", "br", "tr":
		return true
	default:
		return false
	}
}

func styleFromTag(tag string) domain.InlineStyle {
	switch strings.ToLower(tag) {
	case "strong", "b":
		return domain.InlineStyleBold
	case "em", "i":
		return domain.InlineStyleItalic
	case "u":
		return domain.InlineStyleUnderline
	case "mark":
		return domain.InlineStyleMark
	case "small":
		return domain.InlineStyleSmall
	case "sub":
		return domain.InlineStyleSub
	case "sup":
		return domain.InlineStyleSup
	case "code", "tt", "kbd", "samp", "pre":
		return domain.InlineStyleCode
	default:
		return 0
	}
}

func mergeStyles(styles []domain.InlineStyle) domain.InlineStyle {
	var merged domain.InlineStyle
	for _, style := range styles {
		merged |= style
	}
	return merged
}

func normalizeStyledLines(lines [][]styledWord) [][]styledWord {
	cleaned := make([][]styledWord, 0, len(lines))
	for _, line := range lines {
		if len(line) == 0 {
			if len(cleaned) > 0 && len(cleaned[len(cleaned)-1]) > 0 {
				cleaned = append(cleaned, nil)
			}
			continue
		}
		cleaned = append(cleaned, line)
	}
	for len(cleaned) > 0 && len(cleaned[0]) == 0 {
		cleaned = cleaned[1:]
	}
	for len(cleaned) > 0 && len(cleaned[len(cleaned)-1]) == 0 {
		cleaned = cleaned[:len(cleaned)-1]
	}
	return cleaned
}

func buildSectionTextAndStyles(lines [][]styledWord) (string, []domain.InlineStyleSpan) {
	if len(lines) == 0 {
		return "", nil
	}

	textLines := make([]string, 0, len(lines))
	inlineStyles := make([]domain.InlineStyleSpan, 0, 32)
	for lineIndex, line := range lines {
		if len(line) == 0 {
			textLines = append(textLines, "")
			continue
		}

		words := make([]string, 0, len(line))
		for _, word := range line {
			words = append(words, word.Text)
		}
		textLines = append(textLines, strings.Join(words, " "))
		inlineStyles = append(inlineStyles, inlineStyleSpansForLine(lineIndex, line)...)
	}

	return strings.Join(textLines, "\n"), inlineStyles
}

func inlineStyleSpansForLine(lineIndex int, words []styledWord) []domain.InlineStyleSpan {
	if len(words) == 0 {
		return nil
	}

	spans := make([]domain.InlineStyleSpan, 0, 8)
	start := 0
	current := words[0].Style
	for i := 1; i < len(words); i++ {
		if words[i].Style == current {
			continue
		}
		if current != 0 {
			spans = append(spans, domain.InlineStyleSpan{
				LineIndex: lineIndex,
				StartWord: start,
				EndWord:   i,
				Style:     current,
			})
		}
		start = i
		current = words[i].Style
	}
	if current != 0 {
		spans = append(spans, domain.InlineStyleSpan{
			LineIndex: lineIndex,
			StartWord: start,
			EndWord:   len(words),
			Style:     current,
		})
	}
	return spans
}

func findHeadingLineIndexes(lines []string, headings []headingEntry) []int {
	if len(lines) == 0 || len(headings) == 0 {
		return nil
	}

	indexes := make([]int, 0, len(headings))
	searchFrom := 0
	for _, heading := range headings {
		normalizedHeading := normalizeInlineWhitespace(heading.Text)
		if normalizedHeading == "" {
			continue
		}
		found := -1
		for i := searchFrom; i < len(lines); i++ {
			line := normalizeInlineWhitespace(lines[i])
			if line == normalizedHeading || strings.EqualFold(line, normalizedHeading) {
				found = i
				break
			}
		}
		if found >= 0 {
			indexes = append(indexes, found)
			searchFrom = found + 1
		}
	}
	return indexes
}

func isChapterHeading(tag, text string) bool {
	text = normalizeChapterCandidate(text)
	if text == "" {
		return false
	}
	if matchesChapterHeadingPattern(text) {
		return true
	}
	if standaloneChapterLabelPattern.MatchString(text) {
		return true
	}
	if strings.EqualFold(tag, "h1") {
		words := strings.Fields(text)
		if len(words) <= 6 && len(words) > 0 {
			return true
		}
	}
	return false
}

func detectFallbackHeadingLineIndexes(lines []string) []int {
	if len(lines) == 0 {
		return nil
	}

	indexes := make([]int, 0, 4)
	for i, line := range lines {
		if isFallbackHeadingLine(line) {
			indexes = append(indexes, i)
		}
	}
	return indexes
}

func isFallbackHeadingLine(line string) bool {
	line = normalizeChapterCandidate(line)
	if line == "" {
		return false
	}
	if matchesChapterHeadingPattern(line) {
		return true
	}
	return standaloneChapterLabelPattern.MatchString(line)
}

func normalizeInlineWhitespace(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}

func normalizeChapterCandidate(value string) string {
	value = normalizeInlineWhitespace(value)
	value = strings.Trim(value, "\"'`“”‘’«»()[]{}<>")
	value = strings.TrimSpace(value)
	return value
}

func matchesChapterHeadingPattern(value string) bool {
	for _, pattern := range chapterHeadingPatterns {
		if pattern.MatchString(value) {
			return true
		}
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func normalize(value string) string {
	cleaned := path.Clean(strings.ReplaceAll(value, "\\", "/"))
	cleaned = strings.TrimPrefix(cleaned, "./")
	return cleaned
}
