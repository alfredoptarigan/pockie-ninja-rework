// Souls and Prayer tabs of the Bloodlines window (M5 task 10, decisions 15, 16).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { BloodlineLimit, SoulsView, SoulView } from '../../../../shared/src/schemas/bloodlines'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, gameKeys } from '../api'
import { Bar, GameButton, Notice } from '../skin'
import { bloodlinesKey, formatStat } from './index'

export const soulsKey = ['game', 'bloodlines', 'souls'] as const
export const soulIcon = (type: number) => `/assets/reborn/icons/bloodlines/souls/${type}.webp`
export const PRAYER_ATTRIBUTES = ['Strength', 'Agility', 'Stamina'] as const
/** Decision 16: attribute points per prayer level, in Reborn units. */
const PRAYER_BONUS_PER_LEVEL = 8

const text = names as Record<string, string>
const limitName = (limit: BloodlineLimit) => text[limit.nameKey] ?? `Bloodline ${limit.limitId}`

export function soulLabel(data: SoulsView, soul: Pick<SoulView, 'type' | 'level'>) {
  const type = data.types.find((t) => t.id === soul.type)
  if (!type) return `Soul Lv ${soul.level}`
  const name = text[type.nameKey] ?? `Soul ${type.id}`
  const stat = formatStat({
    field: type.field,
    label: type.label,
    value: type.valueByLevel[soul.level] ?? 0,
  })
  return `${name} Lv ${soul.level} (${stat})`
}

