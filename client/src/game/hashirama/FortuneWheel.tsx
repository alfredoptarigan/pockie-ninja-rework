// Reborn's Fortune Wheel (main.js `fj`), opened from the Hashirama battle panel. Left: the wheel
// (8 slices coloured by rarity, the grand prize and "?" mystery slices; the top pointer marks the
// win), SPIN / BONUS in the hub, the gold spin, Random set / Shuffle / Reset, the bonus spin
// progress and the last reward. Right: the grand prize, your 3 prizes, the reward pools with search,
// and the rules. A spin turns the wheel for 4.2 s (at once with reduced motion), then the result.
// ponytail: Reborn's admin reward editor and its Repeat button (a second SPIN) are left out.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  FortuneRarity,
  FortuneResult,
  FortuneReward,
  FortuneSpinResult,
  FortuneWheelView,
} from '../../../../shared/src/schemas/hashirama'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { itemNameKey } from '../world'

const PATH = '/api/game/hashirama/wheel'
const wheelKey = ['game', 'hashirama', 'wheel'] as const
const SPIN_MS = 4200
const SIZE = 300
const RARITY_COLOR: Record<FortuneRarity, string> = {
  common: '#9e9e9e',
  uncommon: '#4caf50',
  rare: '#2196f3',
  epic: '#9c27b0',
  legendary: '#ff9800',
}
const MYSTERY_COLOR = '#e8d59b'

