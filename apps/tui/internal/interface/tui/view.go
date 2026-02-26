package tui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/zeile/tui/internal/reader"
)

type footerHint struct {
	key    string
	action string
}

func (m model) renderLibrary() string {
	header := lipgloss.NewStyle().Bold(true).Render("Zeile - Library")
	subheader := fmt.Sprintf("Books: %d", len(m.libraryBooks))
	if query := strings.TrimSpace(m.libraryQuery); query != "" {
		subheader += fmt.Sprintf(" | Search: %s", query)
	}

	headerLines := []string{header, subheader, ""}
	emptyMessage := "No books yet. Press 'a' to import EPUB/PDF."

	rows := make([]string, 0, len(m.libraryBooks)+2)
	body := ""
	if len(m.libraryBooks) == 0 {
		if m.width > 0 && m.height > 0 {
			bodyWidth := m.bodyContentWidth()
			if bodyWidth < 1 {
				bodyWidth = 1
			}
			centered := lipgloss.PlaceHorizontal(bodyWidth, lipgloss.Center, emptyMessage)

			contentHeight := m.mainLayoutHeight() - len(headerLines) - 2
			if contentHeight < 1 {
				contentHeight = 1
			}
			lines := make([]string, contentHeight)
			lines[(contentHeight-1)/2] = centered
			body = strings.Join(lines, "\n")
		} else {
			body = emptyMessage
		}
	} else {
		for idx, book := range m.libraryBooks {
			marker := " "
			if idx == m.librarySelected {
				marker = m.renderSelectorMarker()
			}
			progress := m.libraryProgress[book.ID]
			status := fmt.Sprintf("%.1f%%", progress)
			if m.libraryFinished[book.ID] {
				status = "Finished"
			}

			row := fmt.Sprintf(
				"%s %s - %s | %s | Last opened: %s",
				marker,
				book.Title,
				book.Author,
				status,
				formatTime(book.LastOpened),
			)
			if idx == m.librarySelected {
				row = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205")).Render(row)
			}
			rows = append(rows, row)
		}
		body = strings.Join(rows, "\n")
	}

	hints := m.renderFooterHints([]footerHint{
		{key: "/", action: "search"},
		{key: "a", action: "add"},
		{key: "Enter", action: "open"},
		{key: "r", action: "remove"},
		{key: "q", action: "quit"},
	})
	status := m.renderStatusToast("Ready")

	return m.renderPinnedLayout(
		headerLines,
		body,
		[]string{"", m.renderFooterRow(hints, status)},
	)
}

