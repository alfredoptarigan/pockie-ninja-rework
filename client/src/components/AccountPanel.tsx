import { useNavigate } from 'react-router'
import { useLogout, useMe } from '../lib/auth'
import { formatDate } from '../lib/content'
import { Button, ButtonLink, Card, ErrorState, Skeleton } from './ui'

export function AccountPanel({ showPlay = true }: { showPlay?: boolean }) {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()

  if (me.isPending) {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </Card>
    )
  }
  if (me.isError) {
    return <ErrorState message="We could not load your account." onRetry={() => me.refetch()} />
  }

  const user = me.data
  if (!user) {
    return (
      <Card className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Claim your ninja name</h2>
          <p className="mt-1 text-ink-soft">Usernames are first come, first served.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/register">Create account</ButtonLink>
          <ButtonLink to="/login" variant="secondary">
            Log in
          </ButtonLink>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Signed in as</p>
        <h2 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-bold">
          {user.username}
          {user.role === 'admin' && (
            <span className="rounded-full border-2 border-ink bg-mustard px-2.5 py-0.5 text-sm">
              Admin
            </span>
          )}
        </h2>
        <p className="mt-1 text-ink-soft">
          {user.email} · Ninja since {formatDate(user.createdAt)}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {showPlay && <ButtonLink to="/play">Play</ButtonLink>}
        <Button
          variant="secondary"
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
        >
          {logout.isPending ? 'Logging out...' : 'Log out'}
        </Button>
      </div>
      {logout.isError && (
        <p role="alert" className="text-sm font-semibold text-coral">
          {logout.error.message}
        </p>
      )}
    </Card>
  )
}
