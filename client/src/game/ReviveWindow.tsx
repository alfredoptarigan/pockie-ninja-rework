import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useRevive } from './api'
import { Dialog, GameButton, Notice } from './skin'
import type { SceneView } from './types'

type Mode = 'home' | 'gold'

/**
 * Shown while the ninja is defeated (0 HP, ReliveSystem), laid out like Reborn's healing dialog
 * (reborn-windows-A-L.md "Healing items available" parent, `Xj`): "Defeated by {enemy}", 380
 * wide, the call to heal and one 354x26 button per way back, each with what it costs. Choosing one
 * goes through Reborn's "Confirm healing?" step (320 wide, a 310x72 text box, Confirm / Cancel
 * 80x24). Our ways back are ReliveSystem's: home with 1 HP for a share of EXP, or full HP and
 * chakra on the spot for Gold.
 */
export function ReviveWindow({
  character,
  terms,
  enemy,
  onClose,
}: {
  character: Character
  /** From GET /scene; undefined while the scene loads. */
  terms: SceneView['revive'] | undefined
  /** Who won the fight, for the title. */
  enemy?: string
  onClose: () => void
}) {
  const revive = useRevive()
  const [confirming, setConfirming] = useState<Mode | null>(null)
  const goldBlocked = !terms
    ? 'Checking the cost...'
    : !terms.goldAllowed
      ? 'You cannot revive in this area.'
      : character.gold < terms.gold
        ? `You need ${terms.gold} Gold and have ${character.gold}.`
        : undefined
  const expText = !terms
    ? ''
    : terms.homeExpLoss > 0
      ? `You lose ${terms.homeExpLoss} EXP.`
      : 'You lose no EXP at the level cap.'

  if (confirming) {
    return (
      <Dialog
        title="Confirm healing?"
        onClose={() => setConfirming(null)}
        className="game-window-bare w-[320px]"
      >
        <div className="flex flex-col items-center gap-[8px] font-game text-[12px] text-black">
          <p className="game-panel-1 flex min-h-[72px] w-[310px] items-center justify-center p-[8px] text-center">
            {confirming === 'home'
              ? `Return to your village with 1 HP? ${expText}`
              : `Revive here with full HP and chakra for ${terms?.gold ?? 1} Gold?`}
          </p>
          <div className="flex gap-[10px]">
            <GameButton
              className="h-[24px] w-[80px]"
              disabled={revive.isPending}
              onClick={() => {
                revive.mutate(confirming)
                setConfirming(null)
              }}
            >
              Confirm
            </GameButton>
            <GameButton className="h-[24px] w-[80px]" onClick={() => setConfirming(null)}>
              Cancel
            </GameButton>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={enemy ? `Defeated by ${enemy}` : 'Defeated'}
      onClose={onClose}
      className="game-window-bare w-[380px]"
    >
      <div className="game-panel-1 flex flex-col items-center gap-[8px] p-[8px] font-game text-[12px] text-black">
        <p className="text-center font-bold">You need healing to continue fighting!</p>
        {revive.isError && <Notice tone="error">{errorMessage(revive.error)}</Notice>}
        <section aria-label="Return to village" className="flex w-[354px] flex-col gap-[2px]">
          <GameButton
            className="h-[26px] w-full"
            disabled={revive.isPending}
            onClick={() => setConfirming('home')}
          >
            Return to village
          </GameButton>
          <p className="text-[11px]">Wake up in your village with 1 HP. {expText}</p>
        </section>
        <section aria-label="Revive here" className="flex w-[354px] flex-col gap-[2px]">
          <GameButton
            className="h-[26px] w-full"
            disabled={revive.isPending || !!goldBlocked}
            onClick={() => setConfirming('gold')}
          >
            Revive here
          </GameButton>
          <p className="text-[11px]">
            Stand up right here with full HP and chakra for {terms?.gold ?? 1} Gold.
          </p>
          {goldBlocked && <p className="text-[11px] font-bold text-[#8a1610]">{goldBlocked}</p>}
        </section>
      </div>
    </Dialog>
  )
}