func (m model) renderAdd() string {
	header := lipgloss.NewStyle().Bold(true).Render("Zeile - Add Book")

	stepLabel := "Step 1/3 - Choose source"
	hints := m.renderFooterHints([]footerHint{
		{key: "arrows", action: "select"},
		{key: "Enter", action: "continue"},
		{key: "q", action: "back"},
	})
	bodyLines := []string{}

	switch m.addStep {
	case addStepChooseSource:
		pathLine := "  Use file path"
		selectorLine := "  Use file selector"
		if m.addSourceMethod == addSourcePath {
			pathLine = m.renderSelectorMarker() + " Use file path"
		} else {
			selectorLine = m.renderSelectorMarker() + " Use file selector"
		}
		bodyLines = append(bodyLines,
			"How do you want to add this book?",
			"",
			pathLine,
			selectorLine,
		)
	case addStepPathInput:
		stepLabel = "Step 2/3 - Enter file path"
		hints = m.renderFooterHints([]footerHint{
			{key: "type", action: "path"},
			{key: "Enter", action: "continue"},
			{key: "b", action: "back"},
			{key: "q", action: "cancel"},
		})
		value := m.addPath
		if value == "" {
			value = "(type a .epub or .pdf path)"
		}
		bodyLines = append(bodyLines,
			"Paste or type a full path to your file.",
			"",
			"> "+value,
		)
	case addStepFileSelector:
		stepLabel = "Step 2/3 - Choose file"
		hints = m.renderFooterHints([]footerHint{
			{key: "arrows", action: "move"},
			{key: "Enter", action: "open/select"},
			{key: "u", action: "parent"},
			{key: "b", action: "back"},
			{key: "q", action: "cancel"},
		})
		bodyLines = append(bodyLines, "Select an EPUB or PDF file.", "", "Directory: "+m.browserDir, "")
		if len(m.browserEntries) == 0 {
			bodyLines = append(bodyLines, "(empty)")
		} else {
			maxItems := 14
			start := 0
			if m.browserSelected >= maxItems {
				start = m.browserSelected - maxItems + 1
			}
			end := start + maxItems
			if end > len(m.browserEntries) {
				end = len(m.browserEntries)
			}
			for idx := start; idx < end; idx++ {
				entry := m.browserEntries[idx]
				marker := " "
				if idx == m.browserSelected {
					marker = m.renderSelectorMarker()
				}
				suffix := ""
				if entry.isDir {
					suffix = "/"
				}
				line := fmt.Sprintf("%s %s%s", marker, entry.name, suffix)
				if idx == m.browserSelected {
					line = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("220")).Render(line)
				}
				bodyLines = append(bodyLines, line)
			}
		}
	case addStepManagedCopy:
		stepLabel = "Step 3/3 - Managed copy"
		hints = m.renderFooterHints([]footerHint{
			{key: "y/n", action: "toggle"},
			{key: "m", action: "toggle"},
			{key: "Enter", action: "import"},
			{key: "b", action: "back"},
			{key: "q", action: "cancel"},
		})
		yesLine := "  Yes - copy into managed library"
		noLine := "  No - keep current source path"
		if m.addManagedCopy {
			yesLine = m.renderSelectorMarker() + " Yes - copy into managed library"
		} else {
			noLine = m.renderSelectorMarker() + " No - keep current source path"
		}
		bodyLines = append(bodyLines,
			"Do you want a managed copy?",
			"",
			"Selected file:",
			m.addPath,
			"",
			yesLine,
			noLine,
		)
	case addStepImporting:
		stepLabel = "Importing..."
		hints = m.renderFooterHints([]footerHint{
			{key: "Esc", action: "cancel import"},
		})
		barWidth := 40
		filled := int(m.importPercent * float64(barWidth))
		if filled < 0 {
			filled = 0
		}
		if filled > barWidth {
			filled = barWidth
		}
		bar := strings.Repeat("#", filled) + strings.Repeat("-", barWidth-filled)
		bodyLines = append(bodyLines,
			"Adding your book to the library.",
			"",
			fmt.Sprintf("[%s] %.0f%%", bar, m.importPercent*100),
			"Stage: "+m.importStage,
		)
	}

	contentLines := []string{
		header,
		stepLabel,
		"",
		strings.Join(bodyLines, "\n"),
		"",
		hints,
	}
	if status := m.renderStatusToast("Ready"); status != "" {
		contentLines = append(contentLines, status)
	}

	content := strings.Join(contentLines, "\n")

	style := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(1, 2)
	return m.renderCenteredContent(style.Render(content))
}

