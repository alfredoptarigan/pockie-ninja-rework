// Wings window (M6 task 7): enhance a wing or aura with stones and talismans (the odds come from
// the same game-core function the server rolls) and register wings in the Wing Collection.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { enhanceOdds, type WingOutcome } from '../../../../game-core/src/wings/enhance'
import type {
  OwnedWing,
  TalismanFamily,
  WingCollectionResult,
  WingEnhanceBody,
  WingEnhanceResult,
  WingsView,
} from '../../../../shared/src/schemas/wings'
import auras from '../../generated/reborn-auras.json'
import wings from '../../generated/reborn-wings.json'
import { api } from '../../lib/api'
import { errorMessage, gameKeys, useEquipItem, useUnequipItem } from '../api'
import { formatStat } from '../bloodlines'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { plainText } from '../text'

export const wingsKey = ['game', 'wings'] as const
/** Item id ("i218000") to its Reborn icon. */
export const WING_ICONS: Record<string, string> = Object.fromEntries(
  [...Object.values(wings), ...Object.values(auras)].map((entry) => [`i${entry.item}`, entry.icon]),
)

const FAMILIES: { id: TalismanFamily; label: string }[] = [
  { id: 'luck', label: 'Luck' },
  { id: 'safety', label: 'Safety' },
  { id: 'integrity', label: 'Integrity' },
]
const OUTCOMES: { id: WingOutcome; label: string }[] = [
  { id: 'success', label: 'Success' },
  { id: 'fail', label: 'No change' },
  { id: 'decrease', label: 'Lose a level' },
  { id: 'reset', label: 'Reset to +0' },
  { id: 'destroy', label: 'Destroyed' },
]
const outcomeText = ({ outcome, level }: WingEnhanceResult) =>
  ({
    success: `Success. The wing is now +${level}.`,
    fail: 'The enhancement failed. The level is kept.',
    decrease: `The enhancement failed. The wing dropped to +${level}.`,
    reset: 'The enhancement failed. The wing was reset to +0.',
    destroy: 'The wing was destroyed.',
  })[outcome]

const nameOf = (nameKey: string) => plainText(nameKey, 'Unknown item')
const percent = (value: number) => `${Number(value.toFixed(2))}%`

function WingIcon({ itemId, name }: { itemId: string; name: string }) {
  return (
    <span className="game-slot grid size-11 shrink-0 place-items-center">
      <img src={WING_ICONS[itemId]} alt={name} className="max-h-full max-w-full p-0.5" />
    </span>
  )
}

type Tab = 'enhance' | 'collection'

export function WingsWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('enhance')
  const [message, setMessage] = useState('')
  const view = useQuery({ queryKey: wingsKey, queryFn: () => api<WingsView>('/api/game/wings') })
  // Wing stats feed the fighter, so the character and the bag refetch after each action.
  const settle = (result: WingsView) => {
    queryClient.setQueryData(wingsKey, result)
    void queryClient.invalidateQueries({
      queryKey: gameKeys.all,
      predicate: (query) => query.queryKey[1] !== 'wings',
    })
  }
  const enhance = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WingEnhanceBody }) =>
      api<WingEnhanceResult>(`/api/game/wings/${id}/enhance`, { method: 'POST', body }),
    onSuccess: (result) => {
      setMessage(outcomeText(result))
      settle(result)
    },
  })
  const register = useMutation({
    mutationFn: (itemId: string) =>
      api<WingCollectionResult>(`/api/game/wings/collection/${itemId}`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result) => {
      setMessage(
        `Registered. +${result.reward} ${nameOf(`lg_reborn_item_${result.rewardItemId.slice(1)}`)}.`,
      )
      settle(result)
    },
  })
  const data = view.data
  const error = view.error ?? enhance.error ?? register.error
  const panelId = 'wings-panel'
  return (
    <Dialog title="Wings" onClose={onClose} className="game-window-bare w-[560px]">
      <Tabs
        label="Wings"
        panelId={panelId}
        active={tab}
        onChange={(next) => {
          setMessage('')
          setTab(next)
        }}
        tabs={[
          { id: 'enhance', title: 'Enhance' },
          { id: 'collection', title: 'Collection' },
        ]}
      />
      <div
        id={panelId}
        role="tabpanel"
        className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black"
      >
        {view.isPending && <p>Loading wings...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {message && <Notice tone="info">{message}</Notice>}
        {data && tab === 'enhance' && (
          <EnhancePanel
            data={data}
            busy={enhance.isPending}
            onEnhance={(id, body) => {
              setMessage('')
              enhance.mutate({ id, body })
            }}
          />
        )}
        {data && tab === 'collection' && (
          <CollectionPanel
            data={data}
            busy={register.isPending}
            onRegister={(itemId) => {
              setMessage('')
              register.mutate(itemId)
            }}
          />
        )}
      </div>
    </Dialog>
  )
}

