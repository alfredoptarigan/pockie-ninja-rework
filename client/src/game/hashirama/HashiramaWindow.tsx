// Valley of the End: Hashirama vs Madara (Reborn scene 9500, main.js `Fj`), as a 1200x675 window
// over Reborn's valley: the title with the battle (or spending) timer, Leave, both leaders on their
// statues, the clash meter (Madara's share of the damage from the left), each side's top damage
// board (282x172, 5 a page) and the battle panel (420x168): choose a side for good, attack the
// other leader (Auto Fight keeps attacking after each fight), the result and the Fortune Wheel.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type {
  HashiramaAttackResult,
  HashiramaRow,
  HashiramaSide,
  HashiramaView,
} from '../../../../shared/src/schemas/hashirama'
import { api, ApiError } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { useNow } from '../events/timer'
import { ResultWindow } from '../FightSummary'
import { Dialog, GameButton, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import { showToast } from '../toast'
import type { Replay } from '../types'
import { FortuneWheelWindow } from './FortuneWheel'

type Attack = HashiramaAttackResult<Replay>
export const hashiramaKey = ['game', 'hashirama'] as const
export const HASHIRAMA_PATH = '/api/game/hashirama'
const WIDTH = 1200
const HEIGHT = 675
/** Reborn lays the scene out in 1920-wide units. */
const U = WIDTH / 1920
const BACKGROUND = '/assets/reborn/features/hashirama/background.webp'
const POLL_MS = 15_000
/** Reborn waits 400 ms after a fight before Auto Fight attacks again. */
const AUTO_DELAY_MS = 400
const COLORS: Record<HashiramaSide, string> = { madara: '#a3241a', hashirama: '#1f5aa8' }
const SIDE_NAME: Record<HashiramaSide, string> = { madara: 'Madara', hashirama: 'Hashirama' }
const OUTFIT: Record<HashiramaSide, string> = {
  madara: 'Madara Uchiha outfit',
  hashirama: 'Hashirama Senju outfit',
}
/** Leaders' feet (Reborn `Oj`), their pose (our stand-in for Hashirama) and facing. */
const LEADERS: Record<HashiramaSide, { x: number; y: number; pose: number; flip: boolean }> = {
  madara: { x: 395, y: 784, pose: 170, flip: true },
  hashirama: { x: 1497, y: 811, pose: 50, flip: false },
}
const opponent = (side: HashiramaSide): HashiramaSide =>
  side === 'madara' ? 'hashirama' : 'madara'
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Reborn's `Dj`: milliseconds as H:MM:SS. */
export function hmmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function HashiramaWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const now = useNow()
  const view = useQuery({
    queryKey: hashiramaKey,
    queryFn: () => api<HashiramaView>(HASHIRAMA_PATH),
    refetchInterval: POLL_MS,
  })
  const [autoWanted, setAuto] = useState(false)
  const [playing, setPlaying] = useState<Attack | null>(null)
  const [result, setResult] = useState<Attack | null>(null)
  const [wheel, setWheel] = useState(false)
  const join = useMutation({
    mutationFn: (side: HashiramaSide) =>
      api<{ hashirama: HashiramaView }>(`${HASHIRAMA_PATH}/join`, {
        method: 'POST',
        body: { side },
      }),
    onSuccess: ({ hashirama }) => queryClient.setQueryData(hashiramaKey, hashirama),
    onError: (error) => showToast(errorMessage(error), 'failure'),
  })
  const retry = useRef<number | undefined>(undefined)
  const attack = useMutation({
    mutationFn: () => api<Attack>(`${HASHIRAMA_PATH}/attack`, { method: 'POST' }),
    onSuccess: setPlaying,
    onError: (error) => {
      const wait = error instanceof ApiError ? Number(error.fields.retryInMs) : NaN
      if (wait > 0 && auto) {
        retry.current = window.setTimeout(() => attack.mutate(), wait)
        return
      }
      if (!(wait > 0)) setAuto(false)
      showToast(errorMessage(error), wait > 0 ? 'info' : 'failure')
    },
  })
  const data = view.data
  const event = data?.event ?? null
  const running = Boolean(event?.running && Date.parse(event.endsAt) > now)
  // Auto Fight stops by itself when the battle ends.
  const auto = autoWanted && running

  // Auto Fight: attack again after each fight, once the cooldown allows.
  const { mutate } = attack
  const ready = auto && running && !playing && !result && !attack.isPending && Boolean(data?.me)
  const waitMs = data?.retryInMs ?? 0
  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => mutate(), Math.max(AUTO_DELAY_MS, waitMs))
    return () => window.clearTimeout(timer)
  }, [ready, waitMs, mutate])
  useEffect(() => () => window.clearTimeout(retry.current), [])
  // Reborn leaves the valley when the event closes.
  const closed = event?.phase === 'closed' || (event && Date.parse(event.closesAt) <= now)
  useEffect(() => {
    if (!closed) return
    showToast('Hashirama vs Madara has ended. The Valley of the End is closed.', 'info')
    onClose()
  }, [closed, onClose])

  if (playing)
    return (
      <BattleReplayMount
        replay={playing.replay}
        clothing={character.clothing}
        monsterIds={[]}
        defenderLooks={[playing.look]}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(hashiramaKey, playing.hashirama)
          apply(playing)
          if (auto) showToast(`You dealt ${fmt(playing.damage)} damage.`, 'info')
          else setResult(playing)
          setPlaying(null)
        }}
      />
    )
  return (
    <>
      <Dialog
        title="Valley of the End: Hashirama vs Madara"
        onClose={onClose}
        className="game-window-bare w-[1210px]"
      >
        <section
          aria-label="Valley of the End: Hashirama vs Madara"
          className="relative overflow-hidden font-[Arial,sans-serif] text-[#f4f1f8]"
          style={{ width: WIDTH, height: HEIGHT, background: `url(${BACKGROUND}) center / cover` }}
        >
          <header
            className="absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap [text-shadow:0_0_12px_#000,0_2px_4px_#000]"
            style={{ top: 118 * U }}
          >
            <h3
              className="m-0 tracking-[.08em] text-[#fff6ea] uppercase"
              style={{
                fontSize: 30 * U,
                textShadow: '-2px 0 9px #ff3b1fcc, 2px 0 9px #2a9dffcc, 0 2px 4px #000',
              }}
            >
              Valley of the End: Hashirama vs Madara
            </h3>
            {event && running && (
              <span className="mt-1 inline-block rounded-full border border-white/20 bg-[#07080fcc] px-3 py-0.5 text-[13px] tabular-nums">
                Ends in {hmmss(Date.parse(event.endsAt) - now)}
              </span>
            )}
            {event && !running && event.finished && (
              <span className="mt-1 inline-block rounded-full border border-white/20 bg-[#07080fcc] px-3 py-0.5 text-[13px] tabular-nums">
                Spend your spins · closes in {hmmss(Date.parse(event.closesAt) - now)}
              </span>
            )}
          </header>
          <GameButton
            className="!absolute top-[26px] right-[19px] h-[26px] w-[80px]"
            onClick={onClose}
          >
            Leave
          </GameButton>
          {(['madara', 'hashirama'] as const).map((side) => (
            <Leader key={side} side={side} mine={data?.me?.side === side} />
          ))}
          {data && <Clash totals={data.totals} idle={!running} />}
          {data &&
            (['madara', 'hashirama'] as const).map((side) => (
              <Board key={side} side={side} rows={data.leaderboards[side]} />
            ))}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ bottom: 36 * U }}
            aria-live="polite"
          >
            <section
              aria-label="Battle"
              className="game-panel-1 flex w-[420px] flex-col items-center gap-1 rounded p-2 text-center text-[12px] leading-[1.35] text-[#4b2f0a]"
            >
              {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
              <BattlePanel
                view={data}
                running={running}
                busy={join.isPending || attack.isPending}
                auto={auto}
                onJoin={(side) => join.mutate(side)}
                onAttack={() => attack.mutate()}
                onAuto={(on) => {
                  setAuto(on)
                  window.clearTimeout(retry.current)
                }}
              />
              <div className="mt-1 flex w-full flex-col items-center gap-[3px] border-t border-[#4b2f0a33] pt-[5px]">
                <GameButton className="h-[26px] w-[220px]" onClick={() => setWheel(true)}>
                  Fortune Wheel ({data?.freeSpins ?? 0} free spins)
                </GameButton>
                {data && !(event && !running && event.finished) && (
                  <p className="text-[11px] opacity-85">
                    Winning side: {data.rewards.winnerSpins} spins each · Top 3 of each side: +
                    {data.rewards.topSpins[0]} / +{data.rewards.topSpins[1]} / +
                    {data.rewards.topSpins[2]}
                  </p>
                )}
              </div>
            </section>
          </div>
        </section>
      </Dialog>
      {result && (
        <ResultWindow
          title="Battle report"
          story={`You dealt ${fmt(result.damage)} damage to ${
            result.replay.fighters.find((f) => f.side === 'defenders')?.name ?? 'the leader'
          }.`}
          note={
            result.hashirama.me
              ? `Your damage: ${fmt(result.hashirama.me.damage)}${result.hashirama.me.rank ? ` · Rank #${result.hashirama.me.rank}` : ''}`
              : undefined
          }
          columns={[]}
          findTitle="Rewards"
          finds={[]}
          emptyFind="Spins are paid when the battle ends."
          onClose={() => setResult(null)}
        />
      )}
      {wheel && (
        <FortuneWheelWindow
          onClose={() => {
            setWheel(false)
            void queryClient.invalidateQueries({ queryKey: hashiramaKey })
          }}
        />
      )}
    </>
  )
}

