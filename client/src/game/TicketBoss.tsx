// The scene's timed ticket boss (RefresHeartNpc.ini): when it is out or next appears, the tickets
// held, and a Fight button that spends one ticket (AttackItemConfig) on the server.
import { useEffect, useState } from 'react'
import { useMonsterPortrait } from './art'
import { Dialog, GameButton } from './skin'
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

/** Reborn's field boss dialog: the outdoor figure opens this even without a proof. */
export function TicketBossInfo({
  boss,
  disabled,
  onFight,
  onAuto,
  onClose,
}: {
  boss: TicketBoss
  disabled?: boolean
  onFight: () => void
  onAuto: () => void
  onClose: () => void
}) {
  const portrait = useMonsterPortrait()(boss.id)
  const locked = disabled || !boss.active || boss.tickets < 1
  const reason = !boss.active
    ? 'The boss is not here right now.'
    : boss.tickets < 1
      ? 'You need a Demon Proof of Suppression to fight it.'
      : undefined
  return (
    <Dialog title="Monster Information" onClose={onClose} className="w-[378px]">
      <div className="game-panel-1 min-h-[124px] w-[338px] p-[6px] font-game text-xs">
        <div className="game-inset flex min-h-[112px] gap-2 p-1">
          <div className="game-monster-card relative h-[102px] w-[80px] shrink-0">
            {portrait && (
              <img
                src={portrait}
                alt=""
                className="absolute top-[6px] left-[8px] size-[62px] object-contain"
              />
            )}
            <span className="absolute top-[62px] left-[8px] w-16 text-center text-[10px] font-bold text-[#ffd700]">
              Lv.{boss.level}
            </span>
            <span className="absolute top-[80px] left-[2px] w-[76px] text-center text-[9px] font-bold text-[whitesmoke]">
              Demon Boss
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
            <p className="font-bold text-[#365a24]">Demon Boss</p>
            <p>
              Demon Proofs:{' '}
              <strong className={boss.tickets > 0 ? 'text-[#365a24]' : 'text-[#aa2222]'}>
                {boss.tickets}
              </strong>
            </p>
            {reason && <p className="text-[10px]">{reason}</p>}
            <div className="mt-auto flex gap-1">
              <GameButton
                className="h-6 w-[72px]"
                disabled={locked}
                title={reason}
                onClick={onFight}
              >
                Fight
              </GameButton>
              <GameButton
                className="h-6 w-[72px]"
                disabled={locked}
                title={reason}
                onClick={onAuto}
              >
                Auto
              </GameButton>
              <GameButton className="h-6 w-[72px]" onClick={onClose}>
                Cancel
              </GameButton>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
