package reader

import "strings"

func RenderLayoutPage(text string, width, height int) string {
	if width < 20 {
		width = 20
	}
	if height < 5 {
		height = 5
	}

	lines := wrapText(text, width)
	if len(lines) > height {
		if height >= 2 {
			lines = lines[:height-1]
			lines = append(lines, "...")
		} else {
			lines = lines[:height]
		}
	}

	return strings.Join(lines, "\n")
}

func wrapText(text string, width int) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	sourceLines := strings.Split(text, "\n")
	lines := make([]string, 0, len(sourceLines))

	for _, sourceLine := range sourceLines {
		words := strings.Fields(sourceLine)
		if len(words) == 0 {
			lines = append(lines, "")
			continue
		}

		current := words[0]
		for _, word := range words[1:] {
			candidate := current + " " + word
			if len([]rune(candidate)) <= width {
				current = candidate
				continue
			}
			lines = append(lines, current)
			current = word
		}
		lines = append(lines, current)
	}

	if len(lines) == 0 {
		return []string{""}
	}
	return lines
}
