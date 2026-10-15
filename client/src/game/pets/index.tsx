// Reborn's Kennel (reborn-windows-A-L.md, "Kennel"): 421x355. A BigBG1 storage column (our
// kennel slots, 4 a page) beside the main column: the pet slot, Name, Rename and Digestion, the
// info box; the food row (6 food slots, "+ hunger", Feed); and the AURA / AID / PSV skill rows (6
// slots each, Discover, "Click a skill for options"). Our pet rules (M6 decisions 8-19) stay: a
// full appetite lets a row Discover (learn) a skill, Stone adds slots, the pet slot's menu sets
// the pet active, releases or evolves it, and Digestion finishes digesting for Gold or Coupons.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type {
  PetActionResult,
  PetSkillKind,
  PetSkillView,
  PetsView,
  PetView,
} from '../../../../shared/src/schemas/pets'
import pets from '../../generated/reborn-pets.json'
import { api } from '../../lib/api'
import { errorMessage, gameKeys, useApplyResult } from '../api'
import { bigBg } from '../bloodlines/panels'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import type { Point } from '../inventory/BagGrid'
import { ItemTooltip, type TooltipEntry } from '../ItemTooltip'
import { ItemMenu, menuAt, type MenuEntry } from '../ItemMenu'
import { NATURES, petSkillIcon } from './nature'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { showToast } from '../toast'

export const petsKey = ['game', 'pets'] as const
const ICONS = pets as Record<string, { icon: string }>
/** The pet's Reborn icon (all 190 species have one; 34 have no battle art). */
export const petIcon = (avatar: number) => ICONS[String(avatar)]?.icon
export { NATURES }
/** Reborn's rows: vertical red labels, tooltips Aura / Aid / Passive. */
const ROWS: { kind: PetSkillKind; label: string; title: string; group: string }[] = [
  { kind: 1, label: 'AURA', title: 'Aura', group: 'Aura skills' },
  { kind: 2, label: 'AID', title: 'Aid', group: 'Aid skills' },
  { kind: 3, label: 'PSV', title: 'Passive', group: 'Passive skills' },
]
const PROPS = [
  ['attack', 'Attack'],
  ['defence', 'Defense'],
  ['disturb', 'Disturb'],
  ['active', 'Active'],
  ['savvy', 'Savvy'],
] as const
const SLOTS_PER_ROW = 6
const FOOD_SLOTS = 6
const STORAGE_PAGE = 4
/** Offset of the pet tooltip from the pointer. */
const TIP_GAP = 12