export function rewardName(reward: FortuneReward) {
  if (reward.kind === 'spins') return `${reward.amount} free spins`
  if (reward.kind === 'bankaiCoins') return `${reward.amount} Bankai Coins`
  const name = plainText(itemNameKey(reward.itemId!), 'Unknown item')
  return reward.amount > 1 ? `${name} x${reward.amount}` : name
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Reborn's landing angle: 5 more turns, the winning slice's middle under the top pointer. */
const landingAngle = (current: number, index: number, count: number, turns: number) =>
  current + 360 * turns + ((360 - (index + 0.5) * (360 / count) - (current % 360) + 360) % 360)

function RewardIcon({
  reward,
  className = 'size-8',
}: {
  reward: FortuneReward
  className?: string
}) {
  if (reward.itemId)
    return <ItemIcon itemId={reward.itemId} name={rewardName(reward)} className={className} />
  return (
    <span
      className={`grid place-items-center rounded bg-[#2c2140] text-[10px] font-bold text-[#ffd700] ${className}`}
    >
      {reward.kind === 'spins' ? `+${reward.amount}` : 'BC'}
    </span>
  )
}

export function FortuneWheelWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const wheel = useQuery({ queryKey: wheelKey, queryFn: () => api<FortuneWheelView>(PATH) })
  const [angle, setAngle] = useState(0)
  const [duration, setDuration] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [shown, setShown] = useState<FortuneResult | null>(null)
  const [pool, setPool] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const configure = useMutation({
    mutationFn: (selection: (string | null)[]) =>
      api<{ wheel: FortuneWheelView }>(`${PATH}/configure`, {
        method: 'POST',
        body: { selection },
      }),
    onSuccess: ({ wheel: next }) => {
      queryClient.setQueryData(wheelKey, next)
      setError('')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const spin = useMutation({
    mutationFn: (body: { token: number; payWith?: 'gold' }) =>
      api<FortuneSpinResult>(`${PATH}/spin`, { method: 'POST', body }),
    onSuccess: (data) => {
      const reduced = reducedMotion()
      setError('')
      setAngle((current) =>
        landingAngle(
          current,
          data.result.winningIndex,
          data.wheel.segments.length,
          reduced ? 0 : 5,
        ),
      )
      setDuration(reduced ? 0 : SPIN_MS)
      setSpinning(true)
      window.setTimeout(
        () => {
          queryClient.setQueryData(wheelKey, data.wheel)
          apply(data)
          setSpinning(false)
          setShown(data.result)
        },
        reduced ? 0 : SPIN_MS + 80,
      )
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const data = wheel.data
  const busy = spinning || spin.isPending || configure.isPending
  return (
    <Dialog title="Fortune Wheel" onClose={onClose} className="w-[760px]">
      {wheel.isPending && <p>Loading the reward pool...</p>}
      {wheel.error && <Notice tone="error">{errorMessage(wheel.error)}</Notice>}
      {data && (
        <Body
          data={data}
          angle={angle}
          duration={duration}
          spinning={spinning}
          busy={busy}
          pool={pool ?? data.pools[0]?.id ?? ''}
          query={query}
          error={error}
          onPool={setPool}
          onQuery={setQuery}
          onSelect={(selection) => !busy && configure.mutate(selection)}
          onSpin={(payWith) => {
            if (busy) return
            if (data.selection.some((id) => id === null))
              return setError('Choose three different rewards before spinning.')
            spin.mutate(
              payWith ? { token: data.nextSpinToken, payWith } : { token: data.nextSpinToken },
            )
          }}
        />
      )}
      {shown && <ResultOverlay result={shown} onClose={() => setShown(null)} />}
    </Dialog>
  )
}

function Body({
  data,
  angle,
  duration,
  spinning,
  busy,
  pool,
  query,
  error,
  onPool,
  onQuery,
  onSelect,
  onSpin,
}: {
  data: FortuneWheelView
  angle: number
  duration: number
  spinning: boolean
  busy: boolean
  pool: string
  query: string
  error: string
  onPool: (id: string) => void
  onQuery: (text: string) => void
  onSelect: (selection: (string | null)[]) => void
  onSpin: (payWith?: 'gold') => void
}) {
  const all = data.pools.flatMap((p) => p.rewards)
  const unique = new Set(
    data.pools.filter((p) => p.unique).flatMap((p) => p.rewards.map((r) => r.id)),
  )
  const chosen = data.selection.map((id) => all.find((r) => r.id === id) ?? null)
  const count = chosen.filter(Boolean).length
  const canSpin = data.open && (data.bonusReady || data.freeSpins > 0)
  const grand = data.segments.find((s) => s.kind === 'grand')?.reward
  const current = data.pools.find((p) => p.id === pool) ?? data.pools[0]
  const atLimit = (r: FortuneReward) => Boolean(r.limit && r.limit.won >= r.limit.max)

  const add = (reward: FortuneReward) => {
    if (data.selection.includes(reward.id)) return
    const slot = data.selection.indexOf(null)
    if (slot < 0) return
    onSelect(data.selection.map((id, i) => (i === slot ? reward.id : id)))
  }
  const randomSet = () => {
    const ids = all.filter((r) => !atLimit(r)).map((r) => r.id)
    const picked: string[] = []
    let hasUnique = false
    for (const id of [...ids].sort(() => Math.random() - 0.5)) {
      if (picked.length === 3) break
      if (unique.has(id)) {
        if (hasUnique) continue
        hasUnique = true
      }
      picked.push(id)
    }
    onSelect([picked[0] ?? null, picked[1] ?? null, picked[2] ?? null])
  }
  const shuffle = () => onSelect([...data.selection].sort(() => Math.random() - 0.5))

  const slices = data.segments.length
  const gradient = data.segments
    .map((s, i) => {
      const color =
        s.kind === 'mystery' ? MYSTERY_COLOR : s.reward ? RARITY_COLOR[s.reward.rarity] : '#555'
      return `${color} ${(i * 360) / slices}deg ${((i + 1) * 360) / slices}deg`
    })
    .join(', ')
  const status = spinning
    ? 'Spinning...'
    : busy
      ? 'Saving your prizes...'
      : data.bonusReady
        ? 'Your free bonus spin is ready!'
        : data.freeSpins > 0
          ? `You have ${data.freeSpins} spins (won in battles, events and on the wheel)`
          : 'No spins left. Win more in battle and in events.'

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <header className="flex items-end justify-between">
        <div>
          <h3 className="text-[16px] font-bold">Choose your fortune</h3>
          <p>Choose three prizes. Spin the wheel. Keep what you win.</p>
        </div>
        <p className="text-right">
          Your spins <b className="text-[16px]">{data.freeSpins}</b>
          <br />
          <span className="text-[11px]">Real rewards, delivered to your bag</span>
        </p>
      </header>
      {!data.open && <Notice tone="error">Hashirama vs Madara is not open right now.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-3">
        <section aria-label="Wheel" className="flex w-[320px] flex-col items-center gap-2">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <span
              aria-hidden="true"
              className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-[#b3122a]"
            />
            <div
              data-testid="fortune-wheel"
              className="pointer-events-none relative size-full rounded-full border-4 border-[#4b2f0a]"
              style={{
                background: `conic-gradient(${gradient})`,
                transform: `rotate(${angle}deg)`,
                transition: `transform ${duration}ms cubic-bezier(.17,.67,.2,1)`,
              }}
            >
              {data.segments.map((s, i) => {
                const mid = ((i + 0.5) * 360) / slices
                return (
                  <span
                    key={i}
                    className="absolute top-1/2 left-1/2"
                    style={{
                      transform: `rotate(${mid}deg) translateY(-${SIZE * 0.36}px) rotate(${-mid}deg)`,
                    }}
                  >
                    <span className="block -translate-1/2">
                      {s.kind === 'mystery' || !s.reward ? (
                        <b className="text-[20px] text-[#4b2f0a]">
                          {s.kind === 'mystery' ? '?' : ''}
                        </b>
                      ) : (
                        <RewardIcon reward={s.reward} className="size-9" />
                      )}
                    </span>
                  </span>
                )
              })}
            </div>
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <GameButton
                className="pointer-events-auto size-[64px] rounded-full text-[13px] font-bold"
                disabled={busy || !canSpin || count < 3}
                onClick={() => onSpin()}
              >
                {spinning ? '...' : data.bonusReady ? 'BONUS' : 'SPIN'}
              </GameButton>
            </div>
          </div>
          <p role="status">{status}</p>
          {data.open && (
            <div className="flex items-center gap-2">
              <GameButton
                className="h-[27px] w-[150px]"
                disabled={busy || count < 3}
                onClick={() => onSpin('gold')}
              >
                Spin for {data.goldSpinCost} gold
              </GameButton>
            </div>
          )}
          <div className="flex gap-1">
            <GameButton small disabled={busy || all.length < 3} onClick={randomSet}>
              Random set
            </GameButton>
            <GameButton small disabled={busy || count < 2} onClick={shuffle}>
              Shuffle
            </GameButton>
            <GameButton small disabled={busy} onClick={() => onSelect([null, null, null])}>
              Reset
            </GameButton>
          </div>
          <div className="w-full">
            <p className="font-bold">
              BONUS SPIN {data.paidSpins}/{data.bonusEvery}
            </p>
            <div
              role="progressbar"
              aria-label="Bonus spin progress"
              aria-valuemin={0}
              aria-valuemax={data.bonusEvery}
              aria-valuenow={data.paidSpins}
              className="h-[8px] w-full rounded bg-black/20"
            >
              <div
                className="h-full rounded bg-[#ffd700]"
                style={{ width: `${(data.paidSpins / data.bonusEvery) * 100}%` }}
              />
            </div>
            <p className="text-[11px]">Every {data.bonusEvery} paid spins earns a free spin.</p>
          </div>
          <p className="text-[11px]">
            {data.lastResult
              ? `Last reward: ${rewardName(data.lastResult.reward)}`
              : 'The top pointer marks the winning slice.'}
          </p>
        </section>
        <section aria-label="Your prizes" className="flex flex-1 flex-col gap-2">
          {grand && (
            <div className="flex items-center gap-2 rounded border border-[#ff9800] bg-[#fff6d6] p-1.5">
              <RewardIcon reward={grand} />
              <div>
                <p className="text-[10px] font-bold text-[#b36b00]">GRAND PRIZE</p>
                <p>{rewardName(grand)}</p>
              </div>
            </div>
          )}
          <p className="font-bold">Your prizes {count}/3</p>
          <ul className="flex gap-1.5">
            {chosen.map((reward, i) => (
              <li
                key={i}
                className="relative flex h-[64px] flex-1 flex-col items-center justify-center rounded border border-[#4b2f0a55] bg-white/40 p-1 text-center text-[10px]"
              >
                {reward ? (
                  <>
                    <RewardIcon reward={reward} />
                    <span className="line-clamp-2">{rewardName(reward)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${rewardName(reward)}`}
                      disabled={busy}
                      className="absolute top-0 right-1 font-bold"
                      onClick={() => onSelect(data.selection.map((id, j) => (j === i ? null : id)))}
                    >
                      x
                    </button>
                  </>
                ) : (
                  <span>Choose a reward</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px]">Choose a reward below. Click a slot above to replace it.</p>
          <div role="tablist" aria-label="Reward pools" className="flex gap-1">
            {data.pools.map((p) => (
              <GameButton
                key={p.id}
                small
                role="tab"
                aria-selected={p.id === current?.id}
                className={p.id === current?.id ? 'brightness-125' : ''}
                onClick={() => onPool(p.id)}
              >
                {p.label}
              </GameButton>
            ))}
          </div>
          {current?.unique && (
            <p className="text-[11px]">Unique: only one of these can be on your wheel at a time.</p>
          )}
          <input
            type="search"
            aria-label="Search this reward pool"
            placeholder="Search this reward pool..."
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            className="rounded border border-[#4b2f0a55] bg-white px-1.5 py-0.5"
          />
          <ul className="grid max-h-[180px] grid-cols-3 gap-1 overflow-auto">
            {(current?.rewards ?? [])
              .filter((r) => rewardName(r).toLowerCase().includes(query.trim().toLowerCase()))
              .map((reward) => (
                <li key={reward.id}>
                  <button
                    type="button"
                    aria-label={`Choose ${rewardName(reward)}`}
                    disabled={busy || atLimit(reward) || data.selection.includes(reward.id)}
                    onClick={() => add(reward)}
                    className="flex w-full items-center gap-1 rounded border bg-white/50 p-1 text-left text-[10px] disabled:opacity-50"
                    style={{ borderColor: RARITY_COLOR[reward.rarity] }}
                  >
                    <RewardIcon reward={reward} className="size-7" />
                    <span className="flex flex-col">
                      <span className="line-clamp-2">{rewardName(reward)}</span>
                      <span style={{ color: RARITY_COLOR[reward.rarity] }}>{reward.rarity}</span>
                      {reward.limit && (
                        <span>
                          Won {reward.limit.won}/{reward.limit.max}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <details className="text-[11px]">
            <summary className="cursor-pointer font-bold">
              Mystery rewards &amp; wheel rules
            </summary>
            <p>
              The three chosen prizes and the grand prize are possible wins, not guaranteed rewards.
              Chances are shown above; equal-sized slices do not mean equal odds.
            </p>
            <ul className="list-disc pl-4">
              {data.segments.map((s, i) => (
                <li key={i}>
                  {s.kind === 'mystery'
                    ? 'Mystery'
                    : s.kind === 'grand'
                      ? 'Grand prize'
                      : s.reward
                        ? rewardName(s.reward)
                        : 'Empty'}
                  : {s.chance.toFixed(2)}%
                </li>
              ))}
            </ul>
            <p>Each question-mark slice awards one reward from this mystery pool:</p>
            <p>{data.mysteryPool.map(rewardName).join(', ')}</p>
            <p>
              Rewards are not bound, so you can trade them. You need room in your bag before
              spinning. Closing the window does not cancel an accepted spin.
            </p>
          </details>
        </section>
      </div>
    </div>
  )
}

function ResultOverlay({ result, onClose }: { result: FortuneResult; onClose: () => void }) {
  const { reward } = result
  return (
    <div
      role="dialog"
      aria-label="Congratulations!"
      className="absolute inset-0 z-20 grid place-items-center bg-black/60"
    >
      <div className="game-panel-1 flex w-[300px] flex-col items-center gap-2 rounded p-4 text-center text-[#4b2f0a]">
        <p className="text-[11px] font-bold tracking-[.1em]">
          {result.bonus ? 'BONUS REWARD' : 'REWARD RECEIVED'}
        </p>
        <h3 className="text-[18px] font-bold">Congratulations!</h3>
        <RewardIcon reward={reward} className="size-12" />
        <p className="font-bold">{rewardName(reward)}</p>
        <p className="text-[12px]">
          {reward.kind === 'spins'
            ? `${reward.amount} free spins added to your wheel.`
            : reward.kind === 'bankaiCoins'
              ? `${reward.amount} Bankai Coins added. Spend them in Bankai > Get Crystal.`
              : 'Added to your bag. Not bound: you can trade it.'}
        </p>
        <GameButton className="h-[26px] w-[100px]" autoFocus onClick={onClose}>
          Continue
        </GameButton>
      </div>
    </div>
  )
}
