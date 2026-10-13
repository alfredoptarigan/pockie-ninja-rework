// Plays an arena or duel replay; a fight's result reaches the HUD once the replay is over.
import type { Character } from '@pockie/shared'
import { useApplyResult } from '../api'
import { BattleReplayMount } from '../stage'
import type { LogReplay } from './api'

/** What the arena window is playing: the replay, the result to apply after it, the message. */
export interface Playing {
  replay: LogReplay
  result?: { character: Character }
  message?: string
}

export function ArenaReplay({
  playing,
  character,
  onDone,
}: {
  playing: Playing
  character: Character
  onDone: () => void
}) {
  const apply = useApplyResult()
  const [attacker, defender] = playing.replay.looks
  // ponytail: the stage draws one outfit (the attackers) and NPC art for the defenders, so a
  // defending player or the Referee has no body yet; pass their outfit once BattleOptions takes it.
  return (
    <BattleReplayMount
      replay={playing.replay.replay}
      clothing={'clothing' in attacker ? attacker.clothing : character.clothing}
      weaponItemId={'clothing' in attacker ? attacker.weaponItemId : undefined}
      monsterIds={['npcId' in defender ? defender.npcId : '']}
      sceneId={character.sceneId}
      onFinished={() => {
        if (playing.result) apply(playing.result)
        onDone()
      }}
    />
  )
}
