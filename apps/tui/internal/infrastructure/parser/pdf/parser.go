package pdf

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"rsc.io/pdf"

	"github.com/zeile/tui/internal/domain"
)

func Extract(pathToPDF string) (domain.PDFCache, error) {
	reader, err := pdf.Open(pathToPDF)
	if err != nil {
		return domain.PDFCache{}, fmt.Errorf("open pdf: %w", err)
	}

	pageCount := reader.NumPage()
	if pageCount == 0 {
		return domain.PDFCache{}, fmt.Errorf("pdf has no pages")
	}

	pages := make([]string, 0, pageCount)
	for pageNumber := 1; pageNumber <= pageCount; pageNumber++ {
		page := reader.Page(pageNumber)
		if page.V.IsNull() {
			pages = append(pages, "")
			continue
		}

		content := page.Content()
		textItems := content.Text
		sort.SliceStable(textItems, func(i, j int) bool {
			yDiff := math.Abs(textItems[i].Y - textItems[j].Y)
			if yDiff < 1.5 {
				return textItems[i].X < textItems[j].X
			}
			return textItems[i].Y > textItems[j].Y
		})

		lines := make([]string, 0, 64)
		currentLine := strings.Builder{}
		lastY := 0.0
		hasLastY := false
		for _, item := range textItems {
			chunk := strings.TrimSpace(item.S)
			if chunk == "" {
				continue
			}

			if hasLastY && math.Abs(item.Y-lastY) > 1.5 {
				line := strings.TrimSpace(currentLine.String())
				if line != "" {
					lines = append(lines, line)
				}
				currentLine.Reset()
			}

			if currentLine.Len() > 0 {
				currentLine.WriteByte(' ')
			}
			currentLine.WriteString(chunk)
			lastY = item.Y
			hasLastY = true
		}

		if line := strings.TrimSpace(currentLine.String()); line != "" {
			lines = append(lines, line)
		}

		pages = append(pages, strings.Join(lines, "\n"))
	}

	cache := domain.PDFCache{
		Title:  "Untitled PDF",
		Author: "Unknown",
		Pages:  pages,
	}
	return cache, nil
}
