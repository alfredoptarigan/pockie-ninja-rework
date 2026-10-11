import { ChibiSprite } from '../components/ChibiSprite'
import { ButtonLink } from '../components/ui'

export function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 text-center">
      <ChibiSprite name="gaara" className="w-32" />
      <h1 className="text-5xl font-extrabold tracking-tight">Lost in the sand</h1>
      <p className="max-w-md text-lg text-ink-soft">
        This page does not exist. Maybe it was sealed away.
      </p>
      <ButtonLink to="/">Back to the village</ButtonLink>
    </main>
  )
}
