import { Navigate } from 'react-router'
import { AccountPanel } from '../components/AccountPanel'
import { ChibiSprite } from '../components/ChibiSprite'
import { Circle, DotGrid } from '../components/MemphisShapes'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { Card, ErrorState, Skeleton } from '../components/ui'
import { useMe } from '../lib/auth'

export function Play() {
  const me = useMe()

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
  if (!me.data) return <Navigate to="/login" replace state={{ from: '/play' }} />

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 md:px-8">
        <Card className="relative overflow-hidden p-8 md:p-12">
          <DotGrid className="absolute inset-y-0 right-0 w-1/3 opacity-10" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_12rem]">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
                The gate is almost open, {me.data.username}
              </h1>
              <p className="mt-4 max-w-[50ch] text-lg text-ink-soft">
                The game client is still being forged. Your account is ready, and this is where you
                will step into the Fire Village when it opens.
              </p>
            </div>
            <div className="relative mx-auto w-40 md:w-48">
              <Circle className="absolute inset-0" color="var(--color-mustard)" />
              <ChibiSprite name="naruto" className="relative w-full" />
            </div>
          </div>
        </Card>
        <AccountPanel showPlay={false} />
      </main>
      <SiteFooter />
    </div>
  )
}
