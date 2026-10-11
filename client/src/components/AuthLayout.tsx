import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Circle, Squiggle, Triangle } from './MemphisShapes'
import { Wordmark } from './SiteHeader'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-[100dvh] md:grid-cols-[1fr_minmax(28rem,36rem)]">
      <div className="relative h-48 overflow-hidden border-b-[3px] border-ink md:h-auto md:border-b-0 md:border-r-[3px]">
        <img
          src="/assets/art/login-kyuubi.webp"
          alt="Naruto facing the Nine-Tailed Fox, from the original game's login screen"
          className="absolute inset-0 size-full object-cover object-[50%_35%]"
        />
        <p className="absolute bottom-6 left-6 hidden max-w-xs -rotate-2 rounded-lg border-[3px] border-ink bg-mustard px-4 py-2 font-display text-lg font-bold shadow-sticker md:block">
          The Nine-Tailed Fox is waiting. Are you ready?
        </p>
      </div>

      <main className="relative flex flex-col overflow-hidden px-4 py-8 md:px-12">
        <Circle className="absolute -right-10 -top-10 w-40" color="var(--color-pink)" />
        <Triangle className="absolute -bottom-6 right-10 w-20 rotate-12" />
        <Squiggle className="absolute bottom-24 -left-8 w-32" />

        <div className="relative z-10">
          <Wordmark />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="relative z-10 mx-auto my-auto w-full max-w-md py-10"
        >
          <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-ink-soft">{subtitle}</p>
          <div className="mt-8 rounded-2xl border-[3px] border-ink bg-paper p-6 shadow-sticker md:p-8">
            {children}
          </div>
        </motion.div>
      </main>
    </div>
  )
}

export function FormAlert({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-xl border-[3px] border-ink bg-coral/25 px-4 py-3 text-sm font-semibold"
    >
      {message}
    </p>
  )
}
