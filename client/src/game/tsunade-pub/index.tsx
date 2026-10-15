// Tsunade Pub (Reborn chunk 221 `TsunadePub`, reborn-lazy-features.md): a 660x495 window. Left,
// the Prize Roulette (16 slots, the centre prize, Quick Spin, the bonus counters, FREE / REWARD
// SPINS / PAID, Spin and Buy 10g); right, the unclaimed prizes. The server rolls every spin; the
// highlight then steps 3 laps plus the winning index, slowing down, and the next wheel replaces it.
// ponytail: the centre's reveal / glow and the legendary shimmer are left out (epic and
// legendary slots pulse).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  TSUNADE_PUB_RULES as RULES,
  type PubActionResult,
  type PubPrizeView,
  type PubSpinResult,
  type TsunadePubView,
} from '../../../../shared/src/schemas/tsunade-pub'
import { api } from '../../lib/api'
import { bigBg } from '../bloodlines/panels'
import { errorMessage, useApplyResult } from '../api'
import { ItemTooltip } from '../ItemTooltip'
import { asInventoryItem } from '../market/parts'
import { Dialog, GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import { Prizes } from './prizes'
import { prizeName, Wheel } from './wheel'

export const tsunadePubKey = ['game', 'tsunade-pub'] as const
const PATH = '/api/game/tsunade-pub'
const LAPS = 3
/** Reborn's step delay: 25 + 475 (k / steps)^3 ms, divided by 3 (normal) or 5 (quick). */
const stepDelay = (k: number, steps: number, quick: boolean) =>
  (25 + 475 * (k / steps) ** 3) / (quick ? 5 : 3)
/** How long the landed wheel stays before the next one. */
const holdMs = (quick: boolean) => (quick ? 600 : 1500)

type Tip = { prize: PubPrizeView; at: { x: number; y: number } } | null

const fail = (error: unknown) => showToast(errorMessage(error), 'failure')

/** Stores the pub view a result carries and applies its character (refetching the bag). */
function useSettle() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return (result: { pub: TsunadePubView; character: PubActionResult['character'] }) => {
    queryClient.setQueryData(tsunadePubKey, result.pub)
    apply(result)
  }
}

