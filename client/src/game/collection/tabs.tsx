// Reborn's Collection tabs Avatars / Pets / Gear Sets (reborn-windows-A-L.md "Collection",
// "Submit Gear / Outfit / Pet"): progress, totals, bonus and milestones on the left; group buttons,
// filters and entry cards on the right. Clicking an entry not yet collected opens Submit, which
// destroys the chosen spare copy. The server lists the spare copies (`candidates`).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import type {
  CollectionCandidate,
  CollectionKind,
  CollectionMilestone,
  CollectionSubmitBody,
  CollectionTotals,
  CollectionView,
  StatTriple,
} from '../../../../shared/src/schemas/collection'
import { api } from '../../lib/api'
import { errorMessage, gameKeys } from '../api'
import { SubWindow } from '../forge'
import { ItemIcon } from '../ItemIcon'
import { outfitIcon } from '../inventory/outfits'
import { NATURES, petIcon } from '../pets'
import { GameButton, Notice } from '../skin'
import { outfitName, plainText } from '../text'

const collectionKey = ['game', 'collection'] as const
type Filter = 'all' | 'ready' | 'collected' | 'missing'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'READY' },
  { id: 'collected', label: 'Collected' },
  { id: 'missing', label: 'Missing' },
]
const RARITIES: Record<string, string> = { gray: 'Gray', blue: 'Blue', orange: 'Orange' }

export const useCollection = () =>
  useQuery({ queryKey: collectionKey, queryFn: () => api<CollectionView>('/api/game/collection') })

/** Submit; the bonuses feed the fighter, so the character, bag and kennel refetch. */
function useSubmit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CollectionSubmitBody) =>
      api<CollectionView>('/api/game/collection/submit', { method: 'POST', body }),
    onSuccess: (view) => {
      queryClient.setQueryData(collectionKey, view)
      void queryClient.invalidateQueries({
        queryKey: gameKeys.all,
        predicate: (query) => query.queryKey[1] !== 'collection',
      })
    },
  })
}

const percent = (tenths: number) => `+${(tenths / 10).toFixed(1)}%`
const status = (entry: { collected: boolean; candidates: unknown[] }) =>
  entry.collected ? 'collected' : entry.candidates.length > 0 ? 'ready' : 'missing'
const shown = (filter: Filter, entry: { collected: boolean; candidates: unknown[] }) =>
  filter === 'all' || status(entry) === filter
const Ready = () => <span className="font-bold text-[#c0392b]"> !</span>

/** What Submit needs: the dialog texts and how to draw a candidate. */
interface SubmitTarget {
  kind: CollectionKind
  title: string
  name: string
  subtitle: string
  empty: string
  confirm: string
  label: (c: CollectionCandidate) => string
  icon: (c: CollectionCandidate) => ReactNode
  candidates: CollectionCandidate[]
}

function Rows({ rows }: { rows: [string, string][] }) {
  return rows.map(([label, value]) => (
    <p key={label} className="flex justify-between border-b border-[#c9a85a] py-0.5">
      <span>{label}</span>
      <span>{value}</span>
    </p>
  ))
}

