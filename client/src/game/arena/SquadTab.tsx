// Squad Arena 3v3 (Reborn scene 6001, `Ld`): your rank, score, Team Coins and squad; Fight
// Tickets Available with Buy Tickets, Spend Ticket to Refresh, Edit Squad, Exchange and Weekly
// Rewards; the opponents' squads in 3 rows of 6, the history and the Top 10.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useArenaPost, useSquad, type SquadFight } from './api'
import type { Playing } from './ArenaReplay'
import { BuyTickets } from './BuyTickets'
import { CoinShop } from './CoinShop'
import { score, signedScore } from './labels'
import { WeeklyRewards } from './WeeklyRewards'
import type {
  SquadActionResult,
  SquadLoadoutView,
  SquadOpponentView,
  SquadView,
} from '../../../../shared/src/schemas/arena-extras'

const ROW = 6
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const STAT_COLORS = { STR: '#FF6B6B', AGI: '#4ECDC4', STA: '#FFD93D' } as const
type Open = 'tickets' | 'edit' | 'exchange' | 'weekly' | null

/** The rounds as one replay chain: the last carries the result and the message. */
export function squadPlaying(result: SquadFight): Playing {
  const outcome = result.won ? 'Squad Won!' : 'Squad Lost.'
  const coupons = result.giftCoupons ? `, +${result.giftCoupons} Gift Certificates` : ''
  const message = `${outcome} Score ${signedScore(result.scoreDelta)}, +${result.teamCoins} Team Coins${coupons}.`
  return result.rounds.reduceRight<Playing | undefined>(
    (next, round, index) => ({
      replay: round,
      ...(index === result.rounds.length - 1 ? { result, message } : {}),
      ...(next && { next }),
    }),
    undefined,
  )!
}

