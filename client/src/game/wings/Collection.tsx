// Reborn's Collection window (reborn-windows-A-L.md "Collection"): tabs Avatars / Pets / Gear Sets /
// Wings. The first three live in ../collection/tabs. Clicking a wing not yet collected opens Submit
// Wing (key `wingSelect`). Unlike Reborn, our server keeps the wing: registering pays Plume Shards
// and the item stays in the bag.
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type {
  WingCollectionEntry,
  WingCollectionResult,
  WingsView,
} from '../../../../shared/src/schemas/wings'
import { api } from '../../lib/api'
import { errorMessage } from '../api'
import { CollectionTab } from '../collection/tabs'
import { SubWindow, TabStrip } from '../forge'
import { Dialog, GameButton, Notice } from '../skin'
import { nameOf, useSettleWings, useWingsView, WingIcon } from './shared'

type CollectionTab = 'avatars' | 'pets' | 'gearSets' | 'wings'
type Filter = 'all' | 'ready' | 'collected' | 'missing'

const TABS = [
  { id: 'avatars' as const, title: 'Avatars' },
  { id: 'pets' as const, title: 'Pets' },
  { id: 'gearSets' as const, title: 'Gear Sets' },
  { id: 'wings' as const, title: 'Wings' },
]
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'collected', label: 'Collected' },
  { id: 'missing', label: 'Missing' },
]

const statusOf = (entry: WingCollectionEntry): Exclude<Filter, 'all'> =>
  entry.registered ? 'collected' : entry.owned ? 'ready' : 'missing'
const STATUS_TEXT = { collected: 'Collected', ready: 'Ready', missing: 'Missing' } as const

export function CollectionWindow({ onClose }: { onClose: () => void }) {
  const view = useWingsView()
  const settle = useSettleWings()
  const [tab, setTab] = useState<CollectionTab>('avatars')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState<WingCollectionEntry | null>(null)
  const panelId = useId()
  const register = useMutation({
    mutationFn: (itemId: string) =>
      api<WingCollectionResult>(`/api/game/wings/collection/${itemId}`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result) => {
      setSubmitting(null)
      setMessage(
        `Registered. You received ${nameOf(`lg_reborn_item_${result.rewardItemId.slice(1)}`)} x${result.reward}.`,
      )
      settle(result)
    },
  })
  const error = view.error ?? register.error
  return (
    <Dialog title="Collection" onClose={onClose} className="game-window-bare w-[740px]">
      <TabStrip label="Collection" panelId={panelId} tabs={TABS} active={tab} onChange={setTab} />
      <div
        id={panelId}
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === tab)!.title}
        className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black"
      >
        {tab !== 'wings' && <CollectionTab key={tab} tab={tab} />}
        {tab === 'wings' && view.isPending && <p>Loading wings...</p>}
        {tab === 'wings' && error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {tab === 'wings' && message && <Notice tone="info">{message}</Notice>}
        {tab === 'wings' && view.data && (
          <WingsTab
            data={view.data}
            onPick={(entry) => {
              setMessage('')
              setSubmitting(entry)
            }}
          />
        )}
      </div>
      {submitting && view.data && (
        <SubmitWing
          entry={submitting}
          data={view.data}
          busy={register.isPending}
          onSubmit={() => register.mutate(submitting.itemId)}
          onClose={() => setSubmitting(null)}
        />
      )}
    </Dialog>
  )
}

function WingsTab({
  data,
  onPick,
}: {
  data: WingsView
  onPick: (entry: WingCollectionEntry) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const count = (status: Filter) => data.collection.filter((e) => statusOf(e) === status).length
  const shown = data.collection.filter((e) => filter === 'all' || statusOf(e) === filter)
  return (
    <div className="grid grid-cols-[200px_1fr] gap-2">
      <div className="game-card flex h-fit flex-col gap-1 p-2">
        <p className="font-bold">Wing Progress</p>
        <p>
          Total Collected: {count('collected')}/{data.collection.length}
        </p>
        <p>Ready to Submit: {count('ready')}</p>
        <p className="text-[11px]">
          Register each wing and aura once to earn Plume Shards. The item stays in your bag.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          {FILTERS.map(({ id, label }) => (
            <GameButton key={id} small aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </GameButton>
          ))}
        </div>
        <ul
          aria-label="Wing Collection"
          className="grid max-h-[400px] grid-cols-3 gap-1 overflow-auto"
        >
          {shown.map((entry) => {
            const name = nameOf(entry.nameKey)
            const status = statusOf(entry)
            return (
              <li key={entry.itemId} className="game-card flex items-center gap-2 p-1">
                {entry.registered ? (
                  <WingIcon itemId={entry.itemId} name={name} />
                ) : (
                  <button type="button" aria-label={name} onClick={() => onPick(entry)}>
                    <WingIcon itemId={entry.itemId} name="" />
                  </button>
                )}
                <span className="flex-1">
                  <span className="font-bold">{name}</span>
                  <br />
                  {STATUS_TEXT[status]}
                  {status === 'ready' && <span className="font-bold text-[#c0392b]"> !</span>}
                  <br />+{entry.reward} Plume Shards
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** Reborn's Submit Wing: the copies in the bag and Submit. */
function SubmitWing({
  entry,
  data,
  busy,
  onSubmit,
  onClose,
}: {
  entry: WingCollectionEntry
  data: WingsView
  busy: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  const copies = data.owned.filter((wing) => wing.itemId === entry.itemId)
  return (
    <SubWindow title="Submit Wing" width={320} top={120} onClose={onClose}>
      <div className="game-card p-1 text-center">
        <p className="font-bold">{nameOf(entry.nameKey)}</p>
        <p className="text-[11px]">
          Registering pays {entry.reward} Plume Shards. The wing stays in your bag.
        </p>
      </div>
      {copies.length === 0 ? (
        <p>You don&apos;t have this wing in your bag.</p>
      ) : (
        <ul aria-label="Your copies" className="flex flex-wrap gap-1">
          {copies.map((wing) => (
            <li key={wing.id} className="flex flex-col items-center">
              <WingIcon itemId={wing.itemId} name="" />+{wing.level}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-center gap-2">
        <GameButton small disabled={busy || copies.length === 0} onClick={onSubmit}>
          Submit
        </GameButton>
        <GameButton small onClick={onClose}>
          Cancel
        </GameButton>
      </div>
    </SubWindow>
  )
}
