import type { Page } from '../App'

const TABS: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'map',       label: 'Map'       },
  { id: 'config',    label: 'Config'    },
  { id: 'algorithm', label: 'Algorithm' },
]

interface Props {
  activePage: Page
  onNavigate: (p: Page) => void
}

export default function NavTabs({ activePage, onNavigate }: Props) {
  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onNavigate(tab.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activePage === tab.id
              ? 'bg-teal/15 text-teal'
              : 'text-muted hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
