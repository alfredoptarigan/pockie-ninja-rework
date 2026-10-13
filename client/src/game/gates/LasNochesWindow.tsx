// Kisuke Urahara's Las Noches: manual fights and paid auto runs with lazy offline progress.
import type { Character, LasNochesFightResult, LasNochesView } from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { errorMessage, gameKeys } from '../api'
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
  const queryClient = useQueryClient()
  useEffect(() => {
    if (view.data?.character) queryClient.setQueryData(gameKeys.character, view.data.character)
  }, [view.data?.character, queryClient])
  const action = useGatePost<Change>()
  const fight = useGatePost<Fight>()
  const [runs, setRuns] = useState(1)
  const { refetch } = view
  const autoMode = view.data?.mode
  const nextTickAt = view.data?.auto?.nextTickAt
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (autoMode !== 1) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
      if (nextTickAt && Date.now() >= Date.parse(nextTickAt)) void refetch()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [autoMode, nextTickAt, refetch])
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
          {data.auto && (
            <p role="status">
              Auto runs left: {data.auto.runsLeft}. Target floor: {data.auto.reachFloor}.
              {data.auto.nextTickAt &&
                ` Next floor in ${Math.max(0, Math.ceil((Date.parse(data.auto.nextTickAt) - now) / 1000))} seconds.`}
            </p>
          )}
          {data.mode === 1 ? (
            <GameButton small disabled={busy} onClick={() => send('auto-stop')}>
              Stop Auto
            </GameButton>
          ) : (
            <>
              <div className="flex gap-2">
                <select
                  aria-label="Auto run count"
                  value={runs}
                  onChange={(event) => setRuns(Number(event.target.value))}
                >
                  {[1, 2, 3].map((count) => (
                    <option key={count} value={count}>
                      {count} run{count > 1 ? 's' : ''} ({[28, 58, 91][count - 1]} Gold)
                    </option>
                  ))}
                </select>
                <GameButton
                  small
                  disabled={
                    busy || (!data.auto && runs > data.runsLeft) || (data.run?.floor ?? 1) > 160
                  }
                  onClick={() => send('auto', { runs })}
                >
                  {data.auto ? 'Resume Auto' : 'Auto'}
                </GameButton>
              </div>
              {data.run ? (
                <div className="flex flex-wrap gap-2">
                  <GameButton
                    small
                    disabled={busy}
                    onClick={() =>
                      fight.mutate({ path: 'las-noches/fight' }, { onSuccess: setReplay })
                    }
                  >
                    Fight Floor {data.run.floor}
                  </GameButton>
                  <GameButton small disabled={busy} onClick={() => send('buy-life')}>
                    Buy a Life ({data.run.lifePrice} Gold)
                  </GameButton>
                  <GameButton small disabled={busy} onClick={() => send('withdraw')}>
                    Claim EXP and End Current Run
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
            </>
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