function Leader({ side, mine }: { side: HashiramaSide; mine: boolean }) {
  const leader = LEADERS[side]
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: leader.x * U, top: leader.y * U }}
      aria-hidden="true"
    >
      <span
        className="absolute h-[20px] w-[88px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] motion-safe:animate-pulse"
        style={{
          background: `radial-gradient(ellipse, ${side === 'madara' ? '#ff4a1fcc' : '#2fa8ffcc'}, transparent 70%)`,
          opacity: mine ? 1 : 0.7,
        }}
      />
      <img
        src={`/assets/reborn/poses/${leader.pose}.webp`}
        alt=""
        className="absolute bottom-0 h-[150px] max-w-none -translate-x-1/2 drop-shadow-[0_4px_6px_rgba(0,0,0,0.8)]"
        style={leader.flip ? { transform: 'translateX(-50%) scaleX(-1)' } : undefined}
      />
    </div>
  )
}

/** Madara's share of the damage from the left (6-94%, 50 with none), Reborn's `_j`. */
function Clash({ totals, idle }: { totals: Record<HashiramaSide, number>; idle: boolean }) {
  const sum = totals.madara + totals.hashirama
  const point = sum <= 0 ? 50 : Math.min(94, Math.max(6, (totals.madara / sum) * 100))
  const share = Math.round(point)
  return (
    <div
      role="meter"
      aria-label={`Madara ${share}%, Hashirama ${100 - share}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={share}
      className="absolute left-1/2 h-[10px] -translate-x-1/2 rounded-full border border-black/50"
      style={{
        top: 228 * U,
        width: 1500 * U,
        background: `linear-gradient(90deg, ${COLORS.madara} ${point}%, ${COLORS.hashirama} ${point}%)`,
        opacity: idle ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 size-[22px] -translate-1/2 rounded-full bg-[radial-gradient(circle,#fff,#ffd27a_45%,#ff7a1f00_70%)]"
        style={{ left: `${point}%` }}
      />
      {idle && (
        <span className="absolute top-[22px] left-1/2 -translate-x-1/2 text-[13px] whitespace-nowrap text-[#e5e0ee] [text-shadow:0_0_8px_#000]">
          Waiting for the battle to begin
        </span>
      )}
    </div>
  )
}

const PER_PAGE = 5
const medal = (rank: number) => (rank <= 3 ? ['1st', '2nd', '3rd'][rank - 1]! : `#${rank}`)

/** "Top damage: side": rank, player, damage, 5 a page (Reborn `Rj`, 282x172). */
function Board({ side, rows }: { side: HashiramaSide; rows: HashiramaRow[] }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const shown = rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  return (
    <section
      aria-label={`Top damage: ${SIDE_NAME[side]}`}
      className="game-panel-1 absolute flex w-[282px] flex-col gap-[1px] rounded p-1 text-center text-[12px] text-[#4b2f0a]"
      style={{ top: 300 * U, [side === 'madara' ? 'left' : 'right']: 36 * U, height: 172 }}
    >
      <h4 className="font-bold" style={{ color: COLORS[side] }}>
        Top damage: {SIDE_NAME[side]}
      </h4>
      <div className="grid grid-cols-[40px_1fr_84px] gap-[2px] font-bold">
        <span>Rank</span>
        <span>Player</span>
        <span>Damage</span>
      </div>
      {rows.length === 0 ? (
        <p className="pt-6">No damage dealt yet.</p>
      ) : (
        <ol className="flex flex-col gap-[1px]">
          {shown.map((row, i) => {
            const rank = page * PER_PAGE + i + 1
            return (
              <li key={`${row.name}-${rank}`} className="grid grid-cols-[40px_1fr_84px] gap-[2px]">
                <span>{medal(rank)}</span>
                <span className={`truncate ${rank <= 3 ? 'font-bold' : ''}`}>{row.name}</span>
                <span className="font-bold text-[#b84c4c]">{fmt(row.damage)}</span>
              </li>
            )
          })}
        </ol>
      )}
      {pages > 1 && (
        <div className="mt-auto flex items-center justify-center gap-2">
          <GameButton small disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </GameButton>
          <span>
            {page + 1} / {pages}
          </span>
          <GameButton small disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </GameButton>
        </div>
      )}
    </section>
  )
}

function BattlePanel({
  view,
  running,
  busy,
  auto,
  onJoin,
  onAttack,
  onAuto,
}: {
  view: HashiramaView | undefined
  running: boolean
  busy: boolean
  auto: boolean
  onJoin: (side: HashiramaSide) => void
  onAttack: () => void
  onAuto: (on: boolean) => void
}) {
  const title = (text: string) => <h3 className="text-[14px] font-bold">{text}</h3>
  if (!view)
    return (
      <>
        {title('Valley of the End')}
        <p>Loading the battle...</p>
      </>
    )
  if (!view.eligible)
    return (
      <>
        {title('Valley of the End')}
        <p>Hashirama vs Madara is not open yet.</p>
      </>
    )
  const event = view.event
  if (!event)
    return (
      <>
        {title('Valley of the End')}
        <p>The Valley of the End is quiet. No battle is running.</p>
        <p className="text-[11px] opacity-85">
          An administrator starts a 48-hour battle; spins can be spent for 24 hours after it.
        </p>
      </>
    )
  if (!running && !event.finished)
    return (
      <>
        {title('Valley of the End')}
        <p>The battle is over. Counting the damage...</p>
      </>
    )
  if (!running) {
    const winner = event.winner
    return (
      <>
        {title('Valley of the End')}
        <p className="text-[14px] font-bold">
          {winner === 'tie'
            ? 'The battle ended in a tie: both sides win!'
            : winner === 'madara' || winner === 'hashirama'
              ? `${SIDE_NAME[winner]}'s side won the battle!`
              : 'The battle ended without any damage dealt.'}
        </p>
        {view.myPayout && view.myPayout.spins > 0 && (
          <p className="font-bold text-[#2a7a2a]">
            You earned {view.myPayout.spins} free Fortune Wheel spins.
          </p>
        )}
        <p className="text-[11px] opacity-85">
          Spend your Fortune Wheel spins before the event closes; unspent spins are lost.
        </p>
      </>
    )
  }
  const me = view.me
  if (!me)
    return (
      <>
        {title('Choose your side for this battle')}
        <p className="text-[11px] opacity-85">
          You fight for this side until the battle ends; you cannot switch.
        </p>
        <div className="my-0.5 flex justify-center gap-2.5">
          {(['madara', 'hashirama'] as const).map((side) => (
            <GameButton
              key={side}
              className="h-[30px] w-[160px]"
              disabled={busy}
              onClick={() => onJoin(side)}
            >
              Fight for {SIDE_NAME[side]}
            </GameButton>
          ))}
        </div>
      </>
    )
  return (
    <>
      {title(`You fight for ${SIDE_NAME[me.side]}`)}
      <p>
        Your damage: {fmt(me.damage)}
        {me.rank ? ` · Rank #${me.rank}` : ''}
      </p>
      <p className="text-[11px] opacity-85">
        Fortune Wheel grand prize: <b style={{ color: COLORS[me.side] }}>{OUTFIT[me.side]}</b>
      </p>
      <div className="my-0.5 flex items-center justify-center gap-2.5">
        <GameButton className="h-[32px] w-[220px]" disabled={busy || auto} onClick={onAttack}>
          Attack {SIDE_NAME[opponent(me.side)]}
        </GameButton>
        <label
          className="flex items-center gap-1"
          title="Keep attacking automatically after every fight until you untick it, leave the valley, or the battle ends."
        >
          <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} />
          Auto Fight
        </label>
      </div>
    </>
  )
}
