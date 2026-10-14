// Souls tab of Reborn's Bloodline Limits window (reborn-windows-A-L.md, "Bloodline Limits"): a
// BigBG3 header with the selected limit, its five soul sockets and the Prayer controls, over the
// BigBG3 soul inventory: "Soul Inventory (n/max)", Synth (Soul Synthesis), Discover (n/max),
// search, Eligible, sort and level / stat filters, and 50x50 soul tiles. Clicking a soul opens its
// menu (Bind, Synthesize, Refine, Destroy; Remove on a socketed one); in Prayer mode clicking
// picks souls to Submit. Our rules (M5 decisions 15, 16) stay as the server checks them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type MouseEvent } from 'react'
import type { BloodlineLimit, SoulsView, SoulView } from '../../../../shared/src/schemas/bloodlines'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, gameKeys } from '../api'
import { ConfirmDialog } from '../inventory/dialogs'
import { ItemMenu, menuAt, type MenuEntry } from '../ItemMenu'
import { GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import { bloodlinesKey, formatStat, limitIcon, limitLabel } from './index'
import { bigBg } from './panels'
import { SoulRefineDialog, SoulSynthesisDialog } from './soul-dialogs'

export const soulsKey = ['game', 'bloodlines', 'souls'] as const
export const soulIcon = (type: number) => `/assets/reborn/icons/bloodlines/souls/${type}.webp`
export const PRAYER_ATTRIBUTES = ['Strength', 'Agility', 'Stamina'] as const
/** Decision 16: attribute points per prayer level, in Reborn units. */
export const PRAYER_BONUS_PER_LEVEL = 8

const text = names as Record<string, string>
const typeOf = (data: SoulsView, soul: Pick<SoulView, 'type'>) =>
  data.types.find((t) => t.id === soul.type)
export const soulName = (data: SoulsView, soul: Pick<SoulView, 'type'>) => {
  const type = typeOf(data, soul)
  return type ? (text[type.nameKey] ?? `Soul ${type.id}`) : 'Soul'
}

export function soulLabel(data: SoulsView, soul: Pick<SoulView, 'type' | 'level'>) {
  const type = typeOf(data, soul)
  if (!type) return `Soul Lv. ${soul.level}`
  const stat = formatStat({
    field: type.field,
    label: type.label,
    value: type.valueByLevel[soul.level] ?? 0,
  })
  return `${soulName(data, soul)} Lv. ${soul.level} (${stat})`
}

export type RunSoulAction = (path: string, body: object, done?: string) => Promise<SoulsView>

/** The souls query and one action helper; every action answers with the new SoulsView. */
export function useSouls() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: soulsKey,
    queryFn: () => api<SoulsView>('/api/game/bloodlines/souls'),
  })
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object; done?: string }) =>
      api<SoulsView>(`/api/game/bloodlines/${path}`, { method: 'POST', body }),
    onSuccess: (result, { done }) => {
      queryClient.setQueryData(soulsKey, result)
      if (done) showToast(done, 'success')
      // Sockets and prayer change the bloodline bonuses and the ninja's stats.
      void queryClient.invalidateQueries({ queryKey: bloodlinesKey, exact: true })
      void queryClient.invalidateQueries({ queryKey: gameKeys.stats })
    },
  })
  const run: RunSoulAction = (path, body, done) => action.mutateAsync({ path, body, done })
  return { query, action, run }
}

/** Errors show in the tab (action.error); the promise only sequences follow-ups. */
export const quiet = (promise: Promise<unknown>) => void promise.catch(() => {})

type Sort = 'levelDesc' | 'levelAsc' | 'stat' | 'name'
const SORTS: { id: Sort; label: string }[] = [
  { id: 'levelDesc', label: 'Level ↓' },
  { id: 'levelAsc', label: 'Level ↑' },
  { id: 'stat', label: 'Stat' },
  { id: 'name', label: 'Name' },
]

