// The scene's timed ticket boss (RefresHeartNpc.ini): when it is out or next appears, the tickets
// held, and a Fight button that spends one ticket (AttackItemConfig) on the server.
import { useEffect, useState } from 'react'
import { GameButton } from './skin'
import { plainText } from './text'
import type { TicketBoss } from './types'

const SECOND = 1000

/** `mm:ss` (or `h:mm:ss`) until `iso`, never negative. */
export function countdown(iso: string, now: number) {
  const total = Math.max(0, Math.ceil((Date.parse(iso) - now) / SECOND))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function TicketBossPanel({
  boss,
  disabled,
  onFight,
  onExpire,
}: {
  boss: TicketBoss
  disabled?: boolean
  onFight: () => void
  /** The boss came or went: the caller refetches the scene. */
  onExpire: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const until = boss.active ? boss.endsAt : boss.startsAt
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SECOND)
    return () => clearInterval(timer)
  }, [])
  const expired = Date.parse(until) <= now
  useEffect(() => {
    if (expired) onExpire()
  }, [expired, onExpire])

  const name = plainText(boss.nameKey, 'Ticket boss')
  const ticket = plainText(boss.ticketNameKey, 'ticket')
  return (
    <section
      aria-label="Ticket boss"
      className="game-hud pointer-events-auto flex w-[200px] flex-col gap-1 p-2 font-game text-xs"
    >
      <h3 className="font-bold text-trim">
        {name} Lv. {boss.level}
      </h3>
      <p role="timer">
        {boss.active
          ? `Here now, leaves in ${countdown(boss.endsAt, now)}`
          : `Appears in ${countdown(boss.startsAt, now)}`}
      </p>
      <p>
        {ticket}: {boss.tickets}
      </p>
      <GameButton
        small
        disabled={disabled || !boss.active || boss.tickets < 1}
        title={
          !boss.active
            ? 'The boss is not here right now.'
            : boss.tickets < 1
              ? `You need a ${ticket} to fight it.`
              : `Spend one ${ticket} to fight ${name}.`
        }
        onClick={onFight}
      >
        Fight
      </GameButton>
    </section>
  )
}
