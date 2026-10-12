import { lazy, Suspense, useState } from 'react'
import { Navigate } from 'react-router'
import { ErrorState, Skeleton } from '../components/ui'
import { useMe } from '../lib/auth'

// The game (and its text table) loads only for signed-in players.
const GameApp = lazy(() => import('../game/GameApp'))

export function Play({ view = 'game' }: { view?: 'game' | 'create' }) {
  const me = useMe()
  // Logging out from here clears the user before the router commits the move to "/"; a player
  // who was signed in goes home instead of being bounced to the login page.
  const [wasSignedIn, setWasSignedIn] = useState(false)
  if (me.data && !wasSignedIn) setWasSignedIn(true)

  if (me.isPending) {
    return (
      <div role="status" aria-label="Loading your account" className="mx-auto max-w-3xl p-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <ErrorState message="We could not check your session." onRetry={() => me.refetch()} />
      </div>
    )
  }
  if (!me.data) {
    return wasSignedIn ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate
        to="/login"
        replace
        state={{ from: view === 'create' ? '/play/create' : '/play' }}
      />
    )
  }

  return (
    <Suspense fallback={<p className="p-8">Loading the game...</p>}>
      <GameApp view={view} />
    </Suspense>
  )
}
