// Championship (Reborn scene 6002, `Hd`): the phase and its countdown, the 16-slot bracket
// (Round of 16, Quarterfinals, Semifinals, Final) with Join / challenge during registration and
// Watch for fought matches, your record, the history, Tournament Rewards and the Shop.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { useNow } from '../events/timer'
import { Dialog, GameButton, Notice } from '../skin'
import { fetchMatchReplay, useArenaPost, useChampionship, type ChampionshipChallenge } from './api'
import type { Playing } from './ArenaReplay'
import { CoinShop } from './CoinShop'
import type {
  ChampionshipActionResult,
  ChampionshipMatchView,
  ChampionshipView,
} from '../../../../shared/src/schemas/arena-extras'

const ROUND_NAMES = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final']
const REWARD_NAMES: Record<number, string> = {
  2: 'Quarterfinal Winner',
  3: 'Semifinal Winner',
  4: 'Final Winner',
}
const PHASE_TEXT = {
  registration: 'Registration Open',
  battling: 'Tournament in Progress',
  cooldown: 'Tournament Complete',
} as const

/** "HH:MM:SS" (Reborn `Gd`). */
function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

export function ChampionshipTab({
  character,
  play,
}: {
  character: Character
  play: (playing: Playing) => void
}) {
  const championship = useChampionship()
  const enter = useArenaPost<ChampionshipActionResult | ChampionshipChallenge>()
  const [open, setOpen] = useState<'rewards' | 'shop' | null>(null)
  const [watchError, setWatchError] = useState<string | null>(null)
  const now = useNow()
  if (championship.isPending) return <p>Loading...</p>
  if (championship.isError) return <Notice tone="error">{errorMessage(championship.error)}</Notice>
  const view = championship.data
  if (character.level < view.minLevel)
    return (
      <p>
        Arena Championship: you must be level {view.minLevel}. Current level: {character.level}.
      </p>
    )

  const join = (slot: number, name?: string) =>
    enter.mutate(
      { path: 'championship/enter', body: { slot } },
      {
        onSuccess: (result) => {
          if (!('fight' in result)) return
          const outcome = result.fight.won
            ? `You stole ${name}'s slot!`
            : `You failed to take ${name}'s slot.`
          play({ replay: result.fight, result, message: outcome })
        },
      },
    )
  const watch = (match: ChampionshipMatchView) => {
    setWatchError(null)
    fetchMatchReplay(match.round, match.matchIndex)
      .then((replay) => play({ replay }))
      .catch((error: unknown) => setWatchError(errorMessage(error)))
  }
  const until =
    view.phase === 'registration'
      ? `Starts in ${clock(Date.parse(view.registrationEndsAt) - now)}`
      : view.phase === 'battling'
        ? `Ends in ${clock(Date.parse(view.battlingEndsAt) - now)}`
        : `Next in ${clock(Date.parse(view.cooldownEndsAt) - now)}`
  const error = enter.error ? errorMessage(enter.error) : watchError

  return (
    <div className="flex flex-col gap-2 text-xs">
      <section aria-label="Championship status" className="flex flex-wrap gap-x-4">
        <b>{PHASE_TEXT[view.phase]}</b>
        <span>{until}</span>
        <span>Status: {view.mySlot === null ? 'Joinable' : 'Registered'}</span>
        <span>
          Win/Lose: {view.wins}/{view.losses}
        </span>
        <span>Top 3: {view.top3}</span>
        <span>Hero Coins: {view.heroCoins}</span>
      </section>
      <div className="flex gap-1">
        <GameButton small onClick={() => setOpen('rewards')}>
          Rewards
        </GameButton>
        <GameButton small onClick={() => setOpen('shop')}>
          Shop
        </GameButton>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {view.champion && (
        <p>
          Champion: <b>{view.champion}</b>
        </p>
      )}
      <Bracket view={view} busy={enter.isPending} onJoin={join} onWatch={watch} />
      <History view={view} />
      {open === 'rewards' && (
        <Dialog title="Tournament Rewards" onClose={() => setOpen(null)} className="w-[360px]">
          <table aria-label="Tournament Rewards" className="w-full text-left">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Reward</th>
              </tr>
            </thead>
            <tbody>
              {view.rewards.map((reward) => (
                <tr key={reward.round}>
                  <td>{REWARD_NAMES[reward.round]}</td>
                  <td>
                    <b>{reward.heroCoins} Hero Coins</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog>
      )}
      {open === 'shop' && (
        <CoinShop
          title="Championship Shop"
          coin="Hero Coins"
          balance={view.heroCoins}
          offers={view.shop}
          path="championship/shop/buy"
          info={view.rewards.map((r) => `${REWARD_NAMES[r.round]}: ${r.heroCoins} Hero Coins`)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function Bracket({
  view,
  busy,
  onJoin,
  onWatch,
}: {
  view: ChampionshipView
  busy: boolean
  onJoin: (slot: number, name?: string) => void
  onWatch: (match: ChampionshipMatchView) => void
}) {
  const registering = view.phase === 'registration'
  const side = (slot: number) => {
    const entry = slot >= 0 ? view.slots[slot] : null
    if (registering && slot >= 0 && !entry)
      return (
        <GameButton
          small
          aria-label={`Join slot ${slot + 1}`}
          disabled={busy || view.mySlot !== null}
          onClick={() => onJoin(slot)}
        >
          Join
        </GameButton>
      )
    if (!entry) return <span>?</span>
    const you = entry.slot === view.mySlot
    return (
      <span className={you ? 'font-bold text-[#8a5a00]' : ''}>
        {entry.name} (Lv. {entry.level}){you ? ' (You)' : ''}
        {registering && view.mySlot === null && (
          <GameButton
            small
            aria-label={`Challenge ${entry.name}`}
            disabled={busy}
            onClick={() => onJoin(entry.slot, entry.name)}
            className="ml-1"
          >
            Fight
          </GameButton>
        )}
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {[4, 3, 2, 1].map((round) => (
        <section key={round} aria-label={ROUND_NAMES[round - 1]}>
          <h4 className="font-bold">{ROUND_NAMES[round - 1]}</h4>
          <ul className="grid grid-cols-4 gap-1">
            {view.matches
              .filter((match) => match.round === round)
              .map((match) => (
                <li key={match.matchIndex} className="game-card flex flex-col gap-0.5 p-1">
                  {side(match.slot1)}
                  <span className="text-center">{match.winnerSlot === null ? 'vs' : 'Fought'}</span>
                  {side(match.slot2)}
                  {match.hasReplay && (
                    <GameButton
                      small
                      aria-label={`Watch ${ROUND_NAMES[round - 1]} match ${match.matchIndex + 1}`}
                      onClick={() => onWatch(match)}
                    >
                      Watch
                    </GameButton>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function History({ view }: { view: ChampionshipView }) {
  const fought = view.matches.filter((m) => m.hasReplay)
  const name = (slot: number) => view.slots[slot]?.name ?? 'Bye'
  return (
    <section aria-label="Championship history">
      {view.lastChampion && (
        <p>
          Last Champion: <b>{view.lastChampion}</b>
        </p>
      )}
      {view.challenges.length > 0 && <h4 className="font-bold">Slot Challenges</h4>}
      <ul>
        {view.challenges.map((c) => (
          <li key={`${c.createdAt}-${c.challengerName}`}>
            {c.challengerName} {c.won ? 'stole the slot from' : 'failed to take the slot from'}{' '}
            {c.defenderName}
          </li>
        ))}
      </ul>
      {fought.length > 0 && <h4 className="font-bold">Tournament Matches</h4>}
      <ul>
        {fought.map((m) => {
          const loser = m.winnerSlot === m.slot1 ? m.slot2 : m.slot1
          return (
            <li key={`${m.round}-${m.matchIndex}`}>
              [{ROUND_NAMES[m.round - 1]}] {name(m.winnerSlot!)} defeated {name(loser)}
            </li>
          )
        })}
      </ul>
      {fought.length === 0 && view.challenges.length === 0 && <p>No matches yet.</p>}
    </section>
  )
}
