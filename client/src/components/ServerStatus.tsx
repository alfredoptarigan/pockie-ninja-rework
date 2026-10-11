import { useServerStatus } from '../lib/content'

export function ServerStatus({ className = '' }: { className?: string }) {
  const { data, isPending, isError } = useServerStatus()
  const online = !isError && data?.online === true

  let label = 'Checking server...'
  if (isError) label = 'Server offline'
  else if (data) {
    const players = data.playersActiveNow
    label = `Server online · ${players} ${players === 1 ? 'player' : 'players'} active now`
  }

  return (
    <p
      aria-live="polite"
      className={`inline-flex items-center gap-3 rounded-full border-[3px] border-ink bg-paper px-4 py-2 text-sm font-semibold shadow-sticker-sm ${className}`}
    >
      <span className="relative flex size-3" aria-hidden="true">
        {online && <span className="breathe absolute inset-0 rounded-full bg-teal" />}
        <span
          className={`relative size-3 rounded-full border-2 border-ink ${
            isPending ? 'bg-mustard' : online ? 'bg-teal' : 'bg-coral'
          }`}
        />
      </span>
      {label}
    </p>
  )
}
