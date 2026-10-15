// An Akatsuki pair fight (ambush, "Face them now" or a rematch): the replay, then the result
// window. Also Reborn's ambush overlay after a won field fight ("AMBUSH!", the pair, its entrance
// line), which starts the pair fight by itself after 2.6 s.
import type { Character } from '@pockie/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  AkatsukiAmbush as Ambush,
  AkatsukiFightResult,
} from '../../../../shared/src/schemas/akatsuki'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { ResultWindow } from '../FightSummary'
import { BattleReplayMount } from '../stage'
import { showToast } from '../toast'
import type { Replay } from '../types'
import { ENTRANCES, pairNames, spriteUrl } from './members'

export type PairFightResult = AkatsukiFightResult<Replay>
export const akatsukiKey = ['game', 'akatsuki'] as const
export const AKATSUKI_PATH = '/api/game/akatsuki'
/** Reborn starts the ambush fight 2.6 s into the overlay. */
const AMBUSH_MS = 2600

export const postFight = (path: '/ambush' | '/rematch', body?: object) =>
  api<PairFightResult>(`${AKATSUKI_PATH}${path}`, { method: 'POST', body })

/** The replay, then Victory / Defeat; the hunt state and the HUD update when the replay ends. */
export function PairFight({
  fight,
  character,
  onDone,
}: {
  fight: PairFightResult
  character: Character
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [watched, setWatched] = useState(false)
  if (!watched)
    return (
      <BattleReplayMount
        replay={fight.replay}
        clothing={character.clothing}
        monsterIds={[]}
        defenderLooks={fight.looks}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(akatsukiKey, fight.akatsuki)
          apply(fight)
          setWatched(true)
        }}
      />
    )
  const pair = fight.akatsuki.pairs.find((p) => p.key === fight.pair)
  const names = pairNames(pair?.members ?? [])
  return (
    <ResultWindow
      title={fight.won ? 'Victory' : 'Defeat'}
      story={fight.won ? `You defeated ${names}.` : `${names} defeated you.`}
      note={`Pairs defeated: ${fight.akatsuki.pairsDefeated} / ${fight.akatsuki.pairs.length}`}
      columns={[]}
      findTitle="Akatsuki"
      finds={[]}
      emptyFind={
        fight.won
          ? 'Claim their red outfits in the Akatsuki Invasion.'
          : 'They vanish into the dark. The hunt goes on.'
      }
      onClose={onDone}
    />
  )
}

/** Reborn's ambush overlay, then the pair fight. */
export function AkatsukiAmbush({
  ambush,
  character,
  onDone,
}: {
  ambush: Ambush
  character: Character
  onDone: () => void
}) {
  const fight = useMutation({
    mutationFn: () => postFight('/ambush'),
    onError: (error) => {
      showToast(errorMessage(error) || 'The ambush could not start.', 'failure')
      onDone()
    },
  })
  const { mutate } = fight
  useEffect(() => {
    const timer = window.setTimeout(() => mutate(), AMBUSH_MS)
    return () => window.clearTimeout(timer)
  }, [mutate])

  if (fight.data) return <PairFight fight={fight.data} character={character} onDone={onDone} />
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(circle,rgba(120,10,30,.55),rgba(10,5,15,.85)_70%)] font-game"
    >
      <div className="flex items-end gap-6">
        {ambush.members.map((member, i) => {
          const url = spriteUrl(member)
          return url ? (
            <img
              key={member}
              src={url}
              alt=""
              aria-hidden="true"
              className="h-[220px] drop-shadow-[0_0_14px_#b3122a]"
              style={i === 1 ? { transform: 'scaleX(-1)' } : undefined}
            />
          ) : null
        })}
      </div>
      <div className="absolute flex flex-col items-center gap-1 text-center [text-shadow:0_2px_6px_#000]">
        <strong className="text-[48px] tracking-[.12em] text-[#ff2442]">AMBUSH!</strong>
        <span className="text-[20px] text-[#f5edf9]">{pairNames(ambush.members)}</span>
        <small className="text-[14px] text-[#d3c8df]">{ENTRANCES[ambush.pair]}</small>
      </div>
    </div>
  )
}