export function SquadTab({
  character,
  play,
}: {
  character: Character
  play: (playing: Playing) => void
}) {
  const squad = useSquad()
  const post = useArenaPost<SquadActionResult & { empty?: boolean }>()
  const fight = useArenaPost<SquadFight>()
  const [open, setOpen] = useState<Open>(null)
  const [notice, setNotice] = useState<string | null>(null)
  if (squad.isPending) return <p>Loading...</p>
  if (squad.isError) return <Notice tone="error">{errorMessage(squad.error)}</Notice>
  const view = squad.data
  if (view.level < view.minLevel)
    return (
      <p>
        You must be at least level {view.minLevel} to participate. Current level: {view.level}.
      </p>
    )
  const tickets = view.freeTickets + view.boughtTickets
  const busy = post.isPending || fight.isPending
  const error = post.error ?? fight.error
  return (
    <div className="flex flex-col gap-2 text-xs">
      <section aria-label="Your squad" className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Ranking: <b>{view.rank ?? '-'}</b>
        </span>
        <span>
          Score: <b>{score(view.score)}</b>
        </span>
        <span>
          Team Coins: <b>{view.teamCoins}</b>
        </span>
        <span>
          Squad: <b>{view.selected.length}/3</b>
        </span>
        <span>
          Fight Tickets Available: <b>{tickets}</b>
        </span>
      </section>
      <div className="flex flex-wrap gap-1">
        <GameButton small onClick={() => setOpen('tickets')}>
          Buy Tickets
        </GameButton>
        <GameButton
          small
          disabled={busy || tickets <= 0 || !view.squadValid}
          onClick={() =>
            post.mutate(
              { path: 'squad/refresh' },
              {
                onSuccess: (result) =>
                  setNotice(
                    result.empty ? 'No eligible player squads. No ticket was spent.' : null,
                  ),
              },
            )
          }
        >
          Spend Ticket to Refresh
        </GameButton>
        <GameButton small onClick={() => setOpen('edit')}>
          Edit Squad
        </GameButton>
        <GameButton small onClick={() => setOpen('exchange')}>
          Exchange
        </GameButton>
        <GameButton small onClick={() => setOpen('weekly')}>
          Weekly Rewards
        </GameButton>
      </div>
      <p role={error ? 'alert' : 'status'}>
        {error
          ? errorMessage(error)
          : (notice ??
            (view.squadValid
              ? 'Real player squads only. No AI substitutes.'
              : 'Select three equipped builds: one STR, one AGI and one STA.'))}
      </p>
      {[0, 1, 2].map((row) => (
        <ul key={row} aria-label={`Squad row ${row + 1}`} className="grid grid-cols-6 gap-1">
          {view.opponents.slice(row * ROW, row * ROW + ROW).map((opponent) => (
            <OpponentCard
              key={opponent.index}
              opponent={opponent}
              disabled={busy || tickets <= 0 || !view.squadValid}
              onFight={() =>
                fight.mutate(
                  { path: 'squad/fight', body: { index: opponent.index } },
                  { onSuccess: (result) => play(squadPlaying(result)) },
                )
              }
            />
          ))}
        </ul>
      ))}
      {view.opponents.length === 0 && view.squadValid && (
        <p>No other eligible player squads yet. Check again later.</p>
      )}
      <div className="flex gap-3">
        <section aria-label="Squad history" className="flex-1">
          <h4 className="font-bold">History</h4>
          <ul>
            {[...view.history].reverse().map((line) => (
              <li key={`${line.at}-${line.name}`}>
                {line.challenged
                  ? `You challenged ${line.name} and ${line.won ? 'won' : 'lost'}. Score ${signedScore(line.scoreDelta)}`
                  : `${line.name} challenged you and ${line.won ? 'lost' : 'won'}. Score ${signedScore(line.scoreDelta)}`}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Squad leaderboard" className="w-48 shrink-0">
          <h4 className="font-bold">Top 10</h4>
          <ol>
            {view.leaderboard.map((row) => (
              <li key={row.characterId} className="flex justify-between">
                <span>
                  {row.rank}. {row.name}
                </span>
                <span>{Math.floor(row.score / 100)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {open === 'tickets' && (
        <BuyTickets
          title="Buy Squad Arena Tickets"
          path="squad/tickets"
          price={200}
          max={10}
          hint="More tickets = better rewards!"
          character={character}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'edit' && <EditSquad view={view} onClose={() => setOpen(null)} />}
      {open === 'exchange' && (
        <CoinShop
          title="Squad Arena Exchange"
          coin="Team Coins"
          balance={view.teamCoins}
          offers={view.shop}
          path="squad/shop/buy"
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'weekly' && <WeeklyRewards kind="squad" onClose={() => setOpen(null)} />}
    </div>
  )
}

function OpponentCard({
  opponent,
  disabled,
  onFight,
}: {
  opponent: SquadOpponentView
  disabled: boolean
  onFight: () => void
}) {
  return (
    <li className="game-card flex flex-col items-center gap-0.5 p-1 text-center text-[11px]">
      <span className="w-full truncate font-bold" title={opponent.name}>
        {opponent.name}
      </span>
      <span>Lv. {opponent.level}</span>
      <span>Score {score(opponent.score)}</span>
      {opponent.won ? (
        <span className="font-bold text-[#1b6e17]">Beaten</span>
      ) : (
        <GameButton
          small
          aria-label={`Fight ${opponent.name}`}
          disabled={disabled}
          onClick={onFight}
        >
          Fight
        </GameButton>
      )}
    </li>
  )
}

/** Select Your Squad (Reborn `Ad`): three loadouts with different main stats, in fight order. */
function EditSquad({ view, onClose }: { view: SquadView; onClose: () => void }) {
  const [picked, setPicked] = useState<number[]>(view.selected)
  const [warning, setWarning] = useState<string | null>(null)
  const save = useArenaPost<SquadActionResult>()
  const statOf = (set: number) => view.loadouts.find((l) => l.set === set)?.mainStat ?? null
  const toggle = (loadout: SquadLoadoutView) => {
    setWarning(null)
    if (picked.includes(loadout.set)) return setPicked(picked.filter((set) => set !== loadout.set))
    if (picked.length >= 3) return
    if (picked.some((set) => statOf(set) === loadout.mainStat))
      return setWarning(
        `You already have a loadout with that main stat selected (${loadout.mainStat}).`,
      )
    setPicked([...picked, loadout.set])
  }
  const valid = picked.length === 3 && new Set(picked.map(statOf)).size === 3
  return (
    <Dialog title="Select Your Squad" onClose={onClose} className="w-[520px]">
      <div className="flex flex-col gap-2 text-xs">
        <h3 className="font-bold">Select 3 Loadouts for Your Squad</h3>
        <p>
          Each loadout must have a different main attribute (STR, AGI, STA). Your squad will fight
          in sequence against your opponent&apos;s squad.
        </p>
        <div role="group" aria-label="Loadouts" className="flex gap-2">
          {view.loadouts.map((loadout) => {
            const order = picked.indexOf(loadout.set)
            const label = loadout.vipLocked
              ? 'VIP required'
              : (loadout.mainStat ?? (loadout.clothing === null ? 'Empty' : '???'))
            return (
              <button
                key={loadout.set}
                type="button"
                aria-pressed={order >= 0}
                aria-label={`Loadout ${ROMAN[loadout.set - 1]}: ${label}`}
                disabled={loadout.vipLocked || (!loadout.mainStat && order < 0)}
                onClick={() => toggle(loadout)}
                className="game-card flex w-16 flex-col items-center p-1 disabled:opacity-50 aria-pressed:outline aria-pressed:outline-2"
              >
                <span className="font-bold">{ROMAN[loadout.set - 1]}</span>
                <span
                  style={{ color: loadout.mainStat ? STAT_COLORS[loadout.mainStat] : undefined }}
                >
                  {label}
                </span>
                {order >= 0 && <span>#{order + 1}</span>}
              </button>
            )
          })}
        </div>
        <p>
          {picked.length}/3 Selected
          {picked.length > 0 &&
            ` (${picked.map((set, i) => `#${i + 1} ${statOf(set)}`).join(' → ')})`}
        </p>
        <ul aria-label="Squad Arena Rewards" className="game-card px-2 py-1">
          <li className="font-bold">Squad Arena Rewards</li>
          <li>{view.rewards.teamCoinsPerMatch} Team Coins per Match</li>
          <li>
            {Math.round(view.rewards.giftCouponChance * 100)}% Chance Gift Certificates (
            {view.rewards.giftCoupons})
          </li>
          <li>{view.rewards.rankMultiplier}× Rank Multiplier</li>
        </ul>
        {warning && <Notice tone="error">{warning}</Notice>}
        {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        <div className="flex gap-2">
          <GameButton
            disabled={!valid || save.isPending}
            onClick={() =>
              save.mutate(
                { path: 'squad/loadouts', body: { loadouts: picked } },
                { onSuccess: onClose },
              )
            }
          >
            {save.isPending ? 'Loading...' : 'Confirm Squad'}
          </GameButton>
          <GameButton onClick={onClose}>Cancel</GameButton>
        </div>
      </div>
    </Dialog>
  )
}