/** The shared Reborn skeleton of the three tabs. */
function TabLayout({
  progress,
  group,
  totals,
  ready,
  bonusTitle,
  milestonesTitle,
  milestones,
  unit,
  notes,
  groups,
  hint,
  children,
}: {
  progress: string
  group: [string, string]
  totals: CollectionTotals & { collected: string }
  ready: number
  bonusTitle: string
  milestonesTitle: string
  milestones: CollectionMilestone[]
  unit: string
  notes?: ReactNode
  groups: ReactNode
  hint: string
  children: (filter: Filter) => ReactNode
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [strength, agility, stamina] = totals.stats
  const [hp, attack, speed] = totals.bonus
  return (
    <div className="grid grid-cols-[200px_1fr] gap-2">
      <div className="flex flex-col gap-1">
        <section aria-label={progress} className="game-card p-2">
          <p className="text-center font-bold">{progress}</p>
          <Rows
            rows={[
              group,
              ['Total Collected', totals.collected],
              ['Total Directory LV', String(totals.level)],
              ['Ready to Submit', String(ready)],
            ]}
          />
        </section>
        <section aria-label="Total" className="game-card p-2">
          <p className="text-center font-bold">Total</p>
          <Rows
            rows={[
              ['Strength', `+${strength}`],
              ['Agility', `+${agility}`],
              ['Stamina', `+${stamina}`],
            ]}
          />
        </section>
        <section aria-label={bonusTitle} className="game-card p-2">
          <p className="text-center font-bold">{bonusTitle}</p>
          <Rows
            rows={[
              ['Max HP', percent(hp)],
              ['Attack', percent(attack)],
              ['Speed', percent(speed)],
            ]}
          />
        </section>
        <section aria-label={milestonesTitle} className="game-card p-2 text-[11px]">
          <p className="text-center font-bold">{milestonesTitle}</p>
          {milestones.map((m) => (
            <p
              key={m.count}
              className={`flex justify-between ${m.reached ? 'font-bold text-[#2e7d32]' : ''}`}
            >
              <span>
                {m.count} {unit}
              </span>
              <span>{percent(m.bonus[0])} HP/ATK/SPD</span>
            </p>
          ))}
          <p className="text-center">A higher milestone replaces the lower one.</p>
          {notes}
        </section>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">{groups}</div>
        <div className="flex items-center gap-1">
          {FILTERS.map(({ id, label }) => (
            <GameButton key={id} small aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </GameButton>
          ))}
          <span className="ml-auto text-right text-[11px]">{hint}</span>
        </div>
        {children(filter)}
      </div>
    </div>
  )
}

function GroupButton({
  label,
  done,
  total,
  ready,
  active,
  onClick,
}: {
  label: string
  done: number
  total: number
  ready: number
  active: boolean
  onClick: () => void
}) {
  return (
    <GameButton small aria-pressed={active} onClick={onClick}>
      {label} {done}/{total}
      {ready > 0 && <Ready />}
    </GameButton>
  )
}

const countOf = (entries: { collected: boolean; candidates: unknown[] }[]) => ({
  done: entries.filter((e) => e.collected).length,
  ready: entries.filter((e) => status(e) === 'ready').length,
  total: entries.length,
})

/** An entry card: status, name, the icon (opens Submit when missing) and STR / AGI / STA. */
function EntryCard({
  name,
  icon,
  entry,
  stats,
  onPick,
}: {
  name: string
  icon: ReactNode
  entry: { collected: boolean; candidates: unknown[] }
  stats: StatTriple
  onPick: () => void
}) {
  const state = status(entry)
  return (
    <li className="game-card flex items-center gap-2 p-1">
      {entry.collected ? (
        icon
      ) : (
        <button type="button" aria-label={name} className="grayscale" onClick={onPick}>
          {icon}
        </button>
      )}
      <span className="flex-1">
        <span className="font-bold">{name}</span>
        <br />
        {state === 'collected' ? 'Collected' : state === 'ready' ? 'Ready' : 'Missing'}
        {state === 'ready' && <Ready />}
        <br />
        STR +{stats[0]} AGI +{stats[1]} STA +{stats[2]}
      </span>
    </li>
  )
}

const Grid = ({
  label,
  empty,
  children,
}: {
  label: string
  empty: string
  children: ReactNode[]
}) =>
  children.length === 0 ? (
    <p className="py-8 text-center">{empty}</p>
  ) : (
    <ul aria-label={label} className="grid max-h-[400px] grid-cols-3 gap-1 overflow-auto">
      {children}
    </ul>
  )

const outfitPicture = (clothing: number, name: string) => (
  <span className="game-slot grid size-11 shrink-0 place-items-center">
    <img src={outfitIcon(clothing)} alt={name} className="max-h-full max-w-full p-0.5" />
  </span>
)

function AvatarsTab({ view, onPick }: { view: CollectionView; onPick: (t: SubmitTarget) => void }) {
  const tab = view.outfits
  const [id, setId] = useState(tab.rarities.at(-1)?.id ?? 'gray')
  const rarity = tab.rarities.find((r) => r.id === id) ?? tab.rarities[0]!
  const all = tab.rarities.flatMap((r) => r.entries)
  const count = countOf(rarity.entries)
  return (
    <TabLayout
      progress="Outfit Progress"
      group={[RARITIES[rarity.id] ?? rarity.id, `${count.done}/${count.total}`]}
      totals={{ ...tab, collected: `${countOf(all).done}/${all.length}` }}
      ready={countOf(all).ready}
      bonusTitle="Level Bonus"
      milestonesTitle="Set Unlocks"
      milestones={rarity.milestones}
      unit="outfits"
      hint="Collect outfit pieces to complete sets and earn bonus stats."
      groups={tab.rarities.map((r) => (
        <GroupButton
          key={r.id}
          label={RARITIES[r.id] ?? r.id}
          {...countOf(r.entries)}
          active={r.id === rarity.id}
          onClick={() => setId(r.id)}
        />
      ))}
    >
      {(filter) => (
        <Grid label="Outfits" empty="No outfits match this filter.">
          {rarity.entries
            .filter((e) => shown(filter, e))
            .map((entry) => {
              const name = outfitName(entry.clothing)
              return (
                <EntryCard
                  key={entry.clothing}
                  name={name}
                  icon={outfitPicture(entry.clothing, entry.collected ? name : '')}
                  entry={entry}
                  stats={entry.stats}
                  onPick={() =>
                    onPick({
                      kind: 'outfit',
                      title: 'Submit Outfit',
                      name,
                      subtitle: 'Select an outfit to submit',
                      empty: "You don't own a spare copy of this outfit.",
                      confirm: 'Are you sure you want to destroy this outfit?',
                      label: (c) => `${name} +${c.level}`,
                      icon: () => outfitPicture(entry.clothing, ''),
                      candidates: entry.candidates,
                    })
                  }
                />
              )
            })}
        </Grid>
      )}
    </TabLayout>
  )
}

const petPicture = (avatar: number, name: string) => (
  <span className="game-slot grid size-11 shrink-0 place-items-center">
    <img src={petIcon(avatar)} alt={name} className="max-h-full max-w-full p-0.5" />
  </span>
)

function PetsTab({ view, onPick }: { view: CollectionView; onPick: (t: SubmitTarget) => void }) {
  const tab = view.pets
  const [id, setId] = useState(tab.natures[0]?.nature ?? 1)
  const nature = tab.natures.find((n) => n.nature === id) ?? tab.natures[0]!
  const label = (n: number) => NATURES[n] ?? `Nature ${n}`
  const all = tab.natures.flatMap((n) => n.entries)
  const count = countOf(nature.entries)
  return (
    <TabLayout
      progress="Pet Progress"
      group={[label(nature.nature), `${count.done}/${count.total}`]}
      totals={{ ...tab, collected: `${countOf(all).done}/${all.length}` }}
      ready={countOf(all).ready}
      bonusTitle="Nature Bonus"
      milestonesTitle={`${label(nature.nature)} Milestones`}
      milestones={nature.milestones}
      unit="pets"
      hint="Submit one pet of each family. Any evolution counts."
      groups={tab.natures.map((n) => (
        <GroupButton
          key={n.nature}
          label={label(n.nature)}
          {...countOf(n.entries)}
          active={n.nature === nature.nature}
          onClick={() => setId(n.nature)}
        />
      ))}
    >
      {(filter) => (
        <Grid label="Pets" empty="No pets match this filter.">
          {nature.entries
            .filter((e) => shown(filter, e))
            .map((entry) => {
              const name = plainText(entry.nameKey, 'Unknown pet')
              return (
                <EntryCard
                  key={entry.family}
                  name={name}
                  icon={petPicture(entry.avatar, entry.collected ? name : '')}
                  entry={entry}
                  stats={entry.stats}
                  onPick={() =>
                    onPick({
                      kind: 'pet',
                      title: 'Submit Pet',
                      name,
                      subtitle: 'Select a pet to submit',
                      empty: "You don't have a spare pet of this family in your bag or kennel.",
                      confirm: 'Are you sure you want to submit this pet? It will be destroyed.',
                      label: (c) =>
                        `${plainText(c.nameKey, name)} Lv. ${c.level}${c.source === 'kennel' ? ' (Kennel)' : ''}`,
                      icon: () => petPicture(entry.avatar, ''),
                      candidates: entry.candidates,
                    })
                  }
                />
              )
            })}
        </Grid>
      )}
    </TabLayout>
  )
}

/** Reborn: "<first piece name without its last word> Set". */
const setName = (nameKey: string, id: number) => {
  const words = plainText(nameKey).split(' ')
  return words.length > 1 ? `${words.slice(0, -1).join(' ')} Set` : `Set #${id}`
}

function GearTab({ view, onPick }: { view: CollectionView; onPick: (t: SubmitTarget) => void }) {
  const tab = view.gear
  const [index, setIndex] = useState(0)
  const tier = tab.tiers[index] ?? tab.tiers[0]!
  const complete = (set: (typeof tier.sets)[number]) => set.pieces.every((p) => p.collected)
  const setStatus = (set: (typeof tier.sets)[number]) => ({
    collected: complete(set),
    candidates: set.pieces.filter((p) => !p.collected && p.candidates.length > 0),
  })
  const allSets = tab.tiers.flatMap((t) => t.sets)
  const readyPieces = (sets: typeof allSets) =>
    sets.flatMap((s) => s.pieces).filter((p) => status(p) === 'ready').length
  return (
    <TabLayout
      progress="Gear Set Progress"
      group={[tier.label, `${tier.sets.filter(complete).length}/${tier.sets.length}`]}
      totals={{ ...tab, collected: `${allSets.filter(complete).length}/${allSets.length}` }}
      ready={readyPieces(allSets)}
      bonusTitle="Tier Bonus"
      milestonesTitle={`${tier.label} Milestones`}
      milestones={tier.milestones}
      unit="sets"
      notes={
        <>
          <p className="text-center">Each piece: +{tab.piece} STR/AGI/STA</p>
          <p className="text-center">Full set: +{tab.complete} STR/AGI/STA</p>
          <p className="text-center font-bold">
            Pieces need {tab.requiredLines} refine lines (top tier)
          </p>
        </>
      }
      hint="Submit each piece of a set to complete it."
      groups={tab.tiers.map((t, i) => (
        <GameButton key={t.label} small aria-pressed={i === index} onClick={() => setIndex(i)}>
          {t.label} {t.sets.filter(complete).length}/{t.sets.length}
          {readyPieces(t.sets) > 0 && <Ready />}
        </GameButton>
      ))}
    >
      {(filter) => {
        const sets = tier.sets.filter((s) => shown(filter, setStatus(s)))
        if (sets.length === 0) return <p className="py-8 text-center">No sets match this filter.</p>
        return (
          <ul aria-label="Gear Sets" className="grid max-h-[400px] grid-cols-2 gap-1 overflow-auto">
            {sets.map((set) => {
              const name = setName(set.pieces[0]!.nameKey, set.id)
              const done = complete(set)
              return (
                <li key={set.id} className="game-card p-1">
                  <p className="flex justify-between font-bold">
                    <span>{name}</span>
                    <span>
                      {set.pieces.filter((p) => p.collected).length}/{set.pieces.length}
                    </span>
                  </p>
                  <div className="flex gap-0.5">
                    {set.pieces.map((piece) => {
                      const pieceName = plainText(piece.nameKey, piece.slot)
                      const icon = (
                        <ItemIcon itemId={piece.itemId} name={pieceName} className="size-7">
                          {status(piece) === 'ready' && (
                            <span className="absolute -top-1 right-0 font-bold text-[#c0392b]">
                              !
                            </span>
                          )}
                        </ItemIcon>
                      )
                      return piece.collected ? (
                        <span key={piece.slot}>{icon}</span>
                      ) : (
                        <button
                          key={piece.slot}
                          type="button"
                          aria-label={`${pieceName} (${piece.slot})`}
                          className="opacity-60"
                          onClick={() =>
                            onPick({
                              kind: 'gear',
                              title: 'Submit Gear',
                              name: pieceName,
                              subtitle: 'Select a piece to submit',
                              empty: `You need a spare piece for this slot in your bag, refined to ${tab.requiredLines} lines, unlocked and without gems.`,
                              confirm:
                                'Are you sure you want to submit this piece? It will be destroyed.',
                              label: (c) => `${plainText(c.nameKey, pieceName)} +${c.level}`,
                              icon: (c) => (
                                <ItemIcon itemId={c.itemId} name="" className="size-9" />
                              ),
                              candidates: piece.candidates,
                            })
                          }
                        >
                          {icon}
                        </button>
                      )
                    })}
                  </div>
                  <p className={`text-[11px] ${done ? 'text-[#2e7d32]' : ''}`}>
                    {done ? 'Set complete!' : 'Click a piece to submit it.'}
                  </p>
                </li>
              )
            })}
          </ul>
        )
      }}
    </TabLayout>
  )
}

/** Reborn's Submit Outfit / Pet / Gear: pick a spare copy, confirm, and it is destroyed. */
function SubmitDialog({ target, onClose }: { target: SubmitTarget; onClose: () => void }) {
  const submit = useSubmit()
  const { candidates } = target
  const [picked, setPicked] = useState(candidates.length === 1 ? candidates[0]! : null)
  const [confirming, setConfirming] = useState(false)
  return (
    <SubWindow title={target.title} width={320} top={120} onClose={onClose}>
      <div className="game-card p-1 text-center">
        <p className="font-bold">{target.name}</p>
        <p className="text-[11px]">{target.subtitle}</p>
      </div>
      {submit.error && <Notice tone="error">{errorMessage(submit.error)}</Notice>}
      {candidates.length === 0 ? (
        <p>{target.empty}</p>
      ) : (
        <ul aria-label="Spare copies" className="flex flex-wrap gap-1">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-label={target.label(c)}
                aria-pressed={picked?.id === c.id}
                className={`flex flex-col items-center rounded p-0.5 ${picked?.id === c.id ? 'outline-2 outline-[#c0392b]' : ''}`}
                onClick={() => {
                  setConfirming(false)
                  setPicked(picked?.id === c.id ? null : c)
                }}
              >
                {target.icon(c)}
                <span className="text-[11px]">
                  {target.kind === 'pet' ? `Lv. ${c.level}` : `+${c.level}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirming && picked && (
        <p className="text-center font-bold">
          {target.label(picked)}
          <br />
          {target.confirm}
        </p>
      )}
      <div className="flex justify-center gap-2">
        <GameButton
          small
          disabled={!picked || submit.isPending}
          onClick={() => {
            if (!picked) return
            if (!confirming) return setConfirming(true)
            submit.mutate(
              { kind: target.kind, id: picked.id, source: picked.source },
              { onSuccess: onClose },
            )
          }}
        >
          {confirming ? 'Confirm' : 'Submit'}
        </GameButton>
        <GameButton small onClick={onClose}>
          Cancel
        </GameButton>
      </div>
    </SubWindow>
  )
}

/** One of the three tabs, with its query state and the Submit window. */
export function CollectionTab({ tab }: { tab: 'avatars' | 'pets' | 'gearSets' }) {
  const view = useCollection()
  const [target, setTarget] = useState<SubmitTarget | null>(null)
  const Tab = tab === 'avatars' ? AvatarsTab : tab === 'pets' ? PetsTab : GearTab
  return (
    <>
      {view.isPending && <p>Loading collection...</p>}
      {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
      {view.data && <Tab view={view.data} onPick={setTarget} />}
      {target && <SubmitDialog target={target} onClose={() => setTarget(null)} />}
    </>
  )
}
