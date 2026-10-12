import type { Character } from '@pockie/shared'
import { errorMessage, useRevive } from './api'
import { Dialog, GameButton, Notice } from './skin'
import type { SceneView } from './types'

/**
 * Shown while the ninja is defeated (0 HP, ReliveSystem): go home with 1 HP for a share of EXP,
 * or revive on the spot with full HP and chakra for Gold.
 */
export function ReviveWindow({
  character,
  terms,
  onClose,
}: {
  character: Character
  /** From GET /scene; undefined while the scene loads. */
  terms: SceneView['revive'] | undefined
  onClose: () => void
}) {
  const revive = useRevive()
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
      ? `You lose ${terms.homeExpLoss} EXP (5% of the EXP your next level needs).`
      : 'You lose no EXP at the level cap.'

  return (
    <Dialog title="Defeated" onClose={onClose} className="w-[30rem]">
      <div className="flex flex-col gap-3">
        <p>You were defeated. Revive to fight, travel or explore again.</p>
        {revive.isError && <Notice tone="error">{errorMessage(revive.error)}</Notice>}
        <section aria-label="Return to village" className="game-card flex flex-col gap-1 p-2">
          <p>Wake up in your village with 1 HP. {expText}</p>
          <GameButton
            small
            className="self-start"
            disabled={revive.isPending}
            onClick={() => revive.mutate('home')}
          >
            Return to village
          </GameButton>
        </section>
        <section aria-label="Revive here" className="game-card flex flex-col gap-1 p-2">
          <p>Stand up right here with full HP and chakra for {terms?.gold ?? 1} Gold.</p>
          {goldBlocked && <p className="text-xs font-bold text-[#8a1610]">{goldBlocked}</p>}
          <GameButton
            small
            className="self-start"
            disabled={revive.isPending || !!goldBlocked}
            onClick={() => revive.mutate('gold')}
          >
            Revive here
          </GameButton>
        </section>
      </div>
    </Dialog>
  )
}
