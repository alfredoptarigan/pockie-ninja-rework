// Reborn's Impel Down window (village icon, level 61; chunk 286, reborn-lazy-features.md
// "## Impel Down"): the tower on the left, the status panel on the right (current floor, lives,
// the floor's EXP and crystal drops, Auto Sell, Auto and Refresh). Clicking the current floor
// fights it (or, at the intersection after floor 25, offers the next gate). Every rule and roll is
// the server's. Auto fights the next floor 3 s after each fight and stops on a defeat, at the
// intersection or when the window closes. ponytail: Reborn's fight cooldown and global auto-fight
// registry are left out.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { crystalInfo } from '../../../../game-core/src/zanpakuto/zanpakuto'
import {
  IMPEL_DOWN_RULES,
  type ImpelDownFightResult,
  type ImpelDownView,
} from '../../../../shared/src/schemas/impel-down'
import type { Character } from '@pockie/shared'
import { api } from '../../lib/api'
import { errorMessage, gameKeys, useApplyResult } from '../api'
import { useNow } from '../events/timer'
import { ResultWindow } from '../FightSummary'
import { ConfirmDialog } from '../inventory/dialogs'
import { Dialog, GameButton, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import type { Replay } from '../types'
import { ImpelDownInfo, StatusPanel } from './StatusPanel'
import { Tower } from './Tower'

type Fight = ImpelDownFightResult<Replay>

export const impelDownKey = ['game', 'impelDown'] as const
const PATH = '/api/game/impel-down'
/** Seconds before Auto fights again, and before a won fight's result closes under Auto. */
export const AUTO_DELAY = 3

/** At least one full clear of the current gate unlocks Auto (Reborn: maxFloor >= 25 * (G + 1)). */
export const autoUnlocked = (view: ImpelDownView) =>
  view.maxFloor >= IMPEL_DOWN_RULES.floorsPerGate * (view.gate + 1)

export function ImpelDownWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = useQuery({ queryKey: impelDownKey, queryFn: () => api<ImpelDownView>(PATH) })
  const [info, setInfo] = useState(false)
  const [confirm, setConfirm] = useState<{ text: string; onAccept: () => void }>()
  const [autoSell, setAutoSell] = useState(0)
  const [auto, setAuto] = useState(false)
  /** When Auto fights next (ms), or null while it waits for nothing. */
  const [autoAt, setAutoAt] = useState<number | null>(null)
  const [playing, setPlaying] = useState<Fight | null>(null)
  const [result, setResult] = useState<Fight | null>(null)
  const now = useNow()
  const fight = useMutation({
    mutationFn: (tier: number) =>
      api<Fight>(`${PATH}/fight`, { method: 'POST', body: { autoSell: tier } }),
    onSuccess: setPlaying,
    onError: () => setAuto(false),
  })
  const step = useMutation({
    mutationFn: (path: '/next-gate' | '/refresh') =>
      api<ImpelDownView>(`${PATH}${path}`, { method: 'POST' }),
    onSuccess: (data, path) => {
      queryClient.setQueryData(impelDownKey, data)
      if (path === '/refresh') void queryClient.invalidateQueries({ queryKey: gameKeys.character })
    },
  })
  const busy = fight.isPending || step.isPending
  const startFight = fight.mutate
  const closeResult = useCallback(() => {
    setResult(null)
    if (auto) setAutoAt(Date.now() + AUTO_DELAY * 1000)
  }, [auto])

  // Auto: fight when the countdown runs out (the timer, not the effect, starts the fight).
  const waiting = auto && autoAt !== null && !playing && !result && !busy
  useEffect(() => {
    if (!waiting || autoAt === null) return
    const timer = window.setTimeout(
      () => {
        setAutoAt(null)
        startFight(autoSell)
      },
      Math.max(0, autoAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [waiting, autoAt, autoSell, startFight])

  if (playing) {
    return (
      <BattleReplayMount
        replay={playing.replay}
        clothing={character.clothing}
        monsterIds={[]}
        defenderLooks={[playing.look]}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(impelDownKey, playing.impelDown)
          apply(playing)
          const stop = !playing.won || playing.impelDown.intersection || playing.impelDown.lives < 1
          if (stop) setAuto(false)
          setResult(playing)
          setPlaying(null)
        }}
      />
    )
  }

  const data = view.data
  const toggleAuto = () => {
    setAuto(!auto)
    setAutoAt(auto ? null : Date.now() + AUTO_DELAY * 1000)
  }
  const onFloor = () => {
    if (!data || busy || auto || data.lives < 1) return
    if (data.intersection)
      setConfirm({ text: 'Proceed to the next gate?', onAccept: () => step.mutate('/next-gate') })
    else fight.mutate(autoSell)
  }
  const onRefresh = () =>
    data &&
    setConfirm({
      text: `Are you sure you want to spend ${data.refreshCost.toLocaleString('en-US')} coupons to restart from floor 1 in this gate?`,
      onAccept: () => step.mutate('/refresh'),
    })
  const countdown = autoAt === null ? 0 : Math.max(0, Math.ceil((autoAt - now) / 1000))
  const error = view.error ?? fight.error ?? step.error
  return (
    <>
      <Dialog
        title="Impel Down"
        onClose={() => {
          setAuto(false)
          onClose()
        }}
        className="w-[800px]"
      >
        <div className="relative text-[12px] text-black">
          {/* Reborn puts Info in the title bar; the dialog body clips that, so it sits above. */}
          <div className="mb-1 flex justify-end">
            <GameButton small onClick={() => setInfo(true)}>
              Info
            </GameButton>
          </div>
          {view.isPending && <p className="p-4">Loading Impel Down...</p>}
          {error && <Notice tone="error">{errorMessage(error)}</Notice>}
          {data && (
            <div className="relative flex h-[386px] w-[750px] gap-[5px]">
              <Tower
                gate={data.gate}
                floor={data.floor}
                maxFloor={data.maxFloor}
                intersection={data.intersection}
                clothing={character.clothing}
                disabled={busy || auto || data.lives < 1}
                onFloor={onFloor}
              />
              <StatusPanel
                view={data}
                autoSell={autoSell}
                onAutoSell={setAutoSell}
                auto={auto}
                autoLabel={auto ? (countdown > 0 ? `Stop (${countdown})` : 'Stop') : 'Auto'}
                autoDisabled={
                  data.intersection ||
                  data.lives < 1 ||
                  busy ||
                  !autoUnlocked(data) ||
                  (auto && autoAt !== null && countdown < 1)
                }
                onAuto={toggleAuto}
                refreshDisabled={
                  !data.intersection || data.refreshes >= IMPEL_DOWN_RULES.maxRefreshes || busy
                }
                onRefresh={onRefresh}
              />
            </div>
          )}
        </div>
      </Dialog>
      {info && <ImpelDownInfo onClose={() => setInfo(false)} />}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          onAccept={confirm.onAccept}
          onClose={() => setConfirm(undefined)}
        />
      )}
      {result && <FightResult result={result} auto={auto} onClose={closeResult} />}
    </>
  )
}