func (m model) renderReader() string {
	if m.readerBook.ID == "" {
		return "Reader has no active book"
	}

	spread := m.isSpreadMode()
	pageWidth, pageHeight := m.readerPageSize()
	pageCount := m.readerPageCount()
	if pageCount == 0 {
		return "No pages to display"
	}

	leftIndex := clamp(m.readerPage, 0, pageCount-1)
	rightIndex := leftIndex + 1

	leftContent, leftLineStarts, leftLineRanges := m.readerPageContent(leftIndex, pageWidth, pageHeight)
	leftPage := m.renderPageBox(leftContent, leftLineStarts, leftLineRanges, leftIndex+1, pageCount, pageWidth, pageHeight)

	var pagesView string
	if spread {
		rightContent := ""
		var rightLineStarts []int
		var rightLineRanges []reader.TokenRange
		rightPageNum := 0
		if rightIndex < pageCount {
			rightContent, rightLineStarts, rightLineRanges = m.readerPageContent(rightIndex, pageWidth, pageHeight)
			rightPageNum = rightIndex + 1
		}
		rightPage := m.renderPageBox(rightContent, rightLineStarts, rightLineRanges, rightPageNum, pageCount, pageWidth, pageHeight)
		divider := m.renderSpreadDivider(pageHeight)
		pagesView = lipgloss.JoinHorizontal(lipgloss.Top, leftPage, "   ", divider, "   ", rightPage)
	} else {
		pagesView = leftPage
	}

	if m.readerZen {
		body := pagesView
		if m.readerHelp {
			body += "\n" + m.renderReaderHelp()
		}
		return m.renderPinnedLayout(nil, body, nil)
	}

	header := lipgloss.NewStyle().Bold(true).Render(fmt.Sprintf(
		"%s - %s | Mode: %s | %s",
		m.readerBook.Title,
		m.readerBook.Author,
		m.readerMode,
		finishedLabel(m.readerFinished),
	))

	footerHints := m.renderFooterHints([]footerHint{
		{key: "arrows/hjkl", action: "page"},
		{key: "z", action: "zen"},
		{key: "/", action: "search"},
		{key: "n/N", action: "next/prev"},
		{key: "g/G", action: "go-to"},
		{key: "m", action: "pdf mode"},
		{key: "f", action: "finished"},
		{key: "q", action: "back"},
	})
	status := m.renderStatusToast("Reading")

	body := pagesView
	if m.readerHelp {
		body += "\n\n" + m.renderReaderHelp()
	}

	return m.renderPinnedLayout(
		[]string{header, ""},
		body,
		[]string{"", m.renderFooterRow(footerHints, status)},
	)
}

func (m model) readerPageContent(pageIndex, pageWidth, pageHeight int) (string, []int, []reader.TokenRange) {
	if pageIndex < 0 {
		return "", nil, nil
	}

	if m.isReaderTextMode() {
		if pageIndex >= len(m.readerPagination.Pages) {
			return "", nil, nil
		}
		var lineStarts []int
		var lineRanges []reader.TokenRange
		if pageIndex < len(m.readerPagination.PageLineStarts) {
			lineStarts = m.readerPagination.PageLineStarts[pageIndex]
		}
		if pageIndex < len(m.readerPagination.PageLineRanges) {
			lineRanges = m.readerPagination.PageLineRanges[pageIndex]
		}
		return m.readerPagination.Pages[pageIndex], lineStarts, lineRanges
	}

	if pageIndex >= len(m.readerLayoutPages) {
		return "", nil, nil
	}
	return reader.RenderLayoutPage(m.readerLayoutPages[pageIndex], pageWidth, pageHeight), nil, nil
}

func (m model) renderPageBox(content string, lineStarts []int, lineRanges []reader.TokenRange, pageNumber, totalPages, pageWidth, pageHeight int) string {
	lines := strings.Split(content, "\n")
	if len(lines) > pageHeight-1 {
		lines = lines[:pageHeight-1]
		if len(lineStarts) > len(lines) {
			lineStarts = lineStarts[:len(lines)]
		}
		if len(lineRanges) > len(lines) {
			lineRanges = lineRanges[:len(lines)]
		}
	}
	if len(lineStarts) < len(lines) {
		padded := make([]int, len(lines))
		copy(padded, lineStarts)
		for i := len(lineStarts); i < len(lines); i++ {
			padded[i] = -1
		}
		lineStarts = padded
	}
	if len(lineRanges) < len(lines) {
		padded := make([]reader.TokenRange, len(lines))
		copy(padded, lineRanges)
		for i := len(lineRanges); i < len(lines); i++ {
			padded[i] = reader.TokenRange{}
		}
		lineRanges = padded
	}
	for len(lines) < pageHeight-1 {
		lines = append(lines, "")
		lineStarts = append(lineStarts, -1)
		lineRanges = append(lineRanges, reader.TokenRange{})
	}

	if m.isReaderTextMode() && len(m.readerChapterStarts) > 0 {
		for i, start := range lineStarts {
			extraStyle := reader.TextStyle(0)
			if _, ok := m.readerChapterStarts[start]; ok {
				extraStyle |= reader.TextStyleBold
			}
			lines[i] = m.renderStyledLine(lines[i], lineRanges[i], extraStyle)
		}
	} else if m.isReaderTextMode() {
		for i := range lines {
			lines[i] = m.renderStyledLine(lines[i], lineRanges[i], 0)
		}
	}

	footer := ""
	if pageNumber > 0 {
		footer = fmt.Sprintf("Page %d/%d", pageNumber, totalPages)
	}
	lines = append(lines, footer)
	pageText := strings.Join(lines, "\n")

	return lipgloss.NewStyle().
		Width(pageWidth).
		Height(pageHeight).
		Render(pageText)
}

