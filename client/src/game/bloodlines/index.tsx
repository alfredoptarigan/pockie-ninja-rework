// Bloodlines window (M5 task 7): the Ninja House (44 NPCs, item turn-ins) and the Bloodline
// panel (3 active slots and their summed bonuses), plus the Souls and Prayer tabs (souls.tsx).
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  BloodlineLimit,
  BloodlinesView,
  BloodlineStat,
  BloodlineTurnInResult,
} from '../../../../shared/src/schemas/bloodlines'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { ItemIcon } from '../ItemIcon'
import { Bar, Dialog, GameButton, Notice, Tabs } from '../skin'
import { PrayerPanel, SoulsPanel } from './souls'

export const bloodlinesKey = ['game', 'bloodlines'] as const
/** Reborn art (client/src/generated/reborn-assets.json, categories "bloodline" and "npc"). */
export const limitIcon = (id: number) => `/assets/reborn/icons/bloodlines/limits/${id}.webp`
export const npcIcon = (npcId: number) => `/assets/reborn/icons/npc/${npcId}.webp`

/** Names of the 18 limit items (glossary defaults; the 2011 item rows have no English name). */
export const LIMIT_ITEM_NAMES: Record<string, string> = {
  i148023: 'Kebab Flavored Chips',
  i148024: 'ANBU Mask',
  i148025: 'Family Badge',
  i148026: 'Secret Letter',
  i148027: 'Shogi',
  i148028: 'First Aid Kit',
  i148029: 'Puppet',
  i148030: 'Kunai',
  i148031: 'Scroll of Seal',
  i148032: 'Organization Money',
  i148033: 'Landscape Painting',
  i148034: 'Nutrition Pills',
  i148035: 'Explosive Seal',
  i148036: 'Mysterious Weapon Bags',
  i148037: 'Scroll of Spiritual Weapons',
  i148038: "Jinchuriki's Note",
  i148039: 'Contract for Summoning',
  i148040: 'Forbidden Scroll',
}

const text = names as Record<string, string>
const limitName = (limit: BloodlineLimit) => text[limit.nameKey] ?? `Bloodline ${limit.limitId}`
const npcName = (limit: BloodlineLimit) => text[limit.npcNameKey] ?? limitName(limit)

/** Attributes are x100 internally; per-mille terms show as tenths of a percent. */
const ATTRIBUTES = new Set(['strength', 'agility', 'stamina'])
const PER_MILLE = new Set(['hpMul', 'attackMul', 'atkTimeMul'])

export function formatStat({ field, label, value }: BloodlineStat) {
  const percent = label.endsWith('%')
  const name = percent ? label.slice(0, -1).trimEnd() : label
  const shown = ATTRIBUTES.has(field) ? value / 100 : PER_MILLE.has(field) ? value / 10 : value
  return `${name} +${Number(shown.toFixed(2))}${percent ? '%' : ''}`
}

type Tab = 'house' | 'active' | 'souls' | 'prayer'