/** The souls query and one mutation helper; every action answers with the new SoulsView. */
function useSouls() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: soulsKey,
    queryFn: () => api<SoulsView>('/api/game/bloodlines/souls'),
  })
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      api<SoulsView>(`/api/game/bloodlines/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(soulsKey, result)
      // Sockets and prayer change the bloodline bonuses and the ninja's stats.
      void queryClient.invalidateQueries({ queryKey: bloodlinesKey, exact: true })
      void queryClient.invalidateQueries({ queryKey: gameKeys.stats })
    },
  })
  return { query, action }
}

/** Unlocked limits to pick from, with the picked one (first by default). */
function useLimitPick(limits: BloodlineLimit[]) {
  const unlocked = limits.filter((l) => l.unlocked)
  const [picked, pick] = useState<number | null>(null)
  const limit = unlocked.find((l) => l.limitId === picked) ?? unlocked[0]
  const select = (
    <label className="flex items-center gap-2">
      Bloodline
      <select
        className="game-card px-1"
        value={limit?.limitId ?? ''}
        onChange={(event) => pick(Number(event.target.value))}
      >
        {unlocked.map((l) => (
          <option key={l.limitId} value={l.limitId}>
            {limitName(l)}
            {l.active ? ' (active)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
  return { limit, select }
}

/** Loose souls with checkboxes; the selection keeps click order. */
function LooseSouls({
  data,
  selected,
  onChange,
}: {
  data: SoulsView
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const loose = data.souls
    .filter((s) => s.limitId === null)
    .sort((a, b) => a.level - b.level || a.type - b.type)
  if (loose.length === 0) return <p>No loose souls. Discover some first.</p>
  return (
    <ul aria-label="Loose souls" className="grid max-h-[160px] grid-cols-2 gap-1 overflow-auto">
      {loose.map((soul) => (
        <li key={soul.id}>
          <label className="game-card flex items-center gap-1 p-1">
            <input
              type="checkbox"
              checked={selected.includes(soul.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, soul.id]
                    : selected.filter((id) => id !== soul.id),
                )
              }
            />
            <img src={soulIcon(soul.type)} alt="" className="size-6" />
            {soulLabel(data, soul)}
          </label>
        </li>
      ))}
    </ul>
  )
}

export function SoulsPanel({ limits, level }: { limits: BloodlineLimit[]; level: number }) {
  const { query, action } = useSouls()
  const { limit, select } = useLimitPick(limits)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const data = query.data
  if (query.isPending) return <p>Loading souls...</p>
  if (!data) return <Notice tone="error">{errorMessage(query.error)}</Notice>
  const run = (path: string, body: object, done: string) =>
    action.mutate(
      { path, body },
      {
        onSuccess: () => {
          setSelected([])
          setMessage(done)
        },
      },
    )
  const left = data.discoverPerDay - data.discoveredToday
  const room = data.inventory - data.souls.length
  const discoverable = Math.min(left, room)
  const busy = action.isPending
  const first = data.souls.find((s) => s.id === selected[0])
  const socketed = limit ? data.souls.filter((s) => s.limitId === limit.limitId) : []
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="grow">
          Discoveries left today: {left}/{data.discoverPerDay}. Souls: {data.souls.length}/
          {data.inventory}.
        </span>
        <GameButton
          small
          disabled={busy || discoverable < 1}
          onClick={() => run('souls/discover', { count: 1 }, 'Soul discovered.')}
        >
          Discover
        </GameButton>
        <GameButton
          small
          disabled={busy || discoverable < 2}
          onClick={() =>
            run('souls/discover', { count: discoverable }, `${discoverable} souls discovered.`)
          }
        >
          Discover all
        </GameButton>
      </div>
      {limit ? (
        <section className="game-card flex flex-col gap-1 p-2">
          {select}
          <ul aria-label="Soul sockets" className="grid grid-cols-5 gap-1">
            {Array.from({ length: data.socketsPerLimit }, (_, i) =>
              socketed.find((s) => s.socket === i),
            ).map((soul, i) => (
              <li
                key={soul?.id ?? `empty-${i}`}
                className="game-card flex flex-col items-center p-1"
              >
                {soul ? (
                  <>
                    <img src={soulIcon(soul.type)} alt="" className="size-8" />
                    <span className="text-center text-[11px]">{soulLabel(data, soul)}</span>
                    <GameButton
                      small
                      disabled={busy}
                      onClick={() => run(`souls/${soul.id}/unbind`, {}, 'Soul unbound.')}
                    >
                      Unbind
                    </GameButton>
                  </>
                ) : (
                  <span className="py-4 text-[#5c5c5c]">Empty</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p>Unlock a bloodline at the Ninja House to socket souls.</p>
      )}
      <LooseSouls data={data} selected={selected} onChange={setSelected} />
      <p className="text-[11px]">
        Synthesis turns each 3 souls of one level into 1 soul one level higher. Refine changes the
        first selected soul to another type and uses up the others (same level). One soul of each
        type per bloodline; soul level {data.levelLimits.length} needs character level{' '}
        {data.levelLimits.at(-1)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <GameButton
          small
          disabled={
            busy ||
            !limit ||
            !first ||
            selected.length !== 1 ||
            level < (data.levelLimits[first.level - 1] ?? Infinity)
          }
          onClick={() =>
            run(`souls/${selected[0]}/bind`, { limitId: limit!.limitId }, 'Soul socketed.')
          }
        >
          Bind
        </GameButton>
        <GameButton
          small
          disabled={busy || selected.length === 0 || selected.length % 3 !== 0}
          onClick={() => run('souls/synthesize', { soulIds: selected }, 'Synthesis complete.')}
        >
          Synthesize
        </GameButton>
        <GameButton
          small
          disabled={busy || selected.length < 2}
          onClick={() =>
            run(
              'souls/refine',
              { targetId: selected[0], fuelIds: selected.slice(1) },
              'Soul refined.',
            )
          }
        >
          Refine
        </GameButton>
        <GameButton
          small
          disabled={busy || selected.length === 0}
          onClick={() => run('souls/destroy', { soulIds: selected }, 'Souls destroyed.')}
        >
          Destroy
        </GameButton>
      </div>
      {action.error && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      {message && !action.error && <Notice>{message}</Notice>}
    </>
  )
}

export function PrayerPanel({ limits }: { limits: BloodlineLimit[] }) {
  const { query, action } = useSouls()
  const { limit, select } = useLimitPick(limits)
  const [selected, setSelected] = useState<string[]>([])
  const [chosen, choose] = useState<number | null>(null)
  const data = query.data
  if (query.isPending) return <p>Loading prayer...</p>
  if (!data) return <Notice tone="error">{errorMessage(query.error)}</Notice>
  if (!limit) return <p>Unlock a bloodline at the Ninja House to pray.</p>
  const prayer = data.prayers.find((p) => p.limitId === limit.limitId)
  const attribute = chosen ?? prayer?.attribute ?? 1
  const switching = prayer !== undefined && prayer.attribute !== attribute
  const points = selected.reduce((sum, id) => {
    const soul = data.souls.find((s) => s.id === id)
    return sum + (soul ? (data.prayerPoints[soul.level - 1] ?? 0) : 0)
  }, 0)
  const atMax = !switching && (prayer?.level ?? 0) >= data.prayerMaxLevel
  return (
    <>
      <section className="game-card flex flex-col gap-1 p-2">
        {select}
        <label className="flex items-center gap-2">
          Attribute
          <select
            className="game-card px-1"
            value={attribute}
            onChange={(event) => choose(Number(event.target.value))}
          >
            {PRAYER_ATTRIBUTES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {prayer ? (
          <>
            <p>
              {PRAYER_ATTRIBUTES[prayer.attribute - 1]} prayer level {prayer.level}/
              {data.prayerMaxLevel}: {PRAYER_ATTRIBUTES[prayer.attribute - 1]} +
              {prayer.level * PRAYER_BONUS_PER_LEVEL}.
            </p>
            {prayer.needed > 0 && (
              <Bar label="Prayer" kind="exp" value={prayer.progress} max={prayer.needed} />
            )}
          </>
        ) : (
          <p>No prayer on this bloodline yet.</p>
        )}
        {switching && (
          <Notice tone="error">Switching the attribute resets this prayer to level 0.</Notice>
        )}
      </section>
      <LooseSouls data={data} selected={selected} onChange={setSelected} />
      <div className="flex items-center gap-2">
        <span className="grow">Selected souls give {points} prayer points.</span>
        <GameButton
          disabled={action.isPending || selected.length === 0 || atMax}
          onClick={() =>
            action.mutate(
              { path: `${limit.limitId}/prayer`, body: { attribute, soulIds: selected } },
              { onSuccess: () => setSelected([]) },
            )
          }
        >
          Pray
        </GameButton>
      </div>
      {action.error && <Notice tone="error">{errorMessage(action.error)}</Notice>}
    </>
  )
}
