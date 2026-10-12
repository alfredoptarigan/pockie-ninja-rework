// A gate fight's battle replay; the result reaches the HUD once the replay is over.
import type { Character } from '@pockie/shared'
import { useApplyResult } from '../api'
import { BattleReplayMount } from '../stage'
import type { Replay } from '../types'

export function GateFight({
  result,
  character,
  onDone,
}: {
  result: { replay: Replay; npcIds: string[]; character: Character }
  character: Character
  onDone: () => void
}) {
  const apply = useApplyResult()
  return (
    <BattleReplayMount
      replay={result.replay}
      clothing={character.clothing}
      monsterIds={result.npcIds}
      sceneId={character.sceneId}
      onFinished={() => {
        apply(result)
        onDone()
      }}
    />
  )
}

/** "EXP +120, Stone +900, 2 items" or "Nothing gained". */
export function rewardText(rewards: { exp: number; stone: number; items: unknown[] }) {
  const parts = [
    rewards.exp > 0 && `EXP +${rewards.exp}`,
    rewards.stone > 0 && `Stone +${rewards.stone}`,
    rewards.items.length > 0 &&
      `${rewards.items.length} ${rewards.items.length === 1 ? 'item' : 'items'}`,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Nothing gained'
}
