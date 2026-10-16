import type { Character, LasNochesFightResult, LasNochesView } from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { errorMessage, gameKeys } from '../api'
import { AreaLoading } from '../AreaLoading'
import { Dialog, GameButton, Notice } from '../skin'
import type { Replay } from '../types'
import { gateKeys, useGatePost, useLasNoches } from './api'
import { GateFight } from './GateFight'
import { gargantaAllowed } from './las-noches-art'
import './las-noches.css'
import { LasNochesScene } from './LasNochesScene'
import { LasNochesTower } from './LasNochesTower'

type Fight = LasNochesFightResult<Replay>
type Change = { lasNoches: LasNochesView; character: Character; potPaid?: number }
const stones = (amount: number) => `${Number((amount / 1000).toFixed(1))}k Stones`

export function LasNochesWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const view = useLasNoches()
  const queryClient = useQueryClient()
  const action = useGatePost<Change>()
  const fight = useGatePost<Fight>()
  const [entered, setEntered] = useState(false)
  const [auto, setAuto] = useState(false)
  const [express, setExpress] = useState(false)
  const [replay, setReplay] = useState<Fight | null>(null)
  /** Garganta replay counter: the fight waits until the rift has torn open. */
  const [garganta, setGarganta] = useState(0)
  const gargantaDone = useCallback(() => setGarganta(0), [])
  const [message, setMessage] = useState<string | null>(null)
  const data = view.data
  const { refetch } = view
  const busy = action.isPending || fight.isPending
  useEffect(() => {
    if (data?.character) queryClient.setQueryData(gameKeys.character, data.character)
  }, [data?.character, queryClient])
  // Existing paid queues keep their server accounting; new Auto Battle uses ordinary fights.
  useEffect(() => {
    if (data?.mode !== 1) return
    const timer = window.setInterval(() => void refetch(), 30000)
    return () => window.clearInterval(timer)
  }, [data?.mode, refetch])
  const challenge = () => {
    fight.mutate(
      { path: 'las-noches/fight' },
      { onSuccess: setReplay, onError: () => setAuto(false) },
    )
  }
  const autoChallenge = useEffectEvent(challenge)
  useEffect(() => {
    if (
      !auto ||
      replay ||
      busy ||
      !data?.run ||
      data.run.lives <= 0 ||
      data.preview === null ||
      data.mode === 1
    )
      return
    const timer = window.setTimeout(autoChallenge, 3000)
    return () => window.clearTimeout(timer)
  }, [auto, replay, busy, data?.run, data?.preview, data?.mode])

  const send = (path: string, body?: object) => {
    setAuto(false)
    action.mutate(
      { path: `las-noches/${path}`, body },
      {
        onSuccess: (result) => {
          queryClient.setQueryData(gateKeys.lasNoches, result.lasNoches)
          setMessage(result.potPaid !== undefined ? `You received ${result.potPaid} EXP.` : null)
          setEntered(true)
        },
      },
    )
  }
  const fightFloor = () => {
    if (gargantaAllowed()) setGarganta((count) => count + 1)
    challenge()
  }
  if (replay && !garganta)
    return (
      <GateFight
        result={replay}
        character={character}
        sceneId={61}
        onDone={() => {
          queryClient.setQueryData(gateKeys.lasNoches, replay.lasNoches)
          setMessage(replay.won ? 'Floor cleared!' : 'You were defeated.')
          if (!replay.lasNoches.run?.lives || replay.lasNoches.preview === null) setAuto(false)
          setReplay(null)
        }}
      />
    )

  if (data && (entered || data.run))
    return (
      <LasNochesTower
        data={data}
        busy={busy}
        auto={auto}
        garganta={garganta}
        onGargantaDone={gargantaDone}
        message={message}
        error={action.error ?? fight.error ?? view.error}
        onChallenge={() => (data.run ? fightFloor() : send('start', { mode: 'first' }))}
        onAuto={() => setAuto(!auto)}
        onClaim={() => send('withdraw')}
        onStopLegacy={() => send('auto-stop')}
        onResumeLegacy={() => send('auto', { runs: data.auto?.runsLeft ?? 1 })}
        onLeave={onClose}
      />
    )

  return (
    <>
      <section
        aria-hidden="true"
        className="ln-stage pointer-events-auto"
        style={{ inset: 0, zIndex: 5 }}
      >
        <LasNochesScene />
      </section>
      <Dialog title="Las Noches Tower" onClose={onClose} className="game-window-bare w-[400px]">
        <div className="relative flex min-h-[230px] flex-col items-center gap-3 font-game text-xs text-black">
          <div className="game-panel-1 flex min-h-[195px] w-full flex-col items-center gap-3 p-4">
            <p className="text-center font-bold">
              Welcome to Las Noches! Defeat enemies to climb higher floors.
            </p>
            <p className="text-center text-[10px]">
              Challenge powerful enemies as you climb the tower.
            </p>
            {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
            {data && (
              <>
                <p>
                  Runs left today: {data.runsLeft}/{data.maxRuns}
                </p>
                <GameButton className="h-8 w-full" onClick={() => setEntered(true)}>
                  Start
                </GameButton>
                <GameButton
                  className="h-7 w-full"
                  title={`Highest Floor: ${data.bestFloor}`}
                  disabled={busy || !data.options.half || !data.runsLeft}
                  onClick={() => setExpress(true)}
                >
                  {data.options.half
                    ? `Express (${stones(data.options.half.stone)}) - Floor ${data.options.half.floor}`
                    : 'Express Route Locked'}
                </GameButton>
              </>
            )}
          </div>
          <GameButton onClick={onClose}>Leave</GameButton>
          {view.isPending && <AreaLoading label="Loading Las Noches..." />}
          {express && data?.options.half && (
            <Dialog title="Express Route" onClose={() => setExpress(false)} className="w-[320px]">
              <p className="mb-3 text-center">
                Start at Floor {data.options.half.floor} for{' '}
                {data.options.half.stone.toLocaleString('en-US')} stones.
              </p>
              <div className="flex justify-center gap-3">
                <GameButton
                  onClick={() => {
                    setExpress(false)
                    send('start', { mode: 'half' })
                  }}
                >
                  Confirm
                </GameButton>
                <GameButton onClick={() => setExpress(false)}>Cancel</GameButton>
              </div>
            </Dialog>
          )}
        </div>
      </Dialog>
    </>
  )
}