/** A 50x50 soul tile: icon and "Lv.N" at the bottom right; `order` marks a picked soul. */
export function SoulTile({
  data,
  soul,
  pressed,
  order,
  onClick,
}: {
  data: SoulsView
  soul: SoulView
  pressed?: boolean
  order?: number
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      aria-label={soulLabel(data, soul)}
      aria-pressed={pressed}
      title={soulLabel(data, soul)}
      onClick={onClick}
      onContextMenu={onClick}
      className="game-slot relative grid size-[50px] shrink-0 place-items-center"
    >
      <img src={soulIcon(soul.type)} alt="" className="w-[45px]" />
      <span className="absolute right-[2px] bottom-0 text-[9px] font-bold">Lv.{soul.level}</span>
      {pressed && (
        <span className="absolute inset-0 grid place-items-center bg-[rgba(168,85,247,0.35)] text-[13px] font-black text-[#a855f7] [text-shadow:0_0_2px_#fff]">
          {order}
        </span>
      )}
    </button>
  )
}

type Menu = { title: string; entries: MenuEntry[]; at: { x: number; y: number } }
type Confirm = { text: string; onAccept: () => void }

export function SoulsTab({ limit, level }: { limit?: BloodlineLimit; level: number }) {
  const { query, action, run } = useSouls()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [praying, setPraying] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [chosen, choose] = useState<number | null>(null)
  const [synth, setSynth] = useState<string[] | null>(null)
  const [refining, setRefining] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [eligible, setEligible] = useState(false)
  const [sort, setSort] = useState<Sort>('levelDesc')
  const [levelFilter, setLevelFilter] = useState(0)
  const [statFilter, setStatFilter] = useState('')
  const data = query.data
  if (query.isPending) return <p>Loading souls...</p>
  if (!data) return <Notice tone="error">{errorMessage(query.error)}</Notice>
  const usable = limit?.unlocked ? limit : undefined
  const socketed = usable ? data.souls.filter((s) => s.limitId === usable.limitId) : []
  const gate = (soul: SoulView) => data.levelLimits[soul.level - 1] ?? Infinity
  const bindReason = (soul: SoulView) =>
    !usable
      ? 'Select a collected limit first.'
      : level < gate(soul)
        ? `Needs character level ${gate(soul)}.`
        : socketed.some((s) => s.type === soul.type)
          ? 'This limit already holds a soul of that type.'
          : socketed.length >= data.socketsPerLimit
            ? 'All soul sockets of this limit are full.'
            : undefined
  const loose = data.souls.filter((s) => s.limitId === null)
  const shown = loose
    .filter(
      (soul) =>
        (!search || soulLabel(data, soul).toLowerCase().includes(search.toLowerCase())) &&
        (!eligible || !bindReason(soul)) &&
        (!levelFilter || soul.level === levelFilter) &&
        (!statFilter || typeOf(data, soul)?.label === statFilter),
    )
    .sort((a, b) => {
      if (sort === 'levelAsc') return a.level - b.level || a.type - b.type
      if (sort === 'stat')
        return (typeOf(data, a)?.label ?? '').localeCompare(typeOf(data, b)?.label ?? '')
      if (sort === 'name') return soulName(data, a).localeCompare(soulName(data, b))
      return b.level - a.level || a.type - b.type
    })
  const busy = action.isPending
  const prayer = usable ? data.prayers.find((p) => p.limitId === usable.limitId) : undefined
  const attribute = chosen ?? prayer?.attribute ?? 1
  const switching =
    prayer !== undefined &&
    prayer.attribute !== attribute &&
    (prayer.level > 0 || prayer.progress > 0)
  const atMax = !switching && (prayer?.level ?? 0) >= data.prayerMaxLevel
  const points = picked.reduce((sum, id) => {
    const soul = data.souls.find((s) => s.id === id)
    return sum + (soul ? (data.prayerPoints[soul.level - 1] ?? 0) : 0)
  }, 0)
  const stats = [...new Set(data.types.map((t) => t.label))]
  const pray = () =>
    quiet(
      run(`${usable!.limitId}/prayer`, { attribute, soulIds: picked }, 'Prayer submitted.').then(
        () => setPicked([]),
      ),
    )
  const looseMenu = (soul: SoulView, title: string): MenuEntry[] => {
    const reason = bindReason(soul)
    const sameLevel = loose.some((s) => s.id !== soul.id && s.level === soul.level)
    return [
      {
        label: 'Bind',
        disabled: busy || reason !== undefined,
        reason,
        onSelect: () =>
          quiet(run(`souls/${soul.id}/bind`, { limitId: usable!.limitId }, 'Soul socketed.')),
      },
      {
        label: 'Synthesize',
        onSelect: () => {
          const slots = (synth ?? []).filter((id) => id !== soul.id)
          setSynth(slots.length < 3 ? [...slots, soul.id] : slots)
        },
      },
      {
        label: 'Refine',
        disabled: !sameLevel,
        reason: sameLevel ? undefined : 'Needs another soul of the same level.',
        onSelect: () => setRefining(soul.id),
      },
      {
        label: 'Destroy',
        onSelect: () =>
          setConfirm({
            text: `Destroy ${title}?`,
            onAccept: () => quiet(run('souls/destroy', { soulIds: [soul.id] }, 'Soul destroyed.')),
          }),
      },
    ]
  }
  const openMenu = (event: MouseEvent<HTMLButtonElement>, soul: SoulView) => {
    const title = soulLabel(data, soul)
    setMenu({
      title,
      at: menuAt(event),
      entries:
        soul.limitId === null
          ? looseMenu(soul, title)
          : [
              {
                label: 'Remove',
                onSelect: () => quiet(run(`souls/${soul.id}/unbind`, {}, 'Soul removed.')),
              },
            ],
    })
  }
  return (
    <div className="flex flex-col gap-[6px]">
      <section aria-label="Soul sockets" className="relative h-[86px] w-[650px]" style={bigBg(3)}>
        {limit ? (
          <>
            <img
              src={limitIcon(limit.limitId)}
              alt=""
              className="game-slot absolute top-[8px] left-[8px] size-[50px] p-0.5"
            />
            <p className="absolute top-[6px] left-[65px] w-[230px] truncate font-bold">
              {limitLabel(limit)}
            </p>
            <p className="absolute top-[21px] left-[65px]">Required Level: {limit.requiredLevel}</p>
          </>
        ) : (
          <p className="absolute top-[8px] left-[10px] w-[280px]">
            Select a collected limit in the Limits tab to bind souls and pray.
          </p>
        )}
        {usable && (
          <ul aria-label="Sockets" className="absolute top-[40px] left-[65px] flex gap-[4px]">
            {Array.from({ length: data.socketsPerLimit }, (_, i) => {
              const soul = socketed.find((s) => s.socket === i)
              return (
                <li key={i}>
                  {soul ? (
                    <button
                      type="button"
                      aria-label={soulLabel(data, soul)}
                      title={soulLabel(data, soul)}
                      onClick={(event) => openMenu(event, soul)}
                      onContextMenu={(event) => openMenu(event, soul)}
                      className="game-slot relative grid size-[34px] place-items-center"
                    >
                      <img src={soulIcon(soul.type)} alt="" className="size-[30px]" />
                      <span className="absolute right-0 bottom-0 text-[8px]">Lv.{soul.level}</span>
                    </button>
                  ) : (
                    <span className="game-slot block size-[34px]" title="Empty socket" />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <div className="absolute top-[6px] left-[300px] flex w-[342px] flex-col gap-1">
          <div className="flex items-center gap-2">
            <GameButton
              small
              aria-pressed={praying}
              disabled={!usable}
              onClick={() => {
                setPraying(!praying)
                setPicked([])
              }}
            >
              Prayer
            </GameButton>
            {praying && usable && (
              <>
                <label className="flex items-center gap-1">
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
                <GameButton
                  small
                  disabled={busy || picked.length === 0 || atMax}
                  onClick={() =>
                    switching
                      ? setConfirm({
                          text: 'Warning: This will reset your prayer progress.',
                          onAccept: pray,
                        })
                      : pray()
                  }
                >
                  Submit
                </GameButton>
              </>
            )}
          </div>
          {praying && usable && (
            <p className="text-[11px] leading-[13px]">
              {prayer
                ? `${PRAYER_ATTRIBUTES[prayer.attribute - 1]} prayer Lv. ${prayer.level}/${data.prayerMaxLevel} (+${prayer.level * PRAYER_BONUS_PER_LEVEL})${prayer.needed > 0 ? `, ${prayer.progress}/${prayer.needed}` : ''}. `
                : 'No prayer on this limit yet. '}
              Picked souls give {points} points.
            </p>
          )}
        </div>
      </section>
      <section
        aria-label="Soul inventory"
        className="flex h-[300px] w-[650px] flex-col gap-1 p-[8px]"
        style={bigBg(3)}
      >
        <div className="flex items-center gap-2">
          <h3 className="grow font-bold">
            Soul Inventory ({data.souls.length}/{data.inventory})
          </h3>
          <GameButton
            small
            className="h-5 w-[52px] text-[11px]"
            onClick={() => setSynth(synth ?? [])}
          >
            Synth
          </GameButton>
          <GameButton
            small
            disabled={
              busy ||
              data.discoveredToday >= data.discoverPerDay ||
              data.souls.length >= data.inventory
            }
            onClick={() => quiet(run('souls/discover', { count: 1 }, 'Soul discovered.'))}
          >
            Discover ({data.discoveredToday}/{data.discoverPerDay})
          </GameButton>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <input
            type="search"
            aria-label="Search souls"
            placeholder="Search by name or stat"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="game-card w-[150px] px-1"
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={eligible}
              onChange={(event) => setEligible(event.target.checked)}
            />
            Eligible
          </label>
          <select
            aria-label="Sort souls"
            className="game-card px-1"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Soul level"
            className="game-card px-1"
            value={levelFilter}
            onChange={(event) => setLevelFilter(Number(event.target.value))}
          >
            <option value={0}>All Levels</option>
            {data.levelLimits.map((_, i) => (
              <option key={i} value={i + 1}>
                Level {i + 1}
              </option>
            ))}
          </select>
          <select
            aria-label="Soul stat"
            className="game-card px-1"
            value={statFilter}
            onChange={(event) => setStatFilter(event.target.value)}
          >
            <option value="">All Stats</option>
            {stats.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {loose.length === 0 ? (
          <p className="m-auto">No souls yet. Use Discover to find some.</p>
        ) : (
          <ul aria-label="Souls" className="flex flex-wrap content-start gap-[6px] overflow-auto">
            {shown.map((soul) => {
              const order = picked.indexOf(soul.id)
              return (
                <li key={soul.id}>
                  <SoulTile
                    data={data}
                    soul={soul}
                    pressed={praying ? order >= 0 : undefined}
                    order={order + 1}
                    onClick={(event) => {
                      if (!praying) return openMenu(event, soul)
                      event.preventDefault()
                      setPicked(
                        order >= 0 ? picked.filter((id) => id !== soul.id) : [...picked, soul.id],
                      )
                    }}
                  />
                </li>
              )
            })}
          </ul>
        )}
        {action.error && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      </section>
      {menu && (
        <ItemMenu
          title={menu.title}
          at={menu.at}
          entries={menu.entries}
          onClose={() => setMenu(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          onAccept={confirm.onAccept}
          onClose={() => setConfirm(null)}
        />
      )}
      {synth && (
        <SoulSynthesisDialog
          data={data}
          slots={synth}
          onSlots={setSynth}
          run={run}
          onClose={() => setSynth(null)}
        />
      )}
      {refining && (
        <SoulRefineDialog
          data={data}
          targetId={refining}
          run={run}
          onClose={() => setRefining(null)}
        />
      )}
    </div>
  )
}