function EnhancePanel({
  data,
  busy,
  onEnhance,
}: {
  data: WingsView
  busy: boolean
  onEnhance: (id: string, body: WingEnhanceBody) => void
}) {
  const [selectedId, select] = useState<string | null>(null)
  const [stoneId, setStone] = useState<string | null>(null)
  const [picks, setPicks] = useState<Partial<Record<TalismanFamily, string>>>({})
  const wing = data.owned.find((w) => w.id === selectedId) ?? data.equipped ?? data.owned[0] ?? null
  if (!wing) return <p>You have no wings or auras. Buy them in the Team Stone and Essence shops.</p>
  const stone = data.stones.find((s) => s.itemId === stoneId && s.count > 0)
  const talismanValue = (family: TalismanFamily) =>
    data.talismans.find((t) => t.itemId === picks[family])?.value
  const odds =
    stone && wing.level < data.maxLevel
      ? enhanceOdds(wing.level, stone.levelJump, {
          luck: talismanValue('luck'),
          safety: talismanValue('safety'),
          integrity: talismanValue('integrity'),
        })
      : null
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3">
      <ul aria-label="Your wings" className="flex max-h-[300px] flex-col gap-1 overflow-auto">
        {data.owned.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              aria-pressed={w.id === wing.id}
              onClick={() => select(w.id)}
              className={`game-card flex w-full items-center gap-2 p-1 text-left ${
                w.id === wing.id ? 'outline-2 outline-[#c98a1a]' : ''
              }`}
            >
              <WingIcon itemId={w.itemId} name="" />
              <span>
                {nameOf(w.nameKey)} +{w.level}
                {w.equipped && ' (worn)'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <WingCard wing={wing} maxLevel={data.maxLevel} />
        <fieldset className="flex flex-col gap-1">
          <legend className="font-bold">Stone</legend>
          {data.stones.map((s) => (
            <label key={s.itemId} className="flex items-center gap-1">
              <input
                type="radio"
                name="wing-stone"
                disabled={s.count === 0}
                checked={s.itemId === stone?.itemId}
                onChange={() => setStone(s.itemId)}
              />
              {nameOf(s.nameKey)} (+{s.levelJump}) x{s.count}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          {FAMILIES.map(({ id, label }) => (
            <label key={id} className="flex flex-col">
              {label}
              <select
                value={picks[id] ?? ''}
                onChange={(event) => setPicks({ ...picks, [id]: event.target.value || undefined })}
              >
                <option value="">None</option>
                {data.talismans
                  .filter((t) => t.family === id && t.count > 0)
                  .map((t) => (
                    <option key={t.itemId} value={t.itemId}>
                      {nameOf(t.nameKey)} x{t.count}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        {odds && (
          <ul aria-label="Outcome odds" className="grid grid-cols-2 gap-x-3">
            {OUTCOMES.map(({ id, label }) => (
              <li key={id}>
                {label}: {percent(odds[id])}
              </li>
            ))}
          </ul>
        )}
        <p>The stone and talismans are used up on every attempt.</p>
        <GameButton
          disabled={busy || !odds}
          onClick={() => {
            onEnhance(wing.id, { stone: stone!.itemId, ...picks })
            setPicks({})
          }}
        >
          Enhance
        </GameButton>
      </div>
    </div>
  )
}

function WingCard({ wing, maxLevel }: { wing: OwnedWing; maxLevel: number }) {
  const equip = useEquipItem()
  const unequip = useUnequipItem()
  const action = wing.equipped ? unequip : equip
  return (
    <div className="flex gap-2">
      <WingIcon itemId={wing.itemId} name={nameOf(wing.nameKey)} />
      <div className="flex flex-col gap-1">
        <p className="font-bold">
          {nameOf(wing.nameKey)} +{wing.level}/{maxLevel}
        </p>
        <ul aria-label="Wing stats">
          {wing.stats.map((stat) => (
            <li key={stat.field}>{formatStat(stat)}</li>
          ))}
        </ul>
        {wing.next && <p>Next level: {wing.next.map(formatStat).join(', ')}</p>}
        <GameButton small disabled={action.isPending} onClick={() => action.mutate(wing.id)}>
          {wing.equipped ? 'Unequip' : 'Equip'}
        </GameButton>
        {action.error && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      </div>
    </div>
  )
}

function CollectionPanel({
  data,
  busy,
  onRegister,
}: {
  data: WingsView
  busy: boolean
  onRegister: (itemId: string) => void
}) {
  return (
    <>
      <p>Register each wing and aura once for Plume Shards. The wing stays in your bag.</p>
      <ul
        aria-label="Wing Collection"
        className="grid max-h-[320px] grid-cols-2 gap-1 overflow-auto"
      >
        {data.collection.map((entry) => {
          const name = nameOf(entry.nameKey)
          return (
            <li key={entry.itemId} className="game-card flex items-center gap-2 p-1">
              <WingIcon itemId={entry.itemId} name={name} />
              <span className="flex-1">
                {name}
                <br />+{entry.reward} Plume Shards
              </span>
              {entry.registered ? (
                <span>Registered</span>
              ) : (
                <GameButton
                  small
                  disabled={busy || !entry.owned}
                  aria-label={`Register ${name}`}
                  onClick={() => onRegister(entry.itemId)}
                >
                  Register
                </GameButton>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
