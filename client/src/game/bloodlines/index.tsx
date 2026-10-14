// Reborn's Bloodline Limits window (reborn-windows-A-L.md, "Bloodline Limits"; WM key
// `bloodline`, the Inventory's Blood Limit button): 660x500, tabs Limits and Souls over a BigBG3
// footer with the Active bar. Limits: the collection grid (50x50 slots by required level, the
// uncollected ones locked) and the selected limit's header, Activate / Deactivate, its equipped
// souls with Manage, and its stat totals (limit + souls + prayer). The turn-ins live in the Ninja
// House (ninja-house.tsx); souls, prayer, Soul Synthesis and Soul Refine in souls.tsx.
// ponytail: Reborn's five bloodline presets need a server preset store we do not have; the
// footer shows the summed bonuses of the active limits there instead.
import type { Character } from '@pockie/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type KeyboardEvent } from 'react'
import type {
  BloodlineLimit,
  BloodlinesView,
  BloodlineStat,
  SoulsView,
} from '../../../../shared/src/schemas/bloodlines'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { useBloodlines } from './ninja-house'
import { bigBg } from './panels'
import { PRAYER_BONUS_PER_LEVEL, soulIcon, SoulsTab, soulLabel, useSouls } from './souls'

export const bloodlinesKey = ['game', 'bloodlines'] as const
/** Reborn art (client/src/generated/reborn-assets.json, categories "bloodline" and "npc"). */
export const limitIcon = (id: number) => `/assets/reborn/icons/bloodlines/limits/${id}.webp`
export const npcIcon = (npcId: number) => `/assets/reborn/icons/npc/${npcId}.webp`

/** Names of the 18 limit items (glossary defaults; the 2011 item rows have no English name). */
export const LIMIT_ITEM_NAMES: Record<string, string> = {
  i148023: 'Kebab-Flavored Chips',
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
  i148039: 'Summoning Contract',
  i148040: 'Forbidden Scroll',
}

const text = names as Record<string, string>
export const limitName = (limit: BloodlineLimit) =>
  text[limit.nameKey] ?? `Bloodline ${limit.limitId}`
export const npcName = (limit: BloodlineLimit) => text[limit.npcNameKey] ?? limitName(limit)
/** Two bloodlines share the names Byakugan and Mangekyo Sharingan, so lists add the teacher. */
export const limitLabel = (limit: BloodlineLimit) => `${limitName(limit)} (${npcName(limit)})`

/** Attributes are x100 internally; per-mille terms show as tenths of a percent. */
const ATTRIBUTES = new Set(['strength', 'agility', 'stamina'])
const PER_MILLE = new Set(['hpMul', 'attackMul', 'atkTimeMul'])
const PRAYER_FIELDS = ['strength', 'agility', 'stamina'] as const
const ATTRIBUTE_UNIT = 100

export function formatStat({ field, label, value }: BloodlineStat) {
  const percent = label.endsWith('%')
  const name = percent ? label.slice(0, -1).trimEnd() : label
  const shown = ATTRIBUTES.has(field) ? value / 100 : PER_MILLE.has(field) ? value / 10 : value
  return `${name} +${Number(shown.toFixed(2))}${percent ? '%' : ''}`
}

/** One limit's stat table: its own stats, plus its socketed souls and its prayer. */
export function limitTotals(limit: BloodlineLimit, souls?: SoulsView): BloodlineStat[] {
  const totals = new Map(limit.stats.map((stat) => [stat.field, { ...stat }]))
  const add = (field: string, label: string, value: number) => {
    const stat = totals.get(field)
    totals.set(field, { field, label: stat?.label ?? label, value: (stat?.value ?? 0) + value })
  }
  for (const soul of souls?.souls.filter((s) => s.limitId === limit.limitId) ?? []) {
    const type = souls!.types.find((t) => t.id === soul.type)
    if (type) add(type.field, type.label, type.valueByLevel[soul.level] ?? 0)
  }
  const prayer = souls?.prayers.find((p) => p.limitId === limit.limitId)
  if (prayer?.level) {
    const field = PRAYER_FIELDS[prayer.attribute - 1]!
    const label = field[0]!.toUpperCase() + field.slice(1)
    add(field, label, prayer.level * PRAYER_BONUS_PER_LEVEL * ATTRIBUTE_UNIT)
  }
  return [...totals.values()]
}