const nameOf = (nameKey: string, fallback = 'Unknown') => plainText(nameKey, fallback)
// Food types as the 2011 pet room names them (lg_Common_PetWatchLoveFood1-7).
const FOOD_TYPES: Record<number, string> = {
  1: 'Any food',
  2: 'Grain',
  3: 'Meat',
  4: 'Vegetable',
  5: 'Dessert',
  6: 'Medicine',
  7: 'Other',
}
export const foodTypeLabel = (type: number) => FOOD_TYPES[type] ?? `Food type ${type}`
/** Seconds left as h:mm:ss. */
export function digestCountdown(endsAt: string, now: number) {
  const left = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(left / 3600)}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}`
}
/** Whether a food fits a slot (CanFeedFood: type 1 on either side fits). */
export const fits = (slotType: number, foodType: number) =>
  slotType === 1 || foodType === 1 || slotType === foodType

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

const usePets = () =>
  useQuery({ queryKey: petsKey, queryFn: () => api<PetsView>('/api/game/pets') })

/** The active pet as Reborn's pet item tooltip shows it: a bound Pet with its slotted skills. */
export const petTooltipEntry = (pet: PetView): TooltipEntry => ({
  item: {
    id: pet.id,
    itemId: pet.species,
    count: 1,
    // ponytail: kennel pets are no item rows; they cannot be traded, so the chip reads Bound.
    bound: true,
    equippedSlot: 'Pet',
    nameKey: pet.nameKey,
    info: {
      kind: 'other',
      level: 0,
      sellPrice: null,
      stack: 1,
      w: 1,
      h: 1,
      class: 'PetItem',
      pet: { nature: pet.nature },
    },
  },
  pet: { level: pet.level, skills: pet.skills.filter((skill) => skill.slot !== null) },
})

/** Inventory Pet slot content: the active pet's icon, with Reborn's pet tooltip on hover. */
export function PetSlot() {
  const active = usePets().data?.pets.find((pet) => pet.active)
  const origin = useRef<HTMLSpanElement>(null)
  const [tip, setTip] = useState<Point | null>(null)
  if (!active) return <span className="sr-only">Pet: empty</span>
  const name = nameOf(active.nameKey, 'Pet')
  const show = (event: PointerEvent<HTMLElement>) => {
    // Tooltips are fixed; the window frame may be their containing block (see Inventory).
    const base = origin.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    setTip({ x: event.clientX - base.left + TIP_GAP, y: event.clientY - base.top + TIP_GAP })
  }
  return (
    <span
      className="absolute inset-0 grid place-items-center"
      onPointerEnter={show}
      onPointerMove={show}
      onPointerLeave={() => setTip(null)}
    >
      <span ref={origin} aria-hidden="true" className="pointer-events-none fixed top-0 left-0" />
      <img src={petIcon(active.avatar)} alt="" className="size-full object-contain p-[2px]" />
      <span className="sr-only">
        Pet: {name}, level {active.level}
      </span>
      {tip && <ItemTooltip entry={petTooltipEntry(active)} at={tip} />}
    </span>
  )
}

type Run = (path: string, done: string, body?: object) => void
type Menu = { title: string; entries: MenuEntry[]; at: { x: number; y: number } }
type OpenMenu = (event: MouseEvent<HTMLElement>, title: string, entries: MenuEntry[]) => void

export function KennelWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = usePets()
  const [selectedId, setSelectedId] = useState<string>()
  const [page, setPage] = useState(0)
  const [menu, setMenu] = useState<Menu | null>(null)
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object; done: string }) =>
      api<PetActionResult>(`/api/game/pets${path}`, { method: 'POST', body }),
    onSuccess: (result, { path, done }) => {
      showToast(done, 'success')
      queryClient.setQueryData(petsKey, result)
      apply(result)
      if (path.endsWith('/store'))
        void queryClient.invalidateQueries({ queryKey: gameKeys.inventory })
    },
  })
  const run: Run = (path, done, body) => action.mutate({ path, body, done })
  const openMenu: OpenMenu = (event, title, entries) =>
    setMenu({ title, entries, at: menuAt(event) })
  const data = view.data
  const selected = data?.pets.find((pet) => pet.id === selectedId) ?? data?.pets[0]
  const error = view.error ?? action.error
  const pages = data ? Math.ceil(data.maxSlots / STORAGE_PAGE) : 1
  return (
    <Dialog title="Kennel" onClose={onClose} className="game-window-bare w-[431px]">
      <div data-menu-root className="relative flex h-[355px] w-[421px] text-[11px] text-black">
        <section
          aria-label="Storage column"
          className="flex h-[355px] w-[90px] shrink-0 flex-col items-center gap-[4px] py-[6px]"
          style={bigBg(1)}
        >
          <h3 className="font-bold">Storage</h3>
          {data && (
            <>
              <ul aria-label="Storage" className="flex grow flex-col gap-[4px]">
                {Array.from({ length: STORAGE_PAGE }, (_, i) => page * STORAGE_PAGE + i).map(
                  (slot) => (
                    <li key={slot} className="grid size-[68px] place-items-center">
                      <StorageSlot
                        slot={slot}
                        view={data}
                        selected={selected}
                        busy={action.isPending}
                        onSelect={setSelectedId}
                        run={run}
                      />
                    </li>
                  ),
                )}
              </ul>
              <nav aria-label="Storage pages" className="flex items-center gap-1">
                <GameButton
                  small
                  aria-label="Previous page"
                  className="min-w-0! px-1!"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  {'<'}
                </GameButton>
                <span>
                  {page + 1}/{pages}
                </span>
                <GameButton
                  small
                  aria-label="Next page"
                  className="min-w-0! px-1!"
                  disabled={page >= pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  {'>'}
                </GameButton>
              </nav>
            </>
          )}
        </section>
        <section
          aria-label="Pet"
          className="flex h-[355px] w-[331px] flex-col gap-[3px] p-[5px]"
          style={bigBg(1)}
        >
          {view.isPending && <p>Loading the kennel...</p>}
          {error && <Notice tone="error">{errorMessage(error)}</Notice>}
          {data && !selected && (
            <p className="m-auto w-[250px] text-center">
              Your kennel is empty. Use a pet item from your bag to adopt a pet.
            </p>
          )}
          {data && selected && (
            <PetPanels
              key={selected.id}
              pet={selected}
              view={data}
              busy={action.isPending}
              openMenu={openMenu}
              run={(path, done, body) => run(`/${selected.id}${path}`, done, body)}
            />
          )}
        </section>
        {menu && (
          <ItemMenu
            title={menu.title}
            at={menu.at}
            entries={menu.entries}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </Dialog>
  )
}

function StorageSlot({
  slot,
  view,
  selected,
  busy,
  onSelect,
  run,
}: {
  slot: number
  view: PetsView
  selected?: PetView
  busy: boolean
  onSelect: (id: string) => void
  run: Run
}) {
  const pet = view.pets.find((p) => p.kennelSlot === slot)
  if (pet)
    return (
      <button
        type="button"
        aria-label={`${nameOf(pet.nameKey, 'Pet')}${pet.active ? ' (active)' : ''}`}
        aria-pressed={pet.id === selected?.id}
        onClick={() => onSelect(pet.id)}
        className={`game-slot grid size-[68px] place-items-center ${
          pet.id === selected?.id ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''
        }`}
      >
        <img src={petIcon(pet.avatar)} alt="" className="max-h-full max-w-full p-1" />
      </button>
    )
  if (slot < view.petSlots)
    return <span className="game-slot grid size-[68px] place-items-center">Empty</span>
  if (slot === view.petSlots)
    return (
      <GameButton
        small
        disabled={busy}
        className="h-[68px] w-[68px] min-w-0! px-1! text-[10px] whitespace-normal"
        onClick={() => run('/slots/unlock', 'A new kennel slot was unlocked.')}
      >
        Unlock slot ({view.slotPrice} Gold)
      </GameButton>
    )
  if (slot < view.maxSlots)
    return (
      <span
        title="Locked"
        className="game-skill-lock block size-[40px] opacity-80"
        aria-label="Locked slot"
        role="img"
      />
    )
  return null
}

function PetPanels({
  pet,
  view,
  busy,
  openMenu,
  run,
}: {
  pet: PetView
  view: PetsView
  busy: boolean
  openMenu: OpenMenu
  run: Run
}) {
  const name = nameOf(pet.nameKey, 'Pet')
  const [tooltip, setTooltip] = useState(false)
  const [foods, setFoods] = useState<(string | null)[]>(() => Array(FOOD_SLOTS).fill(null))
  const digesting = pet.digestEndsAt !== null
  const now = useNow(digesting)
  const hunger = foods.reduce(
    (sum, id) => sum + (view.foods.find((f) => f.itemId === id)?.hunger ?? 0),
    0,
  )
  const evolveReason =
    pet.level < view.evolve.level || view.feathers < view.evolve.feathers
      ? `Needs level ${view.evolve.level} and ${view.evolve.feathers} Feathers (you have ${view.feathers}).`
      : undefined
  const petMenu = (event: MouseEvent<HTMLElement>) =>
    openMenu(event, name, [
      {
        label: pet.active ? 'Rest' : 'Set active',
        disabled: busy,
        onSelect: () =>
          run('/active', pet.active ? `${name} is resting.` : `${name} joins your fights.`, {
            active: !pet.active,
          }),
      },
      {
        // Reborn keeps pets as items: dragged out of the Kennel, one keeps its level and skills.
        label: 'Move to bag',
        disabled: busy || pet.active,
        reason: pet.active ? 'Rest the pet first.' : undefined,
        onSelect: () => run('/store', `${name} was moved to your bag.`),
      },
      {
        label: 'Release',
        disabled: busy || pet.active,
        reason: pet.active ? 'Rest the pet first.' : undefined,
        onSelect: () => run('/release', `${name} was released.`),
      },
      ...pet.evolvesTo.map((form) => ({
        label: `Evolve into ${nameOf(form.nameKey)}`,
        disabled: busy || evolveReason !== undefined,
        reason: evolveReason,
        onSelect: () =>
          run('/evolve', `${name} evolved into ${nameOf(form.nameKey)}.`, { into: form.species }),
      })),
    ])
  const digestMenu = (event: MouseEvent<HTMLElement>) =>
    openMenu(event, 'Digestion', [
      {
        label: `Finish now (${view.digestPrice} Gold)`,
        disabled: busy,
        onSelect: () => run('/digest-now', 'Digestion finished.', { currency: 'gold' }),
      },
      {
        label: `Finish now (${view.digestPrice} Gift Coupons)`,
        disabled: busy,
        onSelect: () => run('/digest-now', 'Digestion finished.', { currency: 'giftCoupon' }),
      },
    ])
  return (
    <>
      <div className="relative h-[100px] w-[321px] shrink-0" style={bigBg(4)}>
        <button
          type="button"
          aria-label={`Pet: ${name}${pet.active ? ' (active)' : ''}`}
          aria-describedby={tooltip ? 'kennel-pet-tooltip' : undefined}
          onClick={petMenu}
          onContextMenu={petMenu}
          onMouseEnter={() => setTooltip(true)}
          onMouseLeave={() => setTooltip(false)}
          onFocus={() => setTooltip(true)}
          onBlur={() => setTooltip(false)}
          className="absolute top-[10px] left-[10px] grid size-[56px] place-items-center bg-[url(/assets/game/ui/slot-pet.webp)] bg-size-[100%_100%]"
        >
          <img src={petIcon(pet.avatar)} alt="" className="max-h-full max-w-full p-1" />
        </button>
        {tooltip && (
          <div
            id="kennel-pet-tooltip"
            role="tooltip"
            className="absolute top-[68px] left-[10px] z-10 w-[190px] p-[6px] text-[11px] text-[whitesmoke]"
            style={{
              border: 0,
              borderImage:
                'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
            }}
          >
            <p className="font-bold text-[#f0d060]">
              {name} Lv. {pet.level}
              {pet.active ? ' (active)' : ''}
            </p>
            <p>Nature: {NATURES[pet.nature] ?? 'Unknown'}</p>
            <p>Likes: {foodTypeLabel(pet.foodType)}</p>
            <p>Growth rate: {pet.growth}</p>
            {PROPS.map(([key, label]) => (
              <p key={key}>
                {label}: {pet.totals[key]}
              </p>
            ))}
            <p className="text-[#8e8e8e]">Click for options</p>
          </div>
        )}
        <input
          aria-label="Name"
          readOnly
          value={`${name} Lv. ${pet.level}`}
          className="game-text-box absolute top-[10px] left-[75px] h-[20px] w-[135px] px-1 text-[11px]"
        />
        <GameButton small disabled className="absolute! top-[10px] left-[216px] h-5 w-[95px]">
          Rename
        </GameButton>
        <div className="game-text-box absolute top-[36px] left-[75px] h-[52px] w-[155px] px-[6px] py-[2px] leading-[16px]">
          <p>
            Growth: {pet.expToNext === null ? `MAX (${pet.exp})` : `${pet.exp}/${pet.expToNext}`}
          </p>
          <div
            role="meter"
            aria-label="Appetite"
            aria-valuemin={0}
            aria-valuemax={pet.appetiteMax}
            aria-valuenow={pet.appetite}
            title={`Appetite ${pet.appetite} / ${pet.appetiteMax}: a full appetite lets a row Discover a skill`}
            className="flex items-center gap-1"
          >
            Appetite:
            <span className="relative h-[8px] grow rounded-sm border border-[#5c4a2a] bg-[#e8dcc0]">
              <span
                className="absolute inset-y-0 left-0 bg-[#c9772b]"
                style={{ width: `${Math.round((pet.appetite / pet.appetiteMax) * 100)}%` }}
              />
            </span>
          </div>
          <p>Skill Locks: {view.lockItem.count}</p>
        </div>
        <GameButton
          small
          disabled={!digesting}
          onClick={digestMenu}
          className="absolute! top-[36px] left-[240px] h-5 w-[65px]"
        >
          Digestion
        </GameButton>
        {digesting && (
          <span role="timer" className="absolute top-[60px] left-[244px] font-bold">
            {digestCountdown(pet.digestEndsAt!, now)}
          </span>
        )}
      </div>
      <section
        aria-label="Food"
        className="relative flex h-[65px] w-[321px] shrink-0 items-center gap-[4px] px-[5px]"
        style={bigBg(4)}
      >
        <span className="w-[26px] font-bold">Food</span>
        <ol aria-label="Food slots" className="relative h-[55px] w-[216px]" style={bigBg(5)}>
          {pet.foodSlots.map((slot, i) => {
            const food = digesting ? slot.item : foods[i]
            const label = foodTypeLabel(slot.type)
            return (
              <li
                key={i}
                className="absolute top-[3px] w-[34px] text-center"
                style={{ left: 5 + 36 * i }}
              >
                <span className="block truncate text-[8px] leading-[10px]" title={label}>
                  {label}
                  {slot.mul > 0 ? ` +${slot.mul}` : ''}
                </span>
                <button
                  type="button"
                  aria-label={`Food slot ${i + 1}`}
                  title={food ? itemName(food) : `${label}: click to choose a food`}
                  disabled={digesting || busy}
                  onClick={(event) =>
                    openMenu(event, `Food slot ${i + 1}`, [
                      ...view.foods
                        .filter((f) => fits(slot.type, f.type))
                        .map((f) => ({
                          label: `${nameOf(f.nameKey, f.itemId)} (+${f.hunger}) x${f.count}`,
                          onSelect: () => setFoods(foods.map((id, j) => (j === i ? f.itemId : id))),
                        })),
                      {
                        label: 'Empty',
                        onSelect: () => setFoods(foods.map((id, j) => (j === i ? null : id))),
                      },
                    ])
                  }
                  className="game-slot grid size-[32px] place-items-center disabled:cursor-default"
                >
                  {food && <ItemIcon itemId={food} name={itemName(food)} className="size-[30px]" />}
                </button>
              </li>
            )
          })}
        </ol>
        <div className="flex flex-col items-center gap-1">
          <span className="font-bold">+ {hunger}</span>
          <GameButton
            small
            className="h-5 w-[60px]"
            disabled={
              busy || digesting || foods.every((f) => !f) || pet.appetite >= pet.appetiteMax
            }
            onClick={() => {
              run('/feed', 'Your pet is digesting.', { foods })
              setFoods(Array(FOOD_SLOTS).fill(null))
            }}
          >
            Feed
          </GameButton>
        </div>
      </section>
      <Skills pet={pet} view={view} busy={busy} openMenu={openMenu} run={run} />
    </>
  )
}

function SkillCell({ skill, onClick }: { skill: PetSkillView; onClick: OpenMenuHandler }) {
  const [broken, setBroken] = useState(false)
  const name = nameOf(skill.nameKey, `Skill ${skill.skillId}`)
  return (
    <button
      type="button"
      aria-label={`${name}${skill.locked ? ' (locked)' : ''}`}
      title={`${name} Lv. ${skill.level}`}
      onClick={onClick}
      onContextMenu={onClick}
      className="game-skill-cell relative grid size-[34px] place-items-center overflow-hidden text-[8px] leading-[9px]"
    >
      {broken ? (
        <span className="px-px">{name}</span>
      ) : (
        <img
          src={petSkillIcon(skill.skillId)}
          alt=""
          className="size-[28px]"
          onError={() => setBroken(true)}
        />
      )}
      {skill.locked && (
        <span aria-hidden="true" className="game-skill-lock absolute right-0 bottom-0 size-3" />
      )}
    </button>
  )
}
type OpenMenuHandler = (event: MouseEvent<HTMLButtonElement>) => void

function Skills({
  pet,
  view,
  busy,
  openMenu,
  run,
}: {
  pet: PetView
  view: PetsView
  busy: boolean
  openMenu: OpenMenu
  run: Run
}) {
  const full = pet.appetite >= pet.appetiteMax
  const skillMenu = (event: MouseEvent<HTMLElement>, skill: PetSkillView) => {
    const name = nameOf(skill.nameKey, `Skill ${skill.skillId}`)
    const locks = pet.nextLockCost
    openMenu(event, name, [
      skill.locked
        ? {
            label: 'Unlock',
            disabled: busy,
            onSelect: () => run(`/skills/${skill.skillId}/unlock`, `${name} is unlocked.`),
          }
        : {
            label: `Lock (${locks ?? '-'} ${locks === 1 ? 'lock' : 'locks'})`,
            disabled: busy || locks === null,
            reason: locks === null ? 'No more skills can be locked.' : undefined,
            onSelect: () => run(`/skills/${skill.skillId}/lock`, `${name} is locked.`),
          },
      {
        label: `Remove (${view.removeItem.count} Oblivion Potions)`,
        disabled: busy || view.removeItem.count === 0,
        onSelect: () => run(`/skills/${skill.skillId}/remove`, `${name} was removed.`),
      },
    ])
  }
  const bookMenu = (event: MouseEvent<HTMLElement>) =>
    openMenu(
      event,
      'Skill books',
      view.books.map((b) => ({
        label: `${nameOf(`lg_Skill_${b.skillId}`, nameOf(b.nameKey, b.itemId))} x${b.count}`,
        disabled: busy,
        onSelect: () => run('/skills/book', 'Your pet learned the skill.', { item: b.itemId }),
      })),
    )
  return (
    <section aria-label="Skills" className="relative h-[172px] w-[321px] shrink-0" style={bigBg(4)}>
      {ROWS.map(({ kind, label, title, group }, row) => {
        const skills = pet.skills.filter((s) => s.kind === kind).sort((a, b) => a.slot - b.slot)
        const open = pet.slots[kind - 1]!
        const canAdd = pet.nextSlotCost !== null && open < SLOTS_PER_ROW
        return (
          <div
            key={kind}
            role="group"
            aria-label={group}
            className="absolute left-[5px] flex items-center gap-[3px]"
            style={{ top: 5 + 53 * row }}
          >
            <span
              title={title}
              className="w-[12px] text-center text-[9px] leading-[9px] font-black text-[#c01010] [writing-mode:vertical-lr]"
            >
              {label}
            </span>
            <ul
              className="flex h-[48px] w-[245px] items-center gap-[4px] px-[5px]"
              style={bigBg(5)}
            >
              {Array.from({ length: SLOTS_PER_ROW }, (_, i) => {
                const skill = skills[i]
                return (
                  <li key={i} className="grid size-[34px] place-items-center">
                    {skill ? (
                      <SkillCell skill={skill} onClick={(event) => skillMenu(event, skill)} />
                    ) : i < open ? (
                      <span className="game-skill-cell grid size-[34px] place-items-center text-[8px] text-[#5c4a2a]">
                        Empty
                      </span>
                    ) : i === open && canAdd ? (
                      <button
                        type="button"
                        aria-label={`Add slot (${pet.nextSlotCost} Stone)`}
                        title={`Add slot (${pet.nextSlotCost} Stone)`}
                        disabled={busy}
                        onClick={() =>
                          run('/skills/slot', `A new ${title.toLowerCase()} slot was added.`, {
                            kind,
                          })
                        }
                        className="game-skill-lock size-[34px] hover:brightness-125"
                      />
                    ) : (
                      <span
                        role="img"
                        aria-label="Locked"
                        className="game-skill-lock size-[34px]"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            <GameButton
              small
              className="h-5 w-[52px] min-w-0! px-1!"
              title={full ? undefined : 'Fill your pet’s appetite to discover a skill.'}
              disabled={busy || !full || open === 0}
              onClick={() =>
                run('/skills/learn', `Your pet learned a new ${title.toLowerCase()} skill.`, {
                  kind,
                })
              }
            >
              Discover
            </GameButton>
          </div>
        )
      })}
      <p className="absolute bottom-[2px] left-[8px] text-[10px] text-[#5c4a2a]">
        Click a skill for options
      </p>
      {view.books.length > 0 && (
        <GameButton
          small
          className="absolute! right-[6px] bottom-[2px] h-[15px] text-[10px]"
          onClick={bookMenu}
        >
          Skill Book
        </GameButton>
      )}
    </section>
  )
}
