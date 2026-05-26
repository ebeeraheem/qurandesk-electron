import { NavLink } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { useDownloadsStore } from '../stores/downloads'

type NavItem = {
  to: string
  label: string
  icon: React.JSX.Element
}

const items: NavItem[] = [
  {
    to: '/reciters',
    label: 'Reciters',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-5"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
      </svg>
    )
  },
  {
    to: '/downloads',
    label: 'Downloads',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-5"
      >
        <path
          d="M4 14a8 8 0 0 1 15.5-2.5A4.5 4.5 0 0 1 18 20H7a4 4 0 0 1-3-6Z"
          strokeLinejoin="round"
        />
      </svg>
    )
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-5"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </svg>
    )
  }
]

export default function Sidebar(): React.JSX.Element {
  // Live count of any non-completed downloads (queued / active / failed).
  const queueCount = useDownloadsStore((s) => s.queue.length)

  return (
    <aside className="app-drag flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src={logo} alt="" className="size-7" />
        <span className="text-lg font-bold tracking-tight text-primary-deep dark:text-fg">
          QuranDesk
        </span>
      </div>

      <nav className="app-no-drag flex flex-col gap-1 px-3">
        {items.map((item) => {
          const badge = item.to === '/downloads' && queueCount > 0 ? queueCount : undefined
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-bg-tint text-primary' : 'text-muted hover:bg-bg-elev hover:text-fg'
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-primary' : 'text-muted group-hover:text-fg'}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {badge !== undefined && (
                    <span className="rounded-full bg-bg-tint px-2 py-0.5 text-xs text-primary">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
