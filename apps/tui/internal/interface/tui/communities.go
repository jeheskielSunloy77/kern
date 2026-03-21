package tui

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/jeheskielSunloy77/kern/tui/internal/infrastructure/remote"
)

func (m *model) handleCommunitiesKey(msg tea.KeyMsg) tea.Cmd {
	switch msg.String() {
	case "q":
		return tea.Quit
	case "up", "k":
		if m.communitySelected > 0 {
			m.communitySelected--
			m.syncCommunityDetailToSelection()
		}
	case "down", "j":
		if m.communitySelected < len(m.communityBooks)-1 {
			m.communitySelected++
			m.syncCommunityDetailToSelection()
		}
	case "/":
		m.promptFor(promptCommunitySearch, "Community Search", "Search title, author, or username", "query", m.communityQuery)
	case "enter":
		book, ok := m.selectedCommunityBook()
		if !ok {
			return nil
		}
		return m.loadCommunityDetailCmd(book.ID)
	case "s":
		if !m.shouldRunSync() {
			m.setStatusDefault("Connect first to save community books")
			return nil
		}
		if m.communitySaving {
			m.setStatusDefault("Save already in progress")
			return nil
		}
		book, ok := m.selectedCommunityBook()
		if !ok {
			return nil
		}
		return m.saveCommunityBookCmd(book.ID)
	case "r":
		if !m.shouldRunSync() {
			m.setStatusDefault("Connect first to browse communities")
			return nil
		}
		return m.loadCommunityBooksCmd(true)
	case "?":
		m.setStatusDefault("Communities: Tab/Shift+Tab switch views  / search  Enter details  s save  r reload")
	}

	return nil
}

func (m *model) selectedCommunityBook() (remote.CommunityBook, bool) {
	if len(m.communityBooks) == 0 {
		return remote.CommunityBook{}, false
	}
	if m.communitySelected < 0 || m.communitySelected >= len(m.communityBooks) {
		return remote.CommunityBook{}, false
	}
	return m.communityBooks[m.communitySelected], true
}

func (m *model) syncCommunityDetailToSelection() {
	book, ok := m.selectedCommunityBook()
	if !ok {
		m.communityDetail = nil
		return
	}
	selected := book
	m.communityDetail = &selected
}
