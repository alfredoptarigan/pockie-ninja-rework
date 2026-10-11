import { Link } from 'react-router'
import { useMe } from '../lib/auth'
import { ButtonLink } from './ui'

const sections = [
  { href: '/#news', label: 'News' },
  { href: '/#lore', label: 'Lore' },
  { href: '/#faq', label: 'FAQ' },
]

export function Wordmark() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 rounded-md font-display text-xl font-extrabold tracking-tight focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/60"
    >
      Pockie Ninja
      <span className="-rotate-3 rounded border-2 border-ink bg-mustard px-1.5 text-xs uppercase tracking-wider">
        Remastered
      </span>
    </Link>
  )
}

export function SiteHeader() {
  const { data: user } = useMe()

  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-cream/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Wordmark />
        <nav aria-label="Sections" className="hidden items-center gap-8 font-semibold md:flex">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="underline-offset-8 decoration-[3px] decoration-coral hover:underline"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <ButtonLink to="/play" className="!px-4 !py-1.5 text-sm">
              Play
            </ButtonLink>
          ) : (
            <>
              <Link to="/login" className="hidden font-semibold hover:underline sm:inline">
                Log in
              </Link>
              <ButtonLink to="/register" className="!px-4 !py-1.5 text-sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
