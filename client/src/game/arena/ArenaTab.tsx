// Arena tab (UI_ArenaTop): your rank, score, Honor, streak and tries on the left; the 18
// opponents in 3 rows of 6 with Refresh and the boss in the centre.
import type { ReactNode } from 'react'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useArena, useArenaPost } from './api'
import { score, slotName, tierName } from './labels'
import type { Playing } from './ArenaReplay'
import { useArenaFight } from './useArenaFight'
import type {
  ArenaActionResult,
  ArenaSlotView,
  ArenaView,
} from '../../../../shared/src/schemas/arena'

const ROW = 6
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

export function ArenaTab({ play }: { play: (playing: Playing) => void }) {
  const arena = useArena()
  const fight = useArenaFight(play)
  const refresh = useArenaPost<ArenaActionResult>()
  if (arena.isPending) return <p>Loading...</p>
  if (arena.isError) return <Notice tone="error">{errorMessage(arena.error)}</Notice>
  const view = arena.data
  const busy = fight.busy || refresh.isPending
  const rows = [0, 1, 2].map((row) =>
    view.slots.filter((slot) => Math.floor(slot.slot / ROW) === row),
  )
  return (
    <div className="flex gap-3">
      <Summary view={view} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {rows.map((slots, row) => (
          <ul key={row} aria-label={`Row ${row + 1}`} className="grid grid-cols-6 gap-1">
            {slots.map((slot) => (
              <SlotCard
                key={slot.slot}
                slot={slot}
                disabled={busy || fight.outOfTries}
                onAttack={() =>
                  fight.start({
                    path: 'fight',
                    body: { slot: slot.slot },
                    label: `Attack ${slotName(slot)}`,
                  })
                }
              />
            ))}
          </ul>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <GameButton
            small
            disabled={busy}
            title={
              view.freeRefreshAt ? `Next free refresh at ${time(view.freeRefreshAt)}` : undefined
            }
            onClick={() => refresh.mutate({ path: 'refresh' })}
          >
            {view.freeRefreshAt ? `Refresh (${view.refreshGold} Gold)` : 'Refresh (free)'}
          </GameButton>
          <Boss
            view={view}
            disabled={busy}
            onFight={() => fight.start({ path: 'boss', label: 'Challenge the boss', free: true })}
          />
        </div>
        {fight.prompt}
        {refresh.isError && <Notice tone="error">{errorMessage(refresh.error)}</Notice>}
      </div>
    </div>
  )
}

function Summary({ view }: { view: ArenaView }) {
  const tries =
    view.tryGold === null
      ? 'No tries left today.'
      : view.tryGold === 0
        ? 'Next fight: free'
        : `Next fight: ${view.tryGold} Gold`
  const rows: [string, ReactNode][] = [
    ['Rank', tierName(view.tier)],
    ['Place', view.place === null ? 'Not listed yet' : view.place + 1],
    ['Score', score(view.score)],
    ['Honor', view.honor],
    ['Streak', view.streak],
    ['Win rate', `${view.winRate}% (${view.wins} / ${view.fights})`],
    ['Free tries', view.freeTriesLeft],
    ['Bought tries', `${view.triesBought} / ${view.maxBought}`],
  ]
  return (
    <section aria-label="Your arena" className="w-44 shrink-0 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-bold">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">{tries}</p>
    </section>
  )
}

function SlotCard({
  slot,
  disabled,
  onAttack,
}: {
  slot: ArenaSlotView
  disabled: boolean
  onAttack: () => void
}) {
  const name = slotName(slot)
  const level = slot.kind === 'referee' ? null : slot.level
  const place = slot.kind === 'npc' ? null : slot.place + 1
  return (
    <li className="game-card flex flex-col items-center gap-0.5 p-1 text-center text-[11px]">
      <span className="w-full truncate font-bold" title={name}>
        {name}
      </span>
      {level !== null && <span>Lv. {level}</span>}
      {place !== null && <span>Place {place}</span>}
      <span>Score {score(slot.score)}</span>
      {slot.beaten ? (
        <span className="font-bold text-[#1b6e17]">Beaten</span>
      ) : (
        <GameButton small aria-label={`Attack ${name}`} disabled={disabled} onClick={onAttack}>
          Attack
        </GameButton>
      )}
    </li>
  )
}

function Boss({
  view,
  disabled,
  onFight,
}: {
  view: ArenaView
  disabled: boolean
  onFight: () => void
}) {
  if (view.bossScore === null) return <span>You are at the highest rank.</span>
  if (!view.bossReady)
    return <span>Reach a score of {score(view.bossScore)} to challenge the boss.</span>
  return (
    <GameButton small disabled={disabled} onClick={onFight}>
      Challenge the boss for {tierName(view.tier + 1)}
    </GameButton>
  )
}
