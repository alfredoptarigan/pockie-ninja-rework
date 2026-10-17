import { useMonsterPortrait } from './art'
import { Dialog, GameButton } from './skin'
import type { TicketBoss } from './types'

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
  const portrait = useMonsterPortrait()(boss.artId)
  const locked = disabled || boss.tickets < 1
  const reason = boss.tickets < 1 ? 'You need a Demon Proof of Suppression to fight it.' : undefined
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