func (m model) renderStyledLine(plainLine string, tokenRange reader.TokenRange, extraStyle reader.TextStyle) string {
	if plainLine == "" {
		return plainLine
	}
	if tokenRange.End <= tokenRange.Start {
		return plainLine
	}
	if tokenRange.Start < 0 || tokenRange.End > len(m.readerTextDocument.Tokens) {
		return plainLine
	}

	words := make([]reader.Token, 0, tokenRange.End-tokenRange.Start)
	for _, token := range m.readerTextDocument.Tokens[tokenRange.Start:tokenRange.End] {
		if token.Type == reader.TokenWord {
			words = append(words, token)
		}
	}
	if len(words) == 0 {
		return plainLine
	}

	var builder strings.Builder
	segmentWords := make([]string, 0, len(words))
	segmentStyle := words[0].Style | extraStyle
	writeSegment := func() {
		if len(segmentWords) == 0 {
			return
		}
		segmentText := strings.Join(segmentWords, " ")
		if segmentStyle != 0 {
			style := lipglossForTextStyle(segmentStyle)
			segmentText = style.Render(segmentText)
		}
		if builder.Len() > 0 {
			builder.WriteByte(' ')
		}
		builder.WriteString(segmentText)
		segmentWords = segmentWords[:0]
	}

	for i, token := range words {
		style := token.Style | extraStyle
		if i == 0 {
			segmentStyle = style
		}
		if style != segmentStyle {
			writeSegment()
			segmentStyle = style
		}
		segmentWords = append(segmentWords, token.Value)
	}
	writeSegment()
	return builder.String()
}

func lipglossForTextStyle(style reader.TextStyle) lipgloss.Style {
	s := lipgloss.NewStyle()
	if style&reader.TextStyleBold != 0 {
		s = s.Bold(true)
	}
	if style&reader.TextStyleItalic != 0 {
		s = s.Italic(true)
	}
	if style&reader.TextStyleUnderline != 0 {
		s = s.Underline(true)
	}
	if style&reader.TextStyleMark != 0 {
		s = s.Reverse(true)
	}
	if style&reader.TextStyleSmall != 0 {
		s = s.Faint(true)
	}
	if style&reader.TextStyleSub != 0 {
		s = s.Faint(true)
	}
	if style&reader.TextStyleSup != 0 {
		s = s.Faint(true)
	}
	if style&reader.TextStyleCode != 0 {
		s = s.Foreground(lipgloss.Color("252")).Background(lipgloss.Color("236"))
	}
	return s
}

func (m model) renderSpreadDivider(height int) string {
	if height < 1 {
		height = 1
	}
	lines := make([]string, height)
	for i := range lines {
		lines[i] = "│"
	}
	return lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Render(strings.Join(lines, "\n"))
}

func (m model) renderReaderHelp() string {
	content := strings.Join([]string{
		"Help",
		"- / search inside book",
		"- n / N next or previous match",
		"- g go to page, G go to percent",
		"- z zen mode toggle",
		"- m toggle PDF text/layout mode",
		"- f mark finished",
		"- q back to library",
	}, "\n")

	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(0, 1).Render(content)
}

func (m model) renderPrompt() string {
	if m.prompt == nil {
		return ""
	}

	value := m.prompt.value
	if value == "" {
		value = m.prompt.placeholder
	}

	content := m.prompt.title
	if m.prompt.description != "" {
		content += "\n" + m.prompt.description
	}
	content += "\n> " + value
	content += "\n" + m.renderFooterHints([]footerHint{
		{key: "Enter", action: "confirm"},
		{key: "Esc", action: "cancel"},
	})

	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(0, 1).Render(content)
}