export function BloodlinesWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [tab, setTab] = useState<Tab>('house')
  const [selected, select] = useState(1)
  const [message, setMessage] = useState('')
  const bloodlines = useQuery({
    queryKey: bloodlinesKey,
    queryFn: () => api<BloodlinesView>('/api/game/bloodlines'),
  })
  const turnIn = useMutation({
    mutationFn: (id: number) =>
      api<BloodlineTurnInResult>(`/api/game/bloodlines/${id}/turn-in`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result, id) => {
      const limit = result.limits.find((l) => l.limitId === id)
      setMessage(limit?.unlocked ? 'Bloodline unlocked.' : `+${result.amityPerTurnIn} Amity.`)
      queryClient.setQueryData(bloodlinesKey, result)
      apply(result)
    },
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api<BloodlinesView>(`/api/game/bloodlines/${id}/active`, {
        method: 'POST',
        body: { active },
      }),
    onSuccess: (result) => {
      setMessage('')
      queryClient.setQueryData(bloodlinesKey, result)
      // The character's fight stats change with the active limits.
      apply({ character })
    },
  })
  const data = bloodlines.data
  const limit = data?.limits.find((l) => l.limitId === selected)
  const busy = turnIn.isPending || toggle.isPending
  const active = data?.limits.filter((l) => l.active) ?? []
  const error = bloodlines.error ?? turnIn.error ?? toggle.error
  const panelId = 'bloodlines-panel'
  return (
    <Dialog title="Bloodlines" onClose={onClose} className="game-window-bare w-[600px]">
      <Tabs
        label="Bloodlines"
        panelId={panelId}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'house', title: 'Ninja House' },
          { id: 'active', title: 'Bloodlines' },
          { id: 'souls', title: 'Souls' },
          { id: 'prayer', title: 'Prayer' },
        ]}
      />
      <div
        id={panelId}
        role="tabpanel"
        className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black"
      >
        {bloodlines.isPending && <p>Loading bloodlines...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {data && tab === 'house' && (
          <>
            <p>
              Turn-ins left today: {data.turnInsPerDay - data.turnInsUsed}/{data.turnInsPerDay}. Win
              pub fights to find the items.
            </p>
            <ul
              aria-label="Ninja House"
              className="grid max-h-[220px] grid-cols-11 gap-1 overflow-auto"
            >
              {data.limits.map((entry) => (
                <li key={entry.limitId}>
                  <button
                    type="button"
                    aria-label={`${npcName(entry)}: ${limitName(entry)}`}
                    aria-pressed={entry.limitId === selected}
                    onClick={() => select(entry.limitId)}
                    className={`game-card relative grid size-11 place-items-center ${
                      entry.limitId === selected ? 'outline-2 outline-[#c98a1a]' : ''
                    } ${entry.unlocked ? '' : 'grayscale-[60%]'}`}
                  >
                    <img src={npcIcon(entry.npcId)} alt="" className="max-h-full max-w-full" />
                  </button>
                </li>
              ))}
            </ul>
            {limit && (
              <LimitCard
                limit={limit}
                data={data}
                level={character.level}
                busy={busy}
                activeCount={active.length}
                onTurnIn={() => turnIn.mutate(limit.limitId)}
                onToggle={() => toggle.mutate({ id: limit.limitId, active: !limit.active })}
              />
            )}
          </>
        )}
        {data && tab === 'active' && (
          <>
            <ul aria-label="Active bloodlines" className="grid grid-cols-3 gap-2">
              {Array.from({ length: data.maxActive }, (_, i) => active[i]).map((entry, i) => (
                <li
                  key={entry?.limitId ?? `empty-${i}`}
                  className="game-card flex flex-col items-center gap-1 p-2"
                >
                  {entry ? (
                    <>
                      <img src={limitIcon(entry.limitId)} alt="" className="size-12" />
                      <span className="text-center font-bold">{limitName(entry)}</span>
                      <GameButton
                        small
                        disabled={busy}
                        onClick={() => toggle.mutate({ id: entry.limitId, active: false })}
                      >
                        Deactivate
                      </GameButton>
                    </>
                  ) : (
                    <span className="py-6 text-[#5c5c5c]">Empty slot</span>
                  )}
                </li>
              ))}
            </ul>
            <section className="game-card p-2">
              <h3 className="font-bold">Bonuses</h3>
              {data.bonuses.length === 0 ? (
                <p>Activate an unlocked bloodline at the Ninja House.</p>
              ) : (
                <ul aria-label="Bloodline bonuses" className="grid grid-cols-2 gap-x-4">
                  {data.bonuses.map((stat) => (
                    <li key={stat.field}>{formatStat(stat)}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {data && tab === 'souls' && <SoulsPanel limits={data.limits} level={character.level} />}
        {data && tab === 'prayer' && <PrayerPanel limits={data.limits} />}
        {message && tab !== 'souls' && tab !== 'prayer' && <Notice>{message}</Notice>}
      </div>
      <div className="mt-[10px] flex justify-end">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}

function LimitCard({
  limit,
  data,
  level,
  busy,
  activeCount,
  onTurnIn,
  onToggle,
}: {
  limit: BloodlineLimit
  data: BloodlinesView
  level: number
  busy: boolean
  activeCount: number
  onTurnIn: () => void
  onToggle: () => void
}) {
  const itemName = LIMIT_ITEM_NAMES[limit.unlockItem] ?? limit.unlockItem
  const tooLow = level < limit.requiredLevel
  return (
    <section aria-label={limitName(limit)} className="game-card flex gap-2 p-2">
      <img src={limitIcon(limit.limitId)} alt="" className="size-14 shrink-0" />
      <div className="flex grow flex-col gap-1">
        <h3 className="font-bold">
          {limitName(limit)} ({npcName(limit)})
        </h3>
        <p>
          Required level {limit.requiredLevel}.{limit.unlocked ? ' Unlocked.' : ''}
          {limit.active ? ' Active.' : ''}
        </p>
        <ul className="grid grid-cols-2 gap-x-4">
          {limit.stats.map((stat) => (
            <li key={stat.field}>{formatStat(stat)}</li>
          ))}
        </ul>
        {limit.unlocked ? (
          <GameButton
            disabled={busy || tooLow || (!limit.active && activeCount >= data.maxActive)}
            onClick={onToggle}
          >
            {limit.active ? 'Deactivate' : 'Activate'}
          </GameButton>
        ) : (
          <>
            <Bar label="Amity" kind="exp" value={limit.amity} max={limit.amityNeeded} />
            <div className="flex items-center gap-2">
              <ItemIcon itemId={limit.unlockItem} name={itemName} className="size-8" />
              <span>
                {itemName}: {limit.itemsHeld}/{data.itemsPerTurnIn}
              </span>
              <GameButton
                disabled={
                  busy ||
                  tooLow ||
                  limit.itemsHeld < data.itemsPerTurnIn ||
                  data.turnInsUsed >= data.turnInsPerDay
                }
                onClick={onTurnIn}
              >
                Turn in {data.itemsPerTurnIn}
              </GameButton>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