type Tab = 'limits' | 'souls'
const byLevel = (a: BloodlineLimit, b: BloodlineLimit) =>
  a.requiredLevel - b.requiredLevel || a.limitId - b.limitId
const ACTIVE_SLOT_X = [45, 100, 155]

export function BloodlinesWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [tab, setTab] = useState<Tab>('limits')
  const [selected, select] = useState<number | null>(null)
  const bloodlines = useBloodlines()
  const souls = useSouls().query.data
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api<BloodlinesView>(`/api/game/bloodlines/${id}/active`, {
        method: 'POST',
        body: { active },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(bloodlinesKey, result)
      // The character's fight stats change with the active limits.
      apply({ character })
    },
  })
  const data = bloodlines.data
  const limit = data?.limits.find((l) => l.limitId === selected)
  const active = data?.limits.filter((l) => l.active) ?? []
  const error = bloodlines.error ?? toggle.error
  const panelId = 'bloodlines-panel'
  const openSouls = (id: number) => {
    select(id)
    setTab('souls')
  }
  return (
    <Dialog title="Bloodline Limits" onClose={onClose} className="game-window-bare w-[670px]">
      <div data-menu-root className="relative w-[660px] text-[12px] text-black">
        <Tabs
          label="Bloodline Limits"
          panelId={panelId}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'limits', title: 'Limits' },
            { id: 'souls', title: 'Souls' },
          ]}
        />
        <div id={panelId} role="tabpanel" className="h-[402px] w-[660px] p-[5px]" style={bigBg(1)}>
          {bloodlines.isPending && <p>Loading bloodlines...</p>}
          {error && <Notice tone="error">{errorMessage(error)}</Notice>}
          {data && tab === 'limits' && (
            <div className="flex gap-[8px]">
              <Collection
                limits={data.limits}
                selected={selected}
                onSelect={select}
                onOpen={openSouls}
              />
              <section
                aria-label="Selected limit"
                className="flex h-[392px] w-[326px] flex-col gap-2 p-[10px]"
                style={bigBg(3)}
              >
                {limit ? (
                  <>
                    <LimitHeader
                      limit={limit}
                      level={character.level}
                      busy={toggle.isPending}
                      full={active.length >= data.maxActive}
                      onToggle={() => toggle.mutate({ id: limit.limitId, active: !limit.active })}
                    />
                    <div className="flex items-center gap-2">
                      <h3 className="grow font-bold">Souls Equipped</h3>
                      <GameButton small className="h-5 w-[65px]" onClick={() => setTab('souls')}>
                        Manage
                      </GameButton>
                    </div>
                    <ul aria-label="Souls equipped" className="flex min-h-9 gap-1">
                      {souls?.souls
                        .filter((s) => s.limitId === limit.limitId)
                        .map((soul) => (
                          <li key={soul.id} title={soulLabel(souls, soul)}>
                            <img
                              src={soulIcon(soul.type)}
                              alt={soulLabel(souls, soul)}
                              className="game-slot size-9 p-0.5"
                            />
                          </li>
                        ))}
                    </ul>
                    <ul
                      aria-label="Limit stats"
                      className="grid grid-cols-2 gap-x-3 gap-y-0.5 overflow-auto"
                    >
                      {limitTotals(limit, souls).map((stat) => (
                        <li key={stat.field}>{formatStat(stat)}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="m-auto text-[#5c4a2a]">Select a limit from your collection</p>
                )}
              </section>
            </div>
          )}
          {data && tab === 'souls' && <SoulsTab limit={limit} level={character.level} />}
        </div>
        {data && (
          <footer className="relative mt-[6px] h-[66px] w-[660px]" style={bigBg(3)}>
            <span className="absolute top-[24px] left-[8px] font-bold">Active</span>
            <ul aria-label="Active bloodlines">
              {ACTIVE_SLOT_X.map((x, i) => {
                const entry = active[i]
                return (
                  <li key={x} className="absolute top-[8px]" style={{ left: x }}>
                    <button
                      type="button"
                      aria-label={entry ? limitLabel(entry) : 'Empty slot'}
                      disabled={!entry}
                      onClick={() => {
                        if (!entry) return
                        select(entry.limitId)
                        setTab('limits')
                      }}
                      className="game-slot grid size-[50px] place-items-center"
                    >
                      {entry && <img src={limitIcon(entry.limitId)} alt="" className="size-11" />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <ul
              aria-label="Bloodline bonuses"
              className="absolute top-[6px] left-[220px] grid h-[54px] w-[430px] grid-cols-3 gap-x-2 overflow-auto text-[11px] leading-[13px]"
            >
              {data.bonuses.length === 0 ? (
                <li className="col-span-3 text-[#5c4a2a]">
                  Activate a collected limit to see its bonuses.
                </li>
              ) : (
                data.bonuses.map((stat) => <li key={stat.field}>{formatStat(stat)}</li>)
              )}
            </ul>
          </footer>
        )}
      </div>
    </Dialog>
  )
}

function Collection({
  limits,
  selected,
  onSelect,
  onOpen,
}: {
  limits: BloodlineLimit[]
  selected: number | null
  onSelect: (id: number) => void
  onOpen: (id: number) => void
}) {
  const collected = limits.filter((l) => l.unlocked).length
  const onKey = (event: KeyboardEvent, id: number) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onOpen(id)
  }
  return (
    <section
      aria-label="Collection"
      className="flex h-[392px] w-[316px] flex-col gap-1 p-[10px]"
      style={bigBg(3)}
    >
      <h3 className="font-bold">
        Collected {collected}/{limits.length}
      </h3>
      <ul aria-label="Limits" className="grid grid-cols-5 gap-[6px] overflow-auto pr-1">
        {[...limits].sort(byLevel).map((limit) => (
          <li key={limit.limitId}>
            <button
              type="button"
              aria-label={`${limitLabel(limit)}${limit.unlocked ? '' : ' (locked)'}`}
              aria-pressed={limit.limitId === selected}
              title={`${limitLabel(limit)}, level ${limit.requiredLevel}`}
              onClick={() => onSelect(limit.limitId)}
              onDoubleClick={() => onOpen(limit.limitId)}
              onKeyDown={(event) => onKey(event, limit.limitId)}
              className={`game-slot relative grid size-[50px] place-items-center ${
                limit.limitId === selected ? 'outline-2 outline-[#c98a1a]' : ''
              }`}
            >
              <img
                src={limitIcon(limit.limitId)}
                alt=""
                className={`size-11 ${limit.unlocked ? '' : 'opacity-60 grayscale'}`}
              />
              {!limit.unlocked && (
                <span
                  aria-hidden="true"
                  className="game-skill-lock absolute right-0 bottom-0 size-4"
                />
              )}
              {limit.active && (
                <span className="absolute top-0 left-0.5 text-[9px] font-bold text-[#7dff6a]">
                  ON
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LimitHeader({
  limit,
  level,
  busy,
  full,
  onToggle,
}: {
  limit: BloodlineLimit
  level: number
  busy: boolean
  full: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <img src={limitIcon(limit.limitId)} alt="" className="game-slot size-[50px] p-0.5" />
      <div className="grow">
        <h3 className="font-bold">{limitLabel(limit)}</h3>
        <p>Required Level: {limit.requiredLevel}</p>
        {!limit.unlocked && <p className="text-[#5c4a2a]">Collect it at the Ninja House.</p>}
      </div>
      <GameButton
        disabled={
          busy || !limit.unlocked || (!limit.active && (full || level < limit.requiredLevel))
        }
        onClick={onToggle}
      >
        {limit.active ? 'Deactivate' : 'Activate'}
      </GameButton>
    </div>
  )
}
