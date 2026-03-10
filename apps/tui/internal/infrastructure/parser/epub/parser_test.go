package epub

import (
	"github.com/jeheskielSunloy77/kern/tui/internal/domain"
	"reflect"
	"testing"
)

func TestExtractSectionFindsExplicitHeadingLines(t *testing.T) {
	content := []byte(`<html><body><h1>Chapter One</h1><p>First paragraph.</p><h2>Scene Two</h2><p>Second paragraph.</p></body></html>`)

	got := extractSection(content)
	wantText := "Chapter One\n\nFirst paragraph.\n\nScene Two\n\nSecond paragraph."
	if got.Text != wantText {
		t.Fatalf("expected text %q, got %q", wantText, got.Text)
	}

	wantIndexes := []int{0}
	if !reflect.DeepEqual(got.ChapterLineIndexes, wantIndexes) {
		t.Fatalf("expected heading indexes %v, got %v", wantIndexes, got.ChapterLineIndexes)
	}
}

func TestExtractSectionUsesFallbackHeadingsWhenNoExplicitTags(t *testing.T) {
	content := []byte(`<html><body><p>CHAPTER 3</p><p>Opening line here.</p><p>Normal sentence follows.</p></body></html>`)

	got := extractSection(content)
	wantIndexes := []int{0}
	if !reflect.DeepEqual(got.ChapterLineIndexes, wantIndexes) {
		t.Fatalf("expected fallback heading indexes %v, got %v", wantIndexes, got.ChapterLineIndexes)
	}
}

func TestExtractSectionDoesNotOverTagParagraphs(t *testing.T) {
	content := []byte(`<html><body><p>This is a normal paragraph line.</p><p>another regular line with words</p></body></html>`)

	got := extractSection(content)
	if len(got.ChapterLineIndexes) != 0 {
		t.Fatalf("expected no heading indexes, got %v", got.ChapterLineIndexes)
	}
}

func TestExtractSectionCapturesInlineStyles(t *testing.T) {
	content := []byte(`<html><body><p>plain <strong>bold</strong> <em>italic</em> <u>underline</u> <code>code</code> <mark>mark</mark></p></body></html>`)

	got := extractSection(content)
	if got.Text == "" {
		t.Fatalf("expected extracted text")
	}

	expected := []domain.InlineStyleSpan{
		{LineIndex: 0, StartWord: 1, EndWord: 2, Style: domain.InlineStyleBold},
		{LineIndex: 0, StartWord: 2, EndWord: 3, Style: domain.InlineStyleItalic},
		{LineIndex: 0, StartWord: 3, EndWord: 4, Style: domain.InlineStyleUnderline},
		{LineIndex: 0, StartWord: 4, EndWord: 5, Style: domain.InlineStyleCode},
		{LineIndex: 0, StartWord: 5, EndWord: 6, Style: domain.InlineStyleMark},
	}
	if !reflect.DeepEqual(got.InlineStyles, expected) {
		t.Fatalf("expected inline styles %v, got %v", expected, got.InlineStyles)
	}
}

func TestIsChapterHeading_MultilingualPatterns(t *testing.T) {
	cases := []string{
		"Chapter 12",
		"Capítulo 7",
		"Chapitre IV",
		"Kapitel 3",
		"Hoofdstuk 9",
		"Rozdział 2",
		"Глава 5",
		"Розділ 1",
		"Bölüm 6",
		"Bab 4",
		"第十二章",
		"第 3 部",
		"제 2 장",
		"الفصل 8",
		"פרק 10",
		"Prologue",
		"Epilogue",
	}

	for _, input := range cases {
		if !isChapterHeading("h2", input) {
			t.Fatalf("expected chapter heading match for %q", input)
		}
	}
}

func TestIsChapterHeading_DoesNotMatchRegularHeading(t *testing.T) {
	cases := []string{
		"Introduction",
		"About the Author",
		"Important Notes",
		"References and Sources",
	}

	for _, input := range cases {
		if isChapterHeading("h2", input) {
			t.Fatalf("did not expect chapter heading match for %q", input)
		}
	}
}
