// Kisuke Urahara's Las Noches (SingleGateEntryNpc.js), manual mode: start on floor 1 or at 50%
// of the best floor, fight floor by floor, buy lives, withdraw with the EXP pot.
import type { Character, LasNochesFightResult, LasNochesView } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import type { Replay } from '../types'
import { useGatePost, useLasNoches } from './api'
import { GateFight } from './GateFight'

type Fight = LasNochesFightResult<Replay>
type Change = { lasNoches: LasNochesView; character: Character; potPaid?: number }

export function LasNochesWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const view = useLasNoches()
  const action = useGatePost<Change>()
  const fight = useGatePost<Fight>()
  const [replay, setReplay] = useState<Fight | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (replay) {
    return (
      <GateFight
        result={replay}
        character={character}
        onDone={() => {
          setMessage(fightMessage(replay))
          setReplay(null)
        }}
      />
    )
  }
  const data = view.data
  const busy = action.isPending || fight.isPending
  const send = (path: string, body?: object) =>
    action.mutate(
      { path: `las-noches/${path}`, body },
      {
        onSuccess: (result) =>
          setMessage(result.potPaid !== undefined ? `You received ${result.potPaid} EXP.` : null),
      },
    )
  return (
    <Dialog title="Las Noches" onClose={onClose} className="w-[30rem]">
      {view.isPending && <p>Loading...</p>}
      {view.isError && <Notice tone="error">{errorMessage(view.error)}</Notice>}
      {data && (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="font-bold">Best floor</dt>
            <dd>{data.bestFloor}</dd>
            <dt className="font-bold">Runs left today</dt>
            <dd>
              {data.runsLeft} / {data.maxRuns}
            </dd>
            {data.run && (
              <>
                <dt className="font-bold">Floor</dt>
                <dd>{data.run.floor}</dd>
                <dt className="font-bold">EXP pot</dt>
                <dd>{data.run.pot}</dd>
                <dt className="font-bold">Lives</dt>
                <dd>{data.run.lives}</dd>
              </>
            )}
          </dl>
          {message && <p role="status">{message}</p>}
          {data.run ? (
            <div className="flex flex-wrap gap-2">
              <GameButton
                small
                disabled={busy}
                onClick={() => fight.mutate({ path: 'las-noches/fight' }, { onSuccess: setReplay })}
              >
                Fight Floor {data.run.floor}
              </GameButton>
              <GameButton small disabled={busy} onClick={() => send('buy-life')}>
                Buy a Life ({data.run.lifePrice} Gold)
              </GameButton>
              <GameButton small disabled={busy} onClick={() => send('withdraw')}>
                Withdraw
              </GameButton>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <GameButton
                small
                disabled={busy || data.runsLeft === 0}
                onClick={() => send('start', { mode: 'first' })}
              >
                Start at Floor 1 ({data.options.first.stone} Stone)
              </GameButton>
              {data.options.half && (
                <GameButton
                  small
                  disabled={busy || data.runsLeft === 0}
                  onClick={() => send('start', { mode: 'half' })}
                >
                  Start at Floor {data.options.half.floor} ({data.options.half.stone} Stone)
                </GameButton>
              )}
            </div>
          )}
          {(action.error || fight.error) && (
            <Notice tone="error">{errorMessage(action.error ?? fight.error)}</Notice>
          )}
        </div>
      )}
    </Dialog>
  )
}

function fightMessage(result: Fight) {
  const outcome = result.won ? 'Floor cleared!' : 'You were defeated.'
  return result.potPaid !== null
    ? `${outcome} The run is over: you received ${result.potPaid} EXP.`
    : outcome
}
