import { NavLink } from 'react-router-dom'
import { ScrollText, Clock, Settings } from 'lucide-react'
import { useT } from '../i18n'

type MainNavProps = {
  onNavigate?: () => void
  onSettings: () => void
  /** Lights the cog up while the side menu is open, the way a tab lights up. */
  settingsOpen?: boolean
}

/** Shared by the cog and the real tabs so they read as one row. */
const tabClass = (active: boolean) =>
  `flex flex-1 flex-col items-center justify-start gap-0.5 pt-1.5 pb-1.5 text-[11px] font-medium transition-colors ${
    active ? 'text-text' : 'text-text-muted hover:text-text-secondary'
  }`

export function MainNav({ onNavigate, onSettings, settingsOpen }: MainNavProps) {
  const { t } = useT()

  const tabs = [
    { to: '/', icon: ScrollText, label: t.navPrayerLists },
    { to: '/timer', icon: Clock, label: t.navTimebox },
  ] as const

  return (
    <nav className="min-w-0 flex-1">
      <div className="flex">
        {/* Sits in the row like a tab, but opens the side menu instead of
            navigating — there is no settings page to land on. */}
        <button onClick={onSettings} className={tabClass(!!settingsOpen)} aria-haspopup="menu" aria-expanded={!!settingsOpen}>
          <Settings size={22} strokeWidth={1.75} />
          <span className="whitespace-pre-line text-center leading-tight">{t.navSettings}</span>
        </button>

        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => tabClass(isActive)}
          >
            <Icon size={22} strokeWidth={1.75} />
            {/* Labels may carry a line break, so Tap Pray stacks over two rows. */}
            <span className="whitespace-pre-line text-center leading-tight">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
