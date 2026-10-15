// Las Noches Tower after Reborn's lobby (reborn-windows-A-L.md, "Las Noches Tower", 400x280):
// the welcome lines, Start, Express and Leave; our runs (floor, EXP pot, lives) and paid auto runs
// with lazy offline progress take the lobby's place while they last. Express is our "start at half
// your highest floor". ponytail: no VIP Route (no VIP) and no mailed drops for skipped floors.
import type { Character, LasNochesFightResult, LasNochesView } from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { errorMessage, gameKeys } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import type { Replay } from '../types'
import { useGatePost, useLasNoches } from './api'
import { GateFight } from './GateFight'

type Fight = LasNochesFightResult<Replay>
const BUTTON = 'h-[28px] !min-w-0 !px-1'
/** Gold for 1, 2 or 3 auto runs. */
const AUTO_PRICES = [28, 58, 91]
const LAST_AUTO_FLOOR = 160
/** Reborn's compact stone price: "1k Stones", "50k Stones". */
const stones = (amount: number) =>
  amount >= 1000 ? `${Number((amount / 1000).toFixed(1))}k Stones` : `${amount} Stones`
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
  const [express, setExpress] = useState(false)

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
  const autoRow = (
    <div className="flex gap-[5px]">
      <select
        aria-label="Auto run count"
        value={runs}
        onChange={(event) => setRuns(Number(event.target.value))}
        className="h-[28px] w-[165px] border border-wood-light bg-parchment"
      >
        {AUTO_PRICES.map((gold, index) => (
          <option key={gold} value={index + 1}>
            {index + 1} run{index > 0 ? 's' : ''} ({gold} Gold)
          </option>
        ))}
      </select>
      <GameButton
        className={`${BUTTON} w-[170px]`}
        disabled={
          busy ||
          !data ||
          (!data.auto && runs > data.runsLeft) ||
          (data.run?.floor ?? 1) > LAST_AUTO_FLOOR
        }
        onClick={() => send('auto', { runs })}
      >
        {data?.auto ? 'Resume Auto' : 'Auto'}
      </GameButton>
    </div>
  )
  return (
    <Dialog title="Las Noches Tower" onClose={onClose} className="game-window-bare w-[400px]">
      <div className="flex flex-col items-center gap-[8px] font-game text-xs text-black">
        <div className="game-panel-1 flex min-h-[200px] w-[390px] flex-col items-center gap-[8px] p-[10px]">
          <p className="text-center text-[12px] font-bold">
            Welcome to Las Noches! Defeat enemies to climb higher floors.
          </p>
          <p className="text-center text-[10px]">
            Challenge powerful enemies as you climb the tower.
          </p>
          {view.isPending && <p>Loading...</p>}
          {view.isError && <Notice tone="error">{errorMessage(view.error)}</Notice>}
          {data && (
            <>
              <p>
                Runs left today: {data.runsLeft}/{data.maxRuns}
              </p>
              {data.mode === 1 ? (
                <>
                  {data.auto && (
                    <p role="status" className="text-center">
                      Auto runs left: {data.auto.runsLeft}. Target floor: {data.auto.reachFloor}.
                      {data.auto.nextTickAt &&
                        ` Next floor in ${Math.max(0, Math.ceil((Date.parse(data.auto.nextTickAt) - now) / 1000))} seconds.`}
                    </p>
                  )}
                  <GameButton
                    className={`${BUTTON} w-[350px]`}
                    disabled={busy}
                    onClick={() => send('auto-stop')}
                  >
                    Stop Auto
                  </GameButton>
                </>
              ) : data.run ? (
                <>
                  <p>Floor: {data.run.floor}</p>
                  <p>EXP pot: {data.run.pot.toLocaleString('en-US')}</p>
                  <p>Lives: {data.run.lives}</p>
                  <GameButton
                    className="h-[32px] w-[350px]"
                    disabled={busy}
                    onClick={() =>
                      fight.mutate({ path: 'las-noches/fight' }, { onSuccess: setReplay })
                    }
                  >
                    Fight Floor {data.run.floor}
                  </GameButton>
                  <div className="flex gap-[10px]">
                    <GameButton
                      className={`${BUTTON} w-[170px]`}
                      disabled={busy}
                      onClick={() => send('buy-life')}
                    >
                      Buy a Life ({data.run.lifePrice} Gold)
                    </GameButton>
                    <GameButton
                      className={`${BUTTON} w-[170px]`}
                      disabled={busy}
                      onClick={() => send('withdraw')}
                    >
                      Claim EXP and End Current Run
                    </GameButton>
                  </div>
                  {autoRow}
                </>
              ) : (
                <>
                  <GameButton
                    className="h-[32px] w-[350px]"
                    disabled={busy || data.runsLeft === 0}
                    onClick={() => send('start', { mode: 'first' })}
                  >
                    {data.options.first.stone
                      ? `Start (${stones(data.options.first.stone)})`
                      : 'Start'}
                  </GameButton>
                  <GameButton
                    className={`${BUTTON} w-[350px]`}
                    title={`Highest Floor: ${data.bestFloor}`}
                    disabled={busy || data.runsLeft === 0 || !data.options.half}
                    onClick={() => setExpress(true)}
                  >
                    {data.options.half
                      ? `Express (${stones(data.options.half.stone)}) - Floor ${data.options.half.floor}`
                      : 'Express Route Locked'}
                  </GameButton>
                  {autoRow}
                </>
              )}
            </>
          )}
          {message && <p role="status">{message}</p>}
          {(action.error || fight.error) && (
            <Notice tone="error">{errorMessage(action.error ?? fight.error)}</Notice>
          )}
        </div>
        <GameButton className={`${BUTTON} w-[80px]`} onClick={onClose}>
          Leave
        </GameButton>
      </div>
      {express && data?.options.half && (
        <ExpressRoute
          option={data.options.half}
          onConfirm={() => {
            setExpress(false)
            send('start', { mode: 'half' })
          }}
          onClose={() => setExpress(false)}
        />
      )}
    </Dialog>
  )
}

/** Reborn's route confirm (320x180): what the route does, the floor, Confirm / Cancel. */
function ExpressRoute({
  option,
  onConfirm,
  onClose,
}: {
  option: { floor: number; stone: number }
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog title="Express Route" onClose={onClose} className="game-window-bare w-[320px]">
      <div className="game-panel-1 flex min-h-[140px] flex-col items-center justify-between gap-2 p-[10px] font-game text-xs text-black">
        <p className="text-center">
          Start at Floor {option.floor}, half your highest floor, for{' '}
          {option.stone.toLocaleString('en-US')} stones.
        </p>
        <p className="font-bold">Floor {option.floor}</p>
        <div className="flex gap-[10px]">
          <GameButton className={`${BUTTON} w-[80px]`} onClick={onConfirm}>
            Confirm
          </GameButton>
          <GameButton className={`${BUTTON} w-[80px]`} onClick={onClose}>
            Cancel
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

function fightMessage(result: Fight) {
  const outcome = result.won ? 'Floor cleared!' : 'You were defeated.'
  return result.potPaid !== null
    ? `${outcome} The run is over: you received ${result.potPaid} EXP.`
    : outcome
}
