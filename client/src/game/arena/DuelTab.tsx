// Ninjutsu Duel (UI_PlayerPK): random ninjas within 30 places, friends, any name; history.
// Tier 2 (Prep III) on both sides; 10 free a day, then Gold.
import { useState } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useArenaPost, useDuels, type Duel } from './api'
import { DUEL_TIER, score, tierName } from './labels'
import type { Playing } from './ArenaReplay'
import { LogTable } from './FightLog'
import type { DuelCandidate } from '../../../../shared/src/schemas/arena'

export function DuelTab({ play }: { play: (playing: Playing) => void }) {
  const duels = useDuels()
  const duel = useArenaPost<Duel>()
  const [name, setName] = useState('')
  if (duels.isPending) return <p>Loading...</p>
  if (duels.isError) return <Notice tone="error">{errorMessage(duels.error)}</Notice>
  const view = duels.data
  const start = (target: string) =>
    duel.mutate(
      { path: 'duel', body: { name: target } },
      {
        onSuccess: (result) =>
          play({
            replay: result,
            result,
            message: result.won
              ? `You won the duel with ${target}.`
              : `You lost the duel with ${target}.`,
          }),
      },
    )
  if (view.tier < DUEL_TIER)
    return (
      <Notice>
        Ninjutsu Duels open at {tierName(DUEL_TIER)}. Your rank is {tierName(view.tier)}.
      </Notice>
    )
  const freeLeft = Math.max(0, view.freeDuels - view.duelsUsed)
  const busy = duel.isPending
  return (
    <div className="flex flex-col gap-2">
      <p role="status">
        Free duels left today: {freeLeft} / {view.freeDuels}.{' '}
        {view.duelGold ? `Next duel: ${view.duelGold} Gold.` : 'Next duel: free.'}
      </p>
      <Candidates title="Random" list={view.candidates} busy={busy} onDuel={start} />
      <Candidates title="Friends" list={view.friends} busy={busy} onDuel={start} />
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) start(name.trim())
        }}
      >
        <label htmlFor="duel-name" className="font-bold">
          Duel by name
        </label>
        <input
          id="duel-name"
          value={name}
          maxLength={12}
          onChange={(event) => setName(event.target.value)}
          className="game-field w-36 px-1"
        />
        <GameButton small type="submit" disabled={busy || !name.trim()}>
          Duel
        </GameButton>
      </form>
      {duel.isError && <Notice tone="error">{errorMessage(duel.error)}</Notice>}
      <h3 className="font-bold">History</h3>
      <LogTable logs={view.logs} play={play} />
    </div>
  )
}

function Candidates({
  title,
  list,
  busy,
  onDuel,
}: {
  title: string
  list: DuelCandidate[]
  busy: boolean
  onDuel: (name: string) => void
}) {
  return (
    <section aria-label={title}>
      <h3 className="font-bold">{title}</h3>
      {list.length === 0 ? (
        <p className="text-xs">Nobody to duel here.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {list.map((ninja) => (
            <li key={ninja.name} className="game-card flex items-center gap-2 px-2 py-0.5">
              <span className="flex-1">
                {ninja.name}, Lv. {ninja.level}, {tierName(ninja.tier)}, score {score(ninja.score)}
              </span>
              <GameButton
                small
                aria-label={`Duel ${ninja.name}`}
                disabled={busy}
                onClick={() => onDuel(ninja.name)}
              >
                Duel
              </GameButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
