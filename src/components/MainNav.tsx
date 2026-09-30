import { NavLink } from 'react-router-dom'
import { ScrollText, Clock, Hash } from 'lucide-react'
import { useT } from '../i18n'

type MainNavProps = {
  onNavigate?: () => void
}

export function MainNav({ onNavigate }: MainNavProps) {
  const { t } = useT()

  const tabs = [
    { to: '/', icon: ScrollText, label: t.navPrayerLists },
    { to: '/timer', icon: Clock, label: t.navTimebox },
    { to: '/tags', icon: Hash, label: t.navPrayerTags },
  ] as const

  return (
    <nav className="z-40 shrink-0 border-b border-border bg-base shadow-sm">
      <div className="mx-auto flex max-w-lg">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 pt-1.5 pb-1.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-text' : 'text-text-muted hover:text-text-secondary'
              }`
            }
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
