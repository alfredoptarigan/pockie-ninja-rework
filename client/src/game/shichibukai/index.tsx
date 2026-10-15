// Reborn's Shichibukai ("Sea of Fallen Waters", village icon at level 30; main.js
// @3707500-3780000): without a run, Choose Expedition (floor, difficulty, Start, Attempts,
// Supply); with one, the board and its status panel. Its dialogs open from the run's state: the
// cards after a chest or marauders, the boss on the boss tile, Floor Cleared after a victory and
// Out of Rolls. Save & Exit closes the window and keeps the run; Give Up ends it. Every rule and
// roll is the server's.
// ponytail: Reborn's sea map (one open region of five), Phaser dice and walk animations, run bag,
// daily task, star reroll, bought attempts and the Auto Dice / Auto Claim modes are left out.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  ShichibukaiActionResult,
  ShichibukaiBossResult,
  ShichibukaiRollResult,
  ShichibukaiView,
} from '../../../../shared/src/schemas/shichibukai'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { ResultWindow } from '../FightSummary'
import { ConfirmDialog } from '../inventory/dialogs'
import { Dialog, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import { showToast } from '../toast'
import type { Replay } from '../types'
import { Board, shichiArt } from './Board'
import {
  BossDialog,
  CardsDialog,
  ClearedDialog,
  ExchangeDialog,
  itemLabel,
  MoonEyeDialog,
  OutOfRollsDialog,
  StartPanel,
} from './dialogs'

type BossFight = ShichibukaiBossResult<Replay>

export const shichibukaiKey = ['game', 'shichibukai'] as const
const PATH = '/api/game/shichibukai'

const post = <T,>(path: string, body: object = {}) =>
  api<T>(`${PATH}${path}`, { method: 'POST', body })

export function ShichibukaiWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = useQuery({ queryKey: shichibukaiKey, queryFn: () => api<ShichibukaiView>(PATH) })
  const [moonEye, setMoonEye] = useState(false)
  const [exchange, setExchange] = useState(false)
  const [giveUp, setGiveUp] = useState(false)
  const [lastRoll, setLastRoll] = useState('')
  const [rewards, setRewards] = useState<BossFight['rewards']>(null)
  const [playing, setPlaying] = useState<BossFight | null>(null)
  const [defeat, setDefeat] = useState<BossFight | null>(null)
  const done = (data: ShichibukaiActionResult) => {
    queryClient.setQueryData(shichibukaiKey, data.shichibukai)
    apply(data)
    if (data.item) showToast(`Received ${itemLabel(data.item.itemId)}.`, 'success')
  }
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      post<ShichibukaiActionResult>(path, body),
    onSuccess: done,
  })
  const roll = useMutation({
    mutationFn: (face?: number) =>
      post<ShichibukaiRollResult>('/roll', face === undefined ? {} : { face }),
    onSuccess: (data) => {
      done(data)
      setMoonEye(false)
      const events = data.steps.map((step) => step.text).join(', ')
      setLastRoll(`Rolled ${data.dice}${events ? `: ${events}` : '.'}`)
    },
  })
  const boss = useMutation({
    mutationFn: (power: 50 | 100 | 150) => post<BossFight>('/boss', { power }),
    onSuccess: setPlaying,
  })
  const busy = action.isPending || roll.isPending || boss.isPending
  const act = (path: string, body?: object) => action.mutate({ path, body })

  if (playing) {
    return (
      <BattleReplayMount
        replay={playing.replay}
        clothing={character.clothing}
        monsterIds={[]}
        defenderLooks={[playing.look]}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(shichibukaiKey, playing.shichibukai)
          apply(playing)
          if (playing.victory) setRewards(playing.rewards)
          else setDefeat(playing)
          setLastRoll('')
          setPlaying(null)
        }}
      />
    )
  }

  const data = view.data
  const run = data?.run ?? null
  const outOfRolls = Boolean(run && run.rollsLeft < 1 && !run.atBoss && !run.cleared && !run.card)
  const error = view.error ?? action.error ?? roll.error ?? boss.error
  return (
    <>
      <Dialog title="Shichibukai" onClose={onClose} className="game-window-bare w-[1020px]">
        <div
          className="relative flex min-h-[482px] flex-col justify-center gap-[8px] p-[6px]"
          style={{ background: `url(${shichiArt('island1')}) center / cover` }}
        >
          {view.isPending && <p className="p-4 text-white">Loading...</p>}
          {data && !run && (
            <StartPanel
              view={data}
              busy={busy}
              onStart={(floor, difficulty) => act('/start', { floor, difficulty })}
              onSupply={() => setExchange(true)}
            />
          )}
          {run && (
            <Board
              run={run}
              busy={busy}
              rollsBlocked={run.atBoss || run.cleared || Boolean(run.card)}
              onRoll={() => roll.mutate(undefined)}
              onBuyDice={() => setMoonEye(true)}
              onSaveExit={onClose}
              onGiveUp={() => setGiveUp(true)}
            />
          )}
          {lastRoll && run && (
            <p
              role="status"
              className="font-game text-[12px] text-white [text-shadow:1px_1px_2px_#000]"
            >
              {lastRoll}
            </p>
          )}
          {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        </div>
      </Dialog>
      {run?.card && (
        <CardsDialog
          card={run.card}
          busy={busy}
          onPeek={(index) => act('/card/peek', { index })}
          onFlip={(index) => act('/card/flip', { index })}
          onClaim={() => act('/card/claim')}
        />
      )}
      {run && run.atBoss && !run.cleared && !run.card && (
        <BossDialog boss={run.boss} busy={busy} onFight={(power) => boss.mutate(power)} />
      )}
      {run?.cleared && (
        <ClearedDialog
          result={rewards}
          floor={run.floor}
          busy={busy}
          onContinue={() => {
            setRewards(null)
            act('/next-floor')
          }}
          onCollect={() => {
            setRewards(null)
            act('/quit')
          }}
        />
      )}
      {outOfRolls && (
        <OutOfRollsDialog
          busy={busy}
          onBuy={(currency) => act('/buy-roll', { currency })}
          onGiveUp={() => act('/quit')}
        />
      )}
      {moonEye && (
        <MoonEyeDialog
          busy={busy}
          onPick={(face) => roll.mutate(face)}
          onClose={() => setMoonEye(false)}
        />
      )}
      {data && exchange && (
        <ExchangeDialog
          view={data}
          busy={busy}
          onExchange={(id) => act('/exchange', { id })}
          onClose={() => setExchange(false)}
        />
      )}
      {giveUp && (
        <ConfirmDialog
          text="Leave the expedition without saving? This run will be abandoned."
          onAccept={() => act('/quit')}
          onClose={() => setGiveUp(false)}
        />
      )}
      {defeat && (
        <ResultWindow
          title="Defeat"
          story={`${defeat.replay.fighters.find((f) => f.side === 'defenders')?.name ?? 'The boss'} defeated you.`}
          note="The expedition is over."
          columns={[]}
          findTitle="Rewards"
          finds={[]}
          emptyFind="Defeat ends the expedition without a reward."
          onClose={() => setDefeat(null)}
        />
      )}
    </>
  )
}
