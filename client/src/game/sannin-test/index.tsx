// Reborn's Sannin Test window ("Sannin Test - Six Dice", village icon at level 60; main.js
// @3503000-3511400): the 783x450 dice table with the counters top left (Title Rank, Growing
// Points, Dice, Change Luck) and Titles top right. Shaking rolls six dice; the result window shows
// them with the EXP, Perfect (five Ninja dice into six for Gold), Ok (claim) and Change Luck. The
// Titles panel shows the title path and starts the promotion battle. Closing the window claims a
// pending result, as Reborn does. Every rule and roll is the server's.
// ponytail: Reborn's press-and-hold charge, roll animation and title GIFs are left out (a click
// rolls); Reborn opens it from the Sannin Examiner NPC in its own scene, ours from the icon.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  SanninClaimResult,
  SanninPromotionResult,
  SanninTestView,
} from '../../../../shared/src/schemas/sannin-test'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import { showToast } from '../toast'
import type { Replay } from '../types'

type Promotion = SanninPromotionResult<Replay>

export const sanninKey = ['game', 'sanninTest'] as const
const PATH = '/api/game/sannin-test'
const ART = '/assets/reborn/features/sannin-test'
export const diceArt = (face: number) => `${ART}/dice${face}.webp`

export function SanninTestWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = useQuery({ queryKey: sanninKey, queryFn: () => api<SanninTestView>(PATH) })
  const [titles, setTitles] = useState(false)
  const [notice, setNotice] = useState('')
  const [playing, setPlaying] = useState<Promotion | null>(null)
  const setView = (data: SanninTestView) => queryClient.setQueryData(sanninKey, data)
  const dice = useMutation({
    mutationFn: (path: '/roll' | '/change-luck') =>
      api<SanninTestView>(`${PATH}${path}`, { method: 'POST' }),
    onSuccess: setView,
  })
  const perfect = useMutation({
    mutationFn: () =>
      api<{ sanninTest: SanninTestView; character: Character }>(`${PATH}/perfect`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      setView(data.sanninTest)
      apply(data)
    },
  })
  const claim = useMutation({
    mutationFn: () => api<SanninClaimResult>(`${PATH}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      setView(data.sanninTest)
      apply(data)
      showToast('Sannin Test reward claimed.', 'success')
    },
  })
  const promote = useMutation({
    mutationFn: () => api<Promotion>(`${PATH}/promote`, { method: 'POST' }),
    onSuccess: (data) => {
      setNotice('')
      setPlaying(data)
    },
  })
  const busy = dice.isPending || perfect.isPending || claim.isPending || promote.isPending

  if (playing) {
    return (
      <BattleReplayMount
        replay={playing.replay}
        clothing={character.clothing}
        monsterIds={[]}
        defenderLooks={[playing.look]}
        sceneId={character.sceneId}
        onFinished={() => {
          setView(playing.sanninTest)
          apply(playing)
          setNotice(
            playing.victory
              ? `Promotion victory: rank ${playing.targetRank} unlocked.`
              : `Promotion failed. Rank ${playing.targetRank} remains locked and no points were spent.`,
          )
          setPlaying(null)
        }}
      />
    )
  }

  const data = view.data
  const state = data?.state
  const pending = state?.pending ?? null
  const close = () => {
    // Reborn claims a pending result when the window closes.
    if (pending) claim.mutate()
    onClose()
  }
  const canRoll = Boolean(state && !pending && state.remainingDice > 0 && !busy)
  const error = view.error ?? dice.error ?? perfect.error ?? claim.error ?? promote.error
  return (
    <>
      <Dialog title="Sannin Test" onClose={close} className="game-window-bare w-[793px]">
        <div
          className="relative h-[450px] w-[783px] overflow-hidden font-game text-[12px]"
          style={{ background: `url(${ART}/dice-bg.webp) center / cover` }}
        >
          {view.isPending && <p className="p-4 text-white">Loading...</p>}
          {data && state && (
            <>
              <section
                aria-label="Sannin counters"
                className="absolute top-[10px] left-[10px] flex h-[110px] w-[250px] flex-col justify-between bg-black/50 p-[10px] font-black text-white"
              >
                <p>
                  Title Rank: {state.rank} / {data.rankBonuses.length - 1}
                </p>
                <p>Growing Points: {state.growthPoints}</p>
                <p>Dice: {state.remainingDice}</p>
                <p>Change Luck: {state.remainingFreeChanges}</p>
              </section>
              <GameButton
                className="!absolute top-[10px] right-[8px] h-[28px] w-[85px]"
                disabled={busy}
                onClick={() => setTitles(true)}
              >
                Titles
              </GameButton>
              <button
                type="button"
                aria-label="Shake the Sannin dice"
                disabled={!canRoll}
                onClick={() => dice.mutate('/roll')}
                className="absolute inset-x-[150px] top-[150px] bottom-[60px] cursor-pointer rounded-[12px] text-[16px] font-black text-[#ffe27a] [text-shadow:1px_1px_2px_#000] hover:bg-white/10 disabled:cursor-not-allowed"
              >
                {canRoll ? 'Click to shake the dice' : ''}
              </button>
              {!pending && state.remainingDice <= 0 && (
                <p className="absolute inset-x-0 bottom-[20px] text-center font-black text-white [text-shadow:1px_1px_2px_#000]">
                  All dice attempts have been used today.
                </p>
              )}
            </>
          )}
          {error && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
              <Notice tone="error">{errorMessage(error)}</Notice>
            </div>
          )}
        </div>
      </Dialog>
      {data && pending && (
        <DiceResult
          view={data}
          busy={busy}
          onPerfect={() => perfect.mutate()}
          onClaim={() => claim.mutate()}
          onChange={() => dice.mutate('/change-luck')}
        />
      )}
      {data && titles && (
        <TitlePanel
          view={data}
          notice={notice}
          busy={busy}
          onPromote={() => promote.mutate()}
          onClose={() => setTitles(false)}
        />
      )}
    </>
  )
}

function DiceResult({
  view,
  busy,
  onPerfect,
  onClaim,
  onChange,
}: {
  view: SanninTestView
  busy: boolean
  onPerfect: () => void
  onClaim: () => void
  onChange: () => void
}) {
  const pending = view.state.pending!
  const canPerfect = pending.ninjaCount === 5 && view.gold >= view.makeSixCost && !busy
  return (
    <Dialog title="Sannin Test Result" onClose={onClaim} className="game-window-bare w-[350px]">
      <div className="game-panel-1 flex flex-col items-center gap-[12px] p-[12px] font-game text-[12px] text-black">
        <ul aria-label="Dice" className="flex gap-[6px]">
          {pending.dice.map((face, i) => (
            <li key={i} className="bg-[#c4bebeb3] p-[5px]">
              <img
                src={diceArt(face)}
                alt={face === 1 ? 'Ninja die' : `Die face ${face}`}
                width={36}
                height={36}
              />
            </li>
          ))}
        </ul>
        <p>Exp Gained: {view.pendingReward?.experience.toLocaleString('en-US') ?? 0}</p>
        <p>Growing Points: +{view.pendingReward?.growthPoints ?? 0}</p>
        <div className="flex items-center gap-[10px]">
          <span>Perfect dice: {view.makeSixCost} Gold</span>
          <GameButton
            disabled={!canPerfect}
            title={`Costs ${view.makeSixCost} Gold`}
            onClick={onPerfect}
          >
            Perfect
          </GameButton>
        </div>
        <div className="flex gap-[10px]">
          <GameButton className="w-[100px]" disabled={busy} onClick={onClaim}>
            Ok
          </GameButton>
          <GameButton
            className="w-[100px]"
            disabled={busy || pending.ninjaCount >= 6 || view.state.remainingFreeChanges <= 0}
            onClick={onChange}
          >
            Change Luck
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

function TitlePanel({
  view,
  notice,
  busy,
  onPromote,
  onClose,
}: {
  view: SanninTestView
  notice: string
  busy: boolean
  onPromote: () => void
  onClose: () => void
}) {
  const { state, rankBonuses } = view
  const last = rankBonuses.length - 1
  const rank = Math.min(Math.max(0, state.rank), last)
  const current = rankBonuses[rank]!
  const next = rankBonuses[rank + 1]
  const progress = next
    ? Math.min(100, (state.growthPoints / Math.max(1, next.requiredPoints)) * 100)
    : 100
  const canPromote = Boolean(next && !state.pending && state.growthPoints >= next.requiredPoints)
  const reason = !next
    ? 'All Sannin titles have been unlocked.'
    : state.pending
      ? 'Claim the current dice result before entering a promotion battle'
      : state.growthPoints < next.requiredPoints
        ? `Requires ${next.requiredPoints} Growing Points`
        : `Defeat the examiner to unlock rank ${rank + 1}`
  return (
    <Dialog
      title="Sannin Title Progression"
      onClose={onClose}
      className="game-window-bare w-[530px]"
    >
      <div className="game-panel-1 flex flex-col gap-[10px] p-[12px] font-game text-[12px] text-black">
        <div className="flex items-baseline justify-between">
          <span className="font-bold">TITLE PATH</span>
          <strong>
            Rank {rank} of {last}
          </strong>
        </div>
        <p>Earn Growing Points with dice, then defeat the examiner to unlock each title.</p>
        <div className="flex items-center justify-center gap-[16px] text-center">
          <div>
            <span className="block">Current title</span>
            <strong>Rank {rank}</strong>
          </div>
          <span aria-hidden="true">&rarr;</span>
          <div>
            <span className="block">{next ? 'Next title' : 'Title path complete'}</span>
            <strong>{next ? `Rank ${rank + 1}` : 'MAX'}</strong>
          </div>
        </div>
        <div>
          <div className="flex justify-between">
            <span>Growing Points</span>
            <strong>{next ? `${state.growthPoints} / ${next.requiredPoints}` : 'Complete'}</strong>
          </div>
          <div
            role="progressbar"
            aria-label="Growing Points"
            aria-valuenow={Math.round(progress)}
            className="h-[10px] w-full rounded bg-black/20"
          >
            <div className="h-full rounded bg-[#e0892c]" style={{ width: `${progress}%` }} />
          </div>
          <small>
            {next
              ? 'Points are spent only after a promotion victory.'
              : 'All Sannin titles have been unlocked.'}
          </small>
        </div>
        <dl className="grid grid-cols-3 gap-[8px] text-center">
          <div>
            <dt>Current permanent HP</dt>
            <dd className="font-bold">+{current.hp}</dd>
          </div>
          <div>
            <dt>{next ? 'Next permanent HP' : 'Final permanent HP'}</dt>
            <dd className="font-bold">+{next?.hp ?? current.hp}</dd>
          </div>
          <div>
            <dt>Promotion condition</dt>
            <dd className="font-bold">{next ? 'Battle victory' : 'Completed'}</dd>
          </div>
        </dl>
        <ol aria-label="Sannin title path" className="flex justify-center gap-[4px]">
          {rankBonuses.map((_, i) => (
            <li
              key={i}
              aria-current={i === rank ? 'step' : undefined}
              className={`grid size-[22px] place-items-center rounded-full text-[10px] font-bold ${
                i < rank
                  ? 'bg-[#2e8b00] text-white'
                  : i === rank
                    ? 'bg-[#e0892c] text-white'
                    : i === rank + 1
                      ? 'bg-[#ffe27a]'
                      : 'bg-black/20'
              }`}
            >
              {i}
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-[8px]">
          <p role="status" className="flex-1">
            {notice || reason}
          </p>
          <GameButton
            className="h-[30px] w-[165px]"
            title={reason}
            disabled={!canPromote || busy}
            onClick={onPromote}
          >
            {next ? 'Promotion Battle' : 'Maximum Rank'}
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}