function usePubAction(path: 'buy' | 'collect' | 'sell') {
  const settle = useSettle()
  return useMutation({
    mutationFn: (body?: object) =>
      api<PubActionResult>(`${PATH}/${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: settle,
    onError: fail,
  })
}

export function TsunadePubWindow({ onClose }: { onClose: () => void }) {
  const view = useQuery({ queryKey: tsunadePubKey, queryFn: () => api<TsunadePubView>(PATH) })
  const [quick, setQuick] = useState(false)
  const [guide, setGuide] = useState(false)
  // While a spin plays: the wheel it landed on, the highlighted slot and the prize in the centre.
  const [landed, setLanded] = useState<PubPrizeView[] | null>(null)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [center, setCenter] = useState<PubPrizeView | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [tip, setTip] = useState<Tip>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const settle = useSettle()

  const play = (result: PubSpinResult) => {
    const steps = LAPS * RULES.boardSlots + result.winningIndex + 1
    const at = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms))
    setLanded(result.currentBoard)
    setCenter(null)
    let elapsed = 0
    for (let k = 1; k <= steps; k++) {
      elapsed += stepDelay(k, steps, quick)
      at(elapsed, () => setHighlight((k - 1) % RULES.boardSlots))
    }
    at(elapsed, () => {
      setCenter(result.prize)
      settle(result)
      if (result.extra)
        showToast(`Valhalla gear: you also won ${prizeName(result.extra)}.`, 'success')
    })
    at(elapsed + holdMs(quick), () => {
      setLanded(null)
      setHighlight(null)
      setSpinning(false)
    })
  }

  const spin = useMutation({
    mutationFn: () => api<PubSpinResult>(`${PATH}/spin`, { method: 'POST' }),
    onMutate: () => {
      setSpinning(true)
      setHighlight(null)
    },
    onSuccess: play,
    onError: (error) => {
      setSpinning(false)
      fail(error)
    },
  })
  const buy = usePubAction('buy')
  const collect = usePubAction('collect')
  const sell = usePubAction('sell')

  const data = view.data
  const spins = data ? data.freeAttempts + data.rewardAttempts + data.paidAttempts : 0
  const busy = spinning || buy.isPending || collect.isPending || sell.isPending
  return (
    <Dialog title="Tsunade Pub" onClose={onClose} className="game-window-bare w-[670px]">
      <div
        className="game-panel-1 relative font-game text-[#333]"
        style={{ width: 660, height: 495 }}
      >
        {view.isPending && <p className="p-4">Loading the pub...</p>}
        {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
        {data && (
          <>
            <GameButton
              className="!absolute top-[12px] left-[605px] z-[2] h-[22px] w-[40px] !min-w-0 !px-0 text-[10px] text-white"
              onClick={() => setGuide(true)}
            >
              Info
            </GameButton>
            <section
              aria-label="Prize Roulette"
              className="absolute top-[10px] left-[10px] flex flex-col gap-[8px] p-[8px]"
              style={{ ...bigBg(3), width: 320, height: 475 }}
            >
              <h3 className="text-[12px] font-bold">Prize Roulette</h3>
              <Wheel
                board={landed ?? data.board}
                highlight={highlight}
                center={center}
                onTip={(prize, at) => setTip(prize && at ? { prize, at } : null)}
              />
              <Controls
                view={data}
                quick={quick}
                onQuick={setQuick}
                canSpin={!busy && spins > 0}
                spinning={spinning}
                onSpin={() => spin.mutate()}
                onBuy={() => buy.mutate(undefined)}
                buying={busy}
              />
            </section>
            <section
              aria-label="Unclaimed Prizes"
              className="absolute top-[10px] left-[340px] p-[8px]"
              style={{ ...bigBg(3), width: 310, height: 475 }}
            >
              <Prizes
                won={data.won}
                busy={busy}
                onCollect={(index) => collect.mutate(index === undefined ? {} : { index })}
                onSell={(indexes) => sell.mutate({ indexes })}
                onTip={(prize, at) => setTip(prize && at ? { prize, at } : null)}
              />
            </section>
            {guide && <Guide onClose={() => setGuide(false)} />}
            {tip && (
              <ItemTooltip
                entry={{
                  item: asInventoryItem({
                    ...tip.prize,
                    count: tip.prize.amount,
                    bound: tip.prize.bound ?? true,
                  }),
                }}
                at={tip.at}
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}

const COUNTERS = [
  ['FREE', '#228822', 'freeAttempts'],
  ['REWARD SPINS', '#3366cc', 'rewardAttempts'],
  ['PAID', '#cc8800', 'paidAttempts'],
] as const

function Controls({
  view,
  quick,
  onQuick,
  canSpin,
  spinning,
  onSpin,
  onBuy,
  buying,
}: {
  view: TsunadePubView
  quick: boolean
  onQuick: (quick: boolean) => void
  canSpin: boolean
  spinning: boolean
  onSpin: () => void
  onBuy: () => void
  buying: boolean
}) {
  return (
    <div className="flex flex-col gap-[6px] rounded-[4px] border border-[#c4a870] bg-linear-to-b from-[#f5ecd2] to-[#e2d2a6] p-[6px] text-[11px]">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={quick} onChange={(e) => onQuick(e.target.checked)} />
          Quick Spin
        </label>
        <span>
          Bonus in {view.rollsUntilBonus} · Special in {view.rollsUntilGuaranteed}
        </span>
      </div>
      <dl className="grid grid-cols-3 text-center">
        {COUNTERS.map(([label, color, key]) => (
          <div key={key}>
            <dt className="text-[9px] font-bold" style={{ color }}>
              {label}
            </dt>
            <dd className="text-[14px] font-bold" style={{ color }}>
              {view[key]}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex justify-center gap-[8px]">
        <GameButton className="h-[28px] w-[80px]" disabled={!canSpin} onClick={onSpin}>
          {spinning ? '...' : 'Spin'}
        </GameButton>
        <GameButton className="h-[28px] w-[90px]" disabled={buying} onClick={onBuy}>
          Buy {RULES.spinCost}g
        </GameButton>
      </div>
    </div>
  )
}

/** Reborn's guide overlay, with our UTC reset. */
function Guide({ onClose }: { onClose: () => void }) {
  const tiers = [
    ['Common', '~60%', 'HP/MP Potions, Stone Bags, Grey Outfits'],
    ['Uncommon', '~25%', 'EXP Bags, EXP Seals, Medal Bags, Blue Outfits'],
    ['Rare', '~12%', 'Gems, Card Packs, Outfit Pots, Orange Outfits'],
    ['Epic', '~2-3%', 'Large Bags, GC Bags, Recast Talismans, Pets, Legend Pot'],
    [
      'Legendary',
      `Guaranteed @${RULES.guaranteedEvery}`,
      'Enhanced Pets, +27 Outfits, Wings, High End Reward',
    ],
  ]
  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center bg-black/70"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-label="Tsunade's Pub Guide"
        className="game-frame w-[480px] bg-black/90 p-4 text-[12px] leading-[1.6] text-white"
      >
        <h3 className="text-[16px] font-bold text-[#ff9900]">Tsunade&apos;s Pub Guide</h3>
        <p>
          Spin the roulette to win prizes! The wheel highlights each slot and lands on a random
          prize.
        </p>
        <h4 className="mt-2 font-bold text-[#ffd700]">Cost</h4>
        <ul className="list-disc pl-5">
          <li>{RULES.freeSpinsPerDay} Free spins per day (resets at midnight UTC)</li>
          <li>Additional spins cost {RULES.spinCost} Gold each</li>
          <li>
            Prizes from all spins, including free and bonus spins, have a {RULES.unboundChance}%
            chance to be unbound
          </li>
        </ul>
        <h4 className="mt-2 font-bold text-[#ffd700]">Prize Chances</h4>
        <table className="w-full text-left">
          <tbody>
            {tiers.map(([tier, chance, examples]) => (
              <tr key={tier}>
                <th className="pr-2 font-bold">{tier}</th>
                <td className="pr-2">{chance}</td>
                <td>{examples}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4 className="mt-2 font-bold text-[#ffd700]">Special Mechanics</h4>
        <ul className="list-disc pl-5">
          <li>
            Bonus Roll: every {RULES.bonusEvery} spins you get a bonus chance for better prizes
          </li>
          <li>
            Guaranteed Legendary: at {RULES.guaranteedEvery} total spins you&apos;re guaranteed a
            legendary prize
          </li>
          <li>
            Valhalla Gear: {RULES.valhallaChance}% chance per spin to also receive level-appropriate
            gear with bonus stats
          </li>
        </ul>
        <h4 className="mt-2 font-bold text-[#ffd700]">Won Prizes</h4>
        <ul className="list-disc pl-5">
          <li>
            Prizes go to the Unclaimed Prizes panel; click or right-click to Collect, or Collect All
          </li>
          <li>Quick Mode: tick the checkbox to speed up the spin animation</li>
        </ul>
        <div className="mt-3 flex justify-center">
          <GameButton className="h-[26px] w-[80px]" onClick={onClose}>
            Close
          </GameButton>
        </div>
      </section>
    </div>
  )
}
