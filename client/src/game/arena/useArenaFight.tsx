// Starts an arena fight (slot, boss, revenge): asks first when the try costs Gold
// (UI_ArenaPKReady "ArenePK_NoCount"), then plays the replay with its result.
import { useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useArena, useArenaPost, type ArenaFight } from './api'
import { signedScore, tierName } from './labels'
import type { Playing } from './ArenaReplay'

export function fightMessage(result: ArenaFight) {
  if (result.promotedTo !== null)
    return `Victory! You were promoted to ${tierName(result.promotedTo)}. Honor +${result.honor}.`
  const outcome = result.won ? 'Victory!' : 'Defeat.'
  return `${outcome} Score ${signedScore(result.scoreDelta)}, Honor +${result.honor}.`
}

interface Request {
  path: string
  body?: object
  /** "Attack Ninja_01", shown in the Gold confirmation. */
  label: string
  /** Boss fights use no try. */
  free?: boolean
}

export function useArenaFight(play: (playing: Playing) => void) {
  const arena = useArena()
  const fight = useArenaPost<ArenaFight>()
  const [pending, setPending] = useState<Request | null>(null)
  const tryGold = arena.data?.tryGold ?? null

  const run = ({ path, body }: Request) => {
    setPending(null)
    fight.mutate(
      { path, body },
      { onSuccess: (result) => play({ replay: result, result, message: fightMessage(result) }) },
    )
  }
  const start = (request: Request) => {
    if (!request.free && tryGold) setPending(request)
    else run(request)
  }

  const prompt = (
    <>
      {pending && (
        <div role="group" aria-label="Confirm fight" className="flex items-center gap-2">
          <Notice>
            No free tries left today. {pending.label} for {tryGold} Gold?
          </Notice>
          <GameButton small onClick={() => run(pending)}>
            Pay and fight
          </GameButton>
          <GameButton small onClick={() => setPending(null)}>
            Cancel
          </GameButton>
        </div>
      )}
      {fight.isError && <Notice tone="error">{errorMessage(fight.error)}</Notice>}
    </>
  )
  return {
    start,
    prompt,
    busy: fight.isPending,
    /** No try left today (free or bought): only the boss can be fought. */
    outOfTries: arena.data !== undefined && tryGold === null,
  }
}
