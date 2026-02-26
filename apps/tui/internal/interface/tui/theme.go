package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/zeile/tui/internal/infrastructure/config"
)

type themeTokens struct {
	Primary            lipgloss.Color
	PrimaryAlt         lipgloss.Color
	Muted              lipgloss.Color
	Divider            lipgloss.Color
	CodeFG             lipgloss.Color
	CodeBG             lipgloss.Color
	ToastDefaultBG     lipgloss.Color
	ToastDefaultFG     lipgloss.Color
	ToastSuccessBG     lipgloss.Color
	ToastSuccessFG     lipgloss.Color
	ToastDestructiveBG lipgloss.Color
	ToastDestructiveFG lipgloss.Color
	HighlightBlockBG   lipgloss.Color
	HighlightBlockFG   lipgloss.Color
}

func (m model) activeTheme() themeTokens {
	cfg := m.currentConfig()

	theme := map[string]themeTokens{
		config.ThemePackDefault: {
			Primary:            lipgloss.Color("205"),
			PrimaryAlt:         lipgloss.Color("220"),
			Muted:              lipgloss.Color("241"),
			Divider:            lipgloss.Color("240"),
			CodeFG:             lipgloss.Color("252"),
			CodeBG:             lipgloss.Color("236"),
			ToastDefaultBG:     lipgloss.Color("238"),
			ToastDefaultFG:     lipgloss.Color("252"),
			ToastSuccessBG:     lipgloss.Color("22"),
			ToastSuccessFG:     lipgloss.Color("255"),
			ToastDestructiveBG: lipgloss.Color("160"),
			ToastDestructiveFG: lipgloss.Color("255"),
			HighlightBlockBG:   lipgloss.Color("205"),
			HighlightBlockFG:   lipgloss.Color("255"),
		},
		config.ThemePackDracula: {
			Primary:            lipgloss.Color("212"),
			PrimaryAlt:         lipgloss.Color("117"),
			Muted:              lipgloss.Color("246"),
			Divider:            lipgloss.Color("60"),
			CodeFG:             lipgloss.Color("255"),
			CodeBG:             lipgloss.Color("236"),
			ToastDefaultBG:     lipgloss.Color("60"),
			ToastDefaultFG:     lipgloss.Color("255"),
			ToastSuccessBG:     lipgloss.Color("29"),
			ToastSuccessFG:     lipgloss.Color("255"),
			ToastDestructiveBG: lipgloss.Color("161"),
			ToastDestructiveFG: lipgloss.Color("255"),
			HighlightBlockBG:   lipgloss.Color("212"),
			HighlightBlockFG:   lipgloss.Color("255"),
		},
		config.ThemePackGruvbox: {
			Primary:            lipgloss.Color("214"),
			PrimaryAlt:         lipgloss.Color("142"),
			Muted:              lipgloss.Color("245"),
			Divider:            lipgloss.Color("239"),
			CodeFG:             lipgloss.Color("223"),
			CodeBG:             lipgloss.Color("237"),
			ToastDefaultBG:     lipgloss.Color("239"),
			ToastDefaultFG:     lipgloss.Color("223"),
			ToastSuccessBG:     lipgloss.Color("64"),
			ToastSuccessFG:     lipgloss.Color("223"),
			ToastDestructiveBG: lipgloss.Color("124"),
			ToastDestructiveFG: lipgloss.Color("230"),
			HighlightBlockBG:   lipgloss.Color("214"),
			HighlightBlockFG:   lipgloss.Color("230"),
		},
		config.ThemePackNord: {
			Primary:            lipgloss.Color("110"),
			PrimaryAlt:         lipgloss.Color("81"),
			Muted:              lipgloss.Color("109"),
			Divider:            lipgloss.Color("59"),
			CodeFG:             lipgloss.Color("254"),
			CodeBG:             lipgloss.Color("237"),
			ToastDefaultBG:     lipgloss.Color("59"),
			ToastDefaultFG:     lipgloss.Color("254"),
			ToastSuccessBG:     lipgloss.Color("29"),
			ToastSuccessFG:     lipgloss.Color("255"),
			ToastDestructiveBG: lipgloss.Color("131"),
			ToastDestructiveFG: lipgloss.Color("255"),
			HighlightBlockBG:   lipgloss.Color("110"),
			HighlightBlockFG:   lipgloss.Color("255"),
		},
		config.ThemePackCatppuccin: {
			Primary:            lipgloss.Color("176"),
			PrimaryAlt:         lipgloss.Color("147"),
			Muted:              lipgloss.Color("146"),
			Divider:            lipgloss.Color("60"),
			CodeFG:             lipgloss.Color("255"),
			CodeBG:             lipgloss.Color("238"),
			ToastDefaultBG:     lipgloss.Color("60"),
			ToastDefaultFG:     lipgloss.Color("255"),
			ToastSuccessBG:     lipgloss.Color("35"),
			ToastSuccessFG:     lipgloss.Color("255"),
			ToastDestructiveBG: lipgloss.Color("167"),
			ToastDestructiveFG: lipgloss.Color("255"),
			HighlightBlockBG:   lipgloss.Color("176"),
			HighlightBlockFG:   lipgloss.Color("255"),
		},
	}[cfg.ThemePack]

	if theme.Primary == "" {
		theme = m.activeThemeDefault()
	}

	if cfg.PrimaryOverrideEnabled {
		override := strings.TrimSpace(cfg.PrimaryOverrideColor)
		if override != "" {
			theme.Primary = lipgloss.Color(override)
			theme.PrimaryAlt = lipgloss.Color(override)
			theme.HighlightBlockBG = lipgloss.Color(override)
		}
	}

	if cfg.HighContrast {
		theme.Muted = lipgloss.Color("252")
		theme.Divider = lipgloss.Color("250")
		theme.CodeFG = lipgloss.Color("255")
		theme.CodeBG = lipgloss.Color("235")
		theme.ToastDefaultBG = lipgloss.Color("0")
		theme.ToastDefaultFG = lipgloss.Color("255")
	}

	return theme
}

func (m model) activeThemeDefault() themeTokens {
	return themeTokens{
		Primary:            lipgloss.Color("205"),
		PrimaryAlt:         lipgloss.Color("220"),
		Muted:              lipgloss.Color("241"),
		Divider:            lipgloss.Color("240"),
		CodeFG:             lipgloss.Color("252"),
		CodeBG:             lipgloss.Color("236"),
		ToastDefaultBG:     lipgloss.Color("238"),
		ToastDefaultFG:     lipgloss.Color("252"),
		ToastSuccessBG:     lipgloss.Color("22"),
		ToastSuccessFG:     lipgloss.Color("255"),
		ToastDestructiveBG: lipgloss.Color("160"),
		ToastDestructiveFG: lipgloss.Color("255"),
		HighlightBlockBG:   lipgloss.Color("205"),
		HighlightBlockFG:   lipgloss.Color("255"),
	}
}

func titleCaseToken(value string) string {
	if strings.TrimSpace(value) == "" {
		return "Unknown"
	}
	parts := strings.Fields(strings.ReplaceAll(value, "_", " "))
	for i := range parts {
		runes := []rune(parts[i])
		if len(runes) == 0 {
			continue
		}
		runes[0] = []rune(strings.ToUpper(string(runes[0])))[0]
		parts[i] = string(runes)
	}
	return strings.Join(parts, " ")
}