func (m model) renderPromptModal() string {
	content := m.renderPrompt()
	if content == "" {
		return ""
	}
	if m.width <= 0 || m.height <= 0 {
		return content
	}
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

func (m model) renderRemoveModal() string {
	if m.remove == nil {
		return ""
	}

	header := lipgloss.NewStyle().Bold(true).Render("Remove Book")

	var body string
	var hints string
	if m.remove.step == removeStepChooseAction {
		removeLine := m.renderSelectorMarker() + " Remove from library only"
		deleteLine := "  Delete file from disk"
		if m.remove.action == removeActionDeleteDisk {
			removeLine = "  Remove from library only"
			deleteLine = m.renderSelectorMarker() + " Delete file from disk"
		}
		body = strings.Join([]string{
			fmt.Sprintf("Book: %s", m.remove.bookTitle),
			"",
			"Choose action:",
			removeLine,
			deleteLine,
		}, "\n")
		hints = m.renderFooterHints([]footerHint{
			{key: "arrows", action: "select"},
			{key: "Enter", action: "continue"},
			{key: "Esc", action: "cancel"},
		})
	} else {
		token := "REMOVE"
		details := "This removes the book from the library only."
		if m.remove.action == removeActionDeleteDisk {
			token = "DELETE"
			details = fmt.Sprintf("This permanently deletes the managed file:\n%s", m.remove.managedPath)
		}
		value := m.remove.value
		if value == "" {
			value = token
		}
		body = strings.Join([]string{
			fmt.Sprintf("Book: %s", m.remove.bookTitle),
			"",
			details,
			"",
			"Type " + token + " to confirm:",
			"> " + value,
		}, "\n")
		hints = m.renderFooterHints([]footerHint{
			{key: "Enter", action: "confirm"},
			{key: "Esc", action: "back"},
			{key: "q", action: "cancel"},
		})
	}

	contentLines := []string{
		header,
		"",
		body,
		"",
		hints,
	}
	if status := m.renderStatusToast("Ready"); status != "" {
		contentLines = append(contentLines, status)
	}

	content := strings.Join(contentLines, "\n")

	style := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(1, 2)
	return m.renderCenteredContent(style.Render(content))
}

func finishedLabel(done bool) string {
	if done {
		return "Finished"
	}
	return "Unfinished"
}

func (m model) renderPinnedLayout(headerLines []string, body string, footerLines []string) string {
	if m.width <= 0 || m.height <= 0 {
		parts := make([]string, 0, len(headerLines)+len(footerLines)+1)
		parts = append(parts, headerLines...)
		parts = append(parts, body)
		parts = append(parts, footerLines...)
		return strings.Join(parts, "\n")
	}

	layoutWidth := m.mainLayoutWidth()
	layoutHeight := m.mainLayoutHeight()

	bodyLines := strings.Split(body, "\n")
	if len(bodyLines) == 0 {
		bodyLines = []string{""}
	}

	contentHeight := layoutHeight - len(headerLines) - len(footerLines)
	if contentHeight < 0 {
		contentHeight = 0
	}

	if len(bodyLines) > contentHeight {
		bodyLines = bodyLines[:contentHeight]
	}
	for len(bodyLines) < contentHeight {
		bodyLines = append(bodyLines, "")
	}
	bodyLines = m.applyBodyGutter(bodyLines)

	lines := make([]string, 0, len(headerLines)+len(bodyLines)+len(footerLines))
	lines = append(lines, headerLines...)
	lines = append(lines, bodyLines...)
	lines = append(lines, footerLines...)

	view := strings.Join(lines, "\n")
	view = lipgloss.Place(layoutWidth, layoutHeight, lipgloss.Left, lipgloss.Top, view)
	bottomPadding := 0
	if m.currentView == viewReader && m.readerZen {
		bottomPadding = 1
	}
	return lipgloss.NewStyle().
		Padding(1, 2, bottomPadding, 2).
		Render(view)
}

func (m model) applyBodyGutter(lines []string) []string {
	if m.mainLayoutWidth() <= 0 || len(lines) == 0 {
		return lines
	}

	gutter, innerWidth := m.bodyLayout()
	leftPad := strings.Repeat(" ", gutter)
	withGutter := make([]string, 0, len(lines))
	for _, line := range lines {
		if innerWidth == 0 {
			withGutter = append(withGutter, "")
			continue
		}
		if lipgloss.Width(line) > innerWidth {
			line = truncateRunes(line, innerWidth)
		}
		withGutter = append(withGutter, leftPad+line)
	}
	return withGutter
}

func (m model) bodyContentWidth() int {
	_, width := m.bodyLayout()
	return width
}

func (m model) bodyLayout() (leftGutter int, contentWidth int) {
	if m.mainLayoutWidth() <= 0 {
		return 0, 0
	}

	const maxContentWidth = 200
	layoutWidth := m.mainLayoutWidth()
	width := layoutWidth
	if width > maxContentWidth {
		width = maxContentWidth
	}

	if width == layoutWidth && layoutWidth >= 72 {
		width = layoutWidth - 4
	}
	if width < 24 {
		width = layoutWidth
	}

	gutter := (layoutWidth - width) / 2
	if gutter < 0 {
		gutter = 0
	}
	return gutter, width
}

func (m model) renderFooterRow(left, right string) string {
	layoutWidth := m.mainLayoutWidth()
	if layoutWidth <= 0 {
		if right == "" {
			return left
		}
		return left + " " + right
	}

	if right == "" {
		if lipgloss.Width(left) > layoutWidth {
			return truncateRunes(left, layoutWidth)
		}
		return left
	}

	leftWidth := lipgloss.Width(left)
	rightWidth := lipgloss.Width(right)

	if rightWidth >= layoutWidth {
		return truncateRunes(right, layoutWidth)
	}

	maxLeft := layoutWidth - rightWidth - 1
	if maxLeft < 0 {
		maxLeft = 0
	}
	if leftWidth > maxLeft {
		left = truncateRunes(left, maxLeft)
		leftWidth = lipgloss.Width(left)
	}

	padding := layoutWidth - leftWidth - rightWidth
	if padding < 1 {
		padding = 1
	}
	return left + strings.Repeat(" ", padding) + right
}

func (m model) mainLayoutWidth() int {
	if m.width <= 0 {
		return 0
	}
	width := m.width - 4
	if width < 1 {
		return 1
	}
	return width
}

func (m model) mainLayoutHeight() int {
	if m.height <= 0 {
		return 0
	}
	bottomPadding := 0
	if m.currentView == viewReader && m.readerZen {
		bottomPadding = 1
	}
	height := m.height - (1 + bottomPadding)
	if height < 1 {
		return 1
	}
	return height
}

func (m model) renderCenteredContent(content string) string {
	if m.width <= 0 || m.height <= 0 {
		return content
	}
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

func truncateRunes(value string, width int) string {
	if width <= 0 {
		return ""
	}

	runes := []rune(value)
	if len(runes) <= width {
		return value
	}
	if width <= 3 {
		return string(runes[:width])
	}
	return string(runes[:width-3]) + "..."
}

func (m model) renderSelectorMarker() string {
	return lipgloss.NewStyle().Foreground(lipgloss.Color("205")).Render("▌")
}

func (m model) renderFooterHints(hints []footerHint) string {
	parts := make([]string, 0, len(hints))
	for _, hint := range hints {
		if strings.TrimSpace(hint.key) == "" {
			continue
		}
		if strings.TrimSpace(hint.action) == "" {
			parts = append(parts, hint.key)
			continue
		}
		parts = append(parts, hint.key+" "+lipgloss.NewStyle().Foreground(lipgloss.Color("241")).Render(hint.action))
	}
	return strings.Join(parts, "  ")
}

func (m model) renderStatusToast(fallback string) string {
	text, variant, visible := m.effectiveStatus(time.Now(), fallback)
	if !visible {
		return ""
	}

	style := lipgloss.NewStyle().Padding(0, 1)
	switch variant {
	case statusSuccess:
		style = style.Background(lipgloss.Color("22")).Foreground(lipgloss.Color("255"))
	case statusDestructive:
		style = style.Background(lipgloss.Color("160")).Foreground(lipgloss.Color("255"))
	default:
		style = style.Background(lipgloss.Color("238")).Foreground(lipgloss.Color("252"))
	}
	return style.Render(text)
}