function FightResult({
  result,
  auto,
  onClose,
}: {
  result: Fight
  auto: boolean
  onClose: () => void
}) {
  // Under Auto a won fight's result closes itself after the delay (Reborn's 3 s countdown).
  const autoClose = auto && result.won
  useEffect(() => {
    if (!autoClose) return
    const timer = window.setTimeout(onClose, AUTO_DELAY * 1000)
    return () => window.clearTimeout(timer)
  }, [autoClose, onClose])
  const enemy = result.replay.fighters.find((f) => f.side === 'defenders')?.name ?? 'the guard'
  const { lives, maxLives } = result.impelDown
  const crystal = result.crystal
  const name = crystal ? crystalInfo(crystal.iid)?.name : undefined
  const found = !crystal
    ? result.won
      ? 'No crystal this time.'
      : 'Win a floor for a chance at a crystal.'
    : crystal.sold
      ? `${name} sold for ${crystal.coins} SC.`
      : `${name} went to your spirit inventory.`
  return (
    <ResultWindow
      title={result.won ? 'Victory' : 'Defeat'}
      story={result.won ? `You defeated ${enemy}.` : `${enemy} defeated you.`}
      note={`Lives left: ${lives}/${maxLives}.`}
      columns={result.won ? [{ label: 'EXP', value: result.exp, color: '#2e8b00' }] : []}
      findTitle="Crystal"
      finds={[]}
      emptyFind={found}
      onClose={onClose}
    />
  )
}
