import { Menu, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MainNav } from './MainNav'
import { useTimer } from '../context/TimerContext'
import { useT } from '../i18n'

type TopBarProps = {
  onMenuOpen: () => void
  onNavigate?: () => void
}

function mmss(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The one band at the top of the screen: menu on the left, the page tabs filling
 * the rest. A running session adds a strip underneath so you can see the timer
 * is still going from any page, and tap back to it.
 */
export function TopBar({ onMenuOpen, onNavigate }: TopBarProps) {
  const { t } = useT()
  const navigate = useNavigate()
  const { running, prayers, currentIndex, incrementTimeLeft } = useTimer()

  const currentPrayer = prayers.length > 0 ? (prayers[currentIndex] ?? prayers[0]) : null

  // Solid card-coloured band that runs to the very top of the screen, so it
  // fills the status bar / Dynamic Island area instead of leaving it bare.
  return (
    <div
      className="sticky top-0 z-40 shrink-0 border-b border-border bg-card shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-1 px-2">
        <button
          onClick={onMenuOpen}
          className="shrink-0 rounded-full p-2 text-text-tertiary transition-colors hover:bg-input"
          aria-label={t.openMenu}
        >
          <Menu size={20} />
        </button>
        <MainNav onNavigate={onNavigate} />
      </div>

      {running && currentPrayer && (
        <button
          onClick={() => navigate('/timer')}
          className="flex w-full items-center gap-2 border-t border-border bg-input/50 px-4 py-1.5 text-left transition-colors hover:bg-input"
        >
          <Clock size={13} className="shrink-0 text-accent-text" />
          <span className="shrink-0 text-[11px] text-text-muted">{t.praying}</span>
          <span className="truncate text-xs text-text-secondary">{currentPrayer.title}</span>
          <span className="ml-auto shrink-0 font-mono text-xs font-semibold text-text">
            {mmss(incrementTimeLeft)}
          </span>
        </button>
      )}
    </div>
  )
}
