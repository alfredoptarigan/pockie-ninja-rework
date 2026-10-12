// Pub fights in the neutral fields (UI_PubFightMonster): the line-up of three, the hourly pull
// with combo rewards, and the fight.
import type { Character, PubFightResult, PubPullResult } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'
import type { Replay } from '../types'
import { usePub, useGatePost } from './api'
import { GateFight, rewardText } from './GateFight'

type Fight = PubFightResult<Replay>

const fighterName = (npcId: string, index: number) =>
  plainText(`lg_name_${npcId}`, `Fighter ${index + 1}`)

function comboText(combo: PubPullResult['combo']) {
  if (!combo) return 'No combo this time.'
  const items = combo.items.map((item) => itemName(item.itemId)).join(', ')
  return `Combo! Grade ${combo.grade}${items ? `: ${items}` : ''}.`
}

export function PubFightWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const pub = usePub()
  const pull = useGatePost<PubPullResult>()
  const fight = useGatePost<Fight>()
  const [replay, setReplay] = useState<Fight | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (replay) {
    return (
      <GateFight
        result={replay}
        character={character}
        onDone={() => {
          setMessage(
            replay.won
              ? `Victory! ${rewardText(replay.rewards)}. ${comboText(replay.combo)}`
              : 'You were defeated.',
          )
          setReplay(null)
        }}
      />
    )
  }
  const data = pub.data
  const busy = pull.isPending || fight.isPending
  const fullHp = character.hp >= character.maxHp
  return (
    <Dialog title="Pub Fight" onClose={onClose} className="w-[30rem]">
      {pub.isPending && <p>Loading...</p>}
      {pub.isError && <Notice tone="error">{errorMessage(pub.error)}</Notice>}
      {data && (
        <div className="flex flex-col gap-2">
          <ol aria-label="Line-up" className="list-inside list-decimal">
            {data.lineup.map((npcId, index) => (
              <li key={index}>{fighterName(npcId, index)}</li>
            ))}
          </ol>
          <p className="text-xs">
            Fights today: {data.fightsToday} / {data.maxFights}.{' '}
            {data.nextPullAt
              ? `Next pull at ${new Date(data.nextPullAt).toLocaleTimeString()}.`
              : 'You can pull now.'}
          </p>
          {message && <p role="status">{message}</p>}
          {!fullHp && <p className="text-xs text-[#8a1610]">You need full HP to fight.</p>}
          <div className="flex gap-2">
            <GameButton
              small
              disabled={busy || !fullHp}
              onClick={() => fight.mutate({ path: 'pub/fight' }, { onSuccess: setReplay })}
            >
              Fight
            </GameButton>
            <GameButton
              small
              disabled={busy || Boolean(data.nextPullAt)}
              onClick={() =>
                pull.mutate(
                  { path: 'pub/pull' },
                  { onSuccess: (result) => setMessage(comboText(result.combo)) },
                )
              }
            >
              Pull
            </GameButton>
          </div>
          {(pull.error || fight.error) && (
            <Notice tone="error">{errorMessage(pull.error ?? fight.error)}</Notice>
          )}
        </div>
      )}
    </Dialog>
  )
}
