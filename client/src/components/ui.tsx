import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'

type Variant = 'primary' | 'secondary' | 'dark'

const variants: Record<Variant, string> = {
  primary: 'bg-coral text-ink',
  secondary: 'bg-paper text-ink',
  dark: 'bg-ink text-cream',
}

export function buttonClass(variant: Variant = 'primary', extra = '') {
  return [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-[3px] border-ink px-6 py-2.5',
    'font-display text-base font-bold shadow-sticker-sm transition-[transform,box-shadow] duration-100',
    'hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/60',
    'disabled:pointer-events-none disabled:opacity-60',
    variants[variant],
    extra,
  ].join(' ')
}

export function Button({
  variant,
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />
}

export function ButtonLink({
  variant,
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />
}

export function SectionHeading({
  eyebrow,
  title,
  accent = 'bg-mustard',
}: {
  eyebrow: string
  title: string
  accent?: string
}) {
  return (
    <div className="mb-10">
      <p
        className={`inline-block -rotate-2 rounded-md border-[3px] border-ink px-3 py-1 font-display text-sm font-bold uppercase tracking-wider shadow-sticker-sm ${accent}`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-4 text-4xl font-extrabold tracking-tight md:text-5xl">{title}</h2>
    </div>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border-[3px] border-ink bg-paper shadow-sticker ${className}`}>
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-ink/10 ${className}`} />
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-4 p-6">
      <p role="alert" className="font-medium">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card className="border-dashed p-8 text-center text-ink-soft shadow-none">
      <p>{children}</p>
    </Card>
  )
}
