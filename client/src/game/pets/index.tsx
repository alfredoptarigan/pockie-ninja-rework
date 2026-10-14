// Pet Kennel (M6 task 9): the kennel slots, the pet card (nature, level, props, appetite and the
// digest timer), the 6 food slots, skills by kind with slots, locks and removal, evolution, and the
// Inventory Pet slot.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  PetActionResult,
  PetSkillKind,
  PetsView,
  PetView,
} from '../../../../shared/src/schemas/pets'
import pets from '../../generated/reborn-pets.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { itemName } from '../explore'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'

export const petsKey = ['game', 'pets'] as const
const ICONS = pets as Record<string, { icon: string }>
/** The pet's Reborn icon (all 190 species have one; 34 have no battle art). */
export const petIcon = (avatar: number) => ICONS[String(avatar)]?.icon

export const NATURES: Record<number, string> = {
  1: 'Plant',
  2: 'Beast',
  3: 'Artificial',
  4: 'Dragon',
  5: 'Tailed Beast',
  6: 'Spirit',
}
const KINDS: { kind: PetSkillKind; label: string }[] = [
  { kind: 1, label: 'Aura' },
  { kind: 2, label: 'Support' },
  { kind: 3, label: 'Passive' },
]
const PROPS = [
  ['attack', 'Attack'],
  ['defence', 'Defense'],
  ['disturb', 'Disturb'],
  ['active', 'Active'],
  ['savvy', 'Savvy'],
] as const

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

/** Inventory Pet slot content: the active pet's icon, drawn inside the slot cell. */
export function PetSlot() {
  const active = usePets().data?.pets.find((pet) => pet.active)
  if (!active) return <span className="sr-only">Pet: empty</span>
  const name = nameOf(active.nameKey, 'Pet')
  return (
    <span
      className="absolute inset-0 grid place-items-center"
      title={`${name} Lv. ${active.level}`}
    >
      <img src={petIcon(active.avatar)} alt="" className="size-full object-contain p-[2px]" />
      <span className="sr-only">
        Pet: {name}, level {active.level}
      </span>
    </span>
  )
}

export function KennelWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = usePets()
  const [selectedId, setSelectedId] = useState<string>()
  const [message, setMessage] = useState('')
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object; done: string }) =>
      api<PetActionResult>(`/api/game/pets${path}`, { method: 'POST', body }),
    onSuccess: (result, { done }) => {
      setMessage(done)
      queryClient.setQueryData(petsKey, result)
      apply(result)
    },
    onError: () => setMessage(''),
  })
  const run = (path: string, done: string, body?: object) => action.mutate({ path, body, done })
  const data = view.data
  const selected = data?.pets.find((pet) => pet.id === selectedId) ?? data?.pets[0]
  const error = view.error ?? action.error
  return (
    <Dialog title="Pet Kennel" onClose={onClose} className="w-[720px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {view.isPending && <p>Loading the kennel...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {message && !error && <Notice>{message}</Notice>}
        {data && (
          <>
            <ul aria-label="Kennel slots" className="flex gap-2">
              {Array.from({ length: data.maxSlots }, (_, slot) => {
                const pet = data.pets.find((p) => p.kennelSlot === slot)
                if (pet)
                  return (
                    <li key={slot}>
                      <button
                        type="button"
                        aria-pressed={pet.id === selected?.id}
                        onClick={() => setSelectedId(pet.id)}
                        className={`game-slot grid size-14 place-items-center ${pet.id === selected?.id ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''}`}
                      >
                        <img
                          src={petIcon(pet.avatar)}
                          alt={`${nameOf(pet.nameKey, 'Pet')}${pet.active ? ' (active)' : ''}`}
                          className="max-h-full max-w-full p-0.5"
                        />
                      </button>
                    </li>
                  )
                if (slot < data.petSlots)
                  return (
                    <li
                      key={slot}
                      className="game-slot grid size-14 place-items-center text-[10px]"
                    >
                      Empty
                    </li>
                  )
                return (
                  <li key={slot} className="grid size-14 place-items-center">
                    {slot === data.petSlots ? (
                      <GameButton
                        small
                        disabled={action.isPending}
                        onClick={() => run('/slots/unlock', 'A new kennel slot was unlocked.')}
                      >
                        Unlock slot ({data.slotPrice} Gold)
                      </GameButton>
                    ) : (
                      <span className="text-[10px] text-[#5c5c5c]">Locked</span>
                    )}
                  </li>
                )
              })}
            </ul>
            {data.pets.length === 0 && (
              <p>Your kennel is empty. Use a pet item from your bag to adopt a pet.</p>
            )}
            {selected && (
              <PetCard
                pet={selected}
                view={data}
                busy={action.isPending}
                run={(path, done, body) => run(`/${selected.id}${path}`, done, body)}
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}

type Run = (path: string, done: string, body?: object) => void

function PetCard({
  pet,
  view,
  busy,
  run,
}: {
  pet: PetView
  view: PetsView
  busy: boolean
  run: Run
}) {
  const name = nameOf(pet.nameKey, 'Pet')
  return (
    <section aria-label={name} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-3">
        <img src={petIcon(pet.avatar)} alt="" className="game-slot size-16 p-1" />
        <div className="flex flex-col gap-0.5">
          <h3 className="font-bold">
            {name} <span className="font-normal">Lv. {pet.level}</span>
          </h3>
          <p>
            Nature: {NATURES[pet.nature] ?? 'Unknown'} | Growth: {pet.growth} | Likes:{' '}
            {foodTypeLabel(pet.foodType)}
          </p>
          <p>
            EXP: {pet.exp}
            {pet.expToNext !== null && ` / ${pet.expToNext}`}
          </p>
          <dl className="flex flex-wrap gap-x-3">
            {PROPS.map(([key, label]) => (
              <div key={key} className="flex gap-1">
                <dt>{label}:</dt>
                <dd>{pet.totals[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="ml-auto flex flex-col gap-1">
          <GameButton
            disabled={busy}
            onClick={() =>
              run('/active', pet.active ? `${name} is resting.` : `${name} joins your fights.`, {
                active: !pet.active,
              })
            }
          >
            {pet.active ? 'Rest' : 'Set active'}
          </GameButton>
          <GameButton
            disabled={busy || pet.active}
            onClick={() => run('/release', `${name} was released.`)}
          >
            Release
          </GameButton>
        </div>
      </div>
      <Feeding pet={pet} view={view} busy={busy} run={run} />
      <Skills pet={pet} view={view} busy={busy} run={run} />
      {pet.evolvesTo.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Evolve (needs level {view.evolve.level} and {view.evolve.feathers} Feathers; you have{' '}
            {view.feathers}):
          </span>
          {pet.evolvesTo.map((form) => (
            <GameButton
              key={form.species}
              small
              disabled={
                busy || pet.level < view.evolve.level || view.feathers < view.evolve.feathers
              }
              onClick={() =>
                run('/evolve', `${name} evolved into ${nameOf(form.nameKey)}.`, {
                  into: form.species,
                })
              }
            >
              {nameOf(form.nameKey)}
            </GameButton>
          ))}
        </div>
      )}
    </section>
  )
}

function Feeding({
  pet,
  view,
  busy,
  run,
}: {
  pet: PetView
  view: PetsView
  busy: boolean
  run: Run
}) {
  const [foods, setFoods] = useState<(string | null)[]>(() => Array(6).fill(null))
  const digesting = pet.digestEndsAt !== null
  const now = useNow(digesting)
  const percent = Math.round((pet.appetite / pet.appetiteMax) * 100)
  return (
    <section aria-label="Feeding" className="flex flex-col gap-1">
      <div
        role="meter"
        aria-label="Appetite"
        aria-valuemin={0}
        aria-valuemax={pet.appetiteMax}
        aria-valuenow={pet.appetite}
        className="h-3 w-full rounded border border-[#5c4a2a] bg-[#e8dcc0]"
      >
        <div className="h-full bg-[#c9772b]" style={{ width: `${percent}%` }} />
      </div>
      <p>
        Appetite: {pet.appetite} / {pet.appetiteMax}
      </p>
      <ol aria-label="Food slots" className="grid grid-cols-6 gap-1">
        {pet.foodSlots.map((slot, i) => (
          <li key={i} className="game-slot flex flex-col gap-0.5 p-1 text-[10px]">
            <span>{foodTypeLabel(slot.type)}</span>
            {slot.mul > 0 && <span>Bonus tier {slot.mul}</span>}
            {digesting ? (
              <span>{slot.item ? itemName(slot.item) : 'Empty'}</span>
            ) : (
              <select
                aria-label={`Food slot ${i + 1}`}
                value={foods[i] ?? ''}
                onChange={(event) =>
                  setFoods(foods.map((f, j) => (j === i ? event.target.value || null : f)))
                }
              >
                <option value="">Empty</option>
                {view.foods
                  .filter((food) => fits(slot.type, food.type))
                  .map((food) => (
                    <option key={food.itemId} value={food.itemId}>
                      {nameOf(food.nameKey, food.itemId)} (+{food.hunger} appetite) x{food.count}
                    </option>
                  ))}
              </select>
            )}
          </li>
        ))}
      </ol>
      {digesting ? (
        <div className="flex flex-wrap items-center gap-2">
          <span role="timer">Digesting: {digestCountdown(pet.digestEndsAt!, now)} left</span>
          <GameButton
            small
            disabled={busy}
            onClick={() => run('/digest-now', 'Digestion finished.', { currency: 'gold' })}
          >
            Finish now ({view.digestPrice} Gold)
          </GameButton>
          <GameButton
            small
            disabled={busy}
            onClick={() => run('/digest-now', 'Digestion finished.', { currency: 'giftCoupon' })}
          >
            Finish now ({view.digestPrice} Gift Coupons)
          </GameButton>
        </div>
      ) : (
        <GameButton
          disabled={busy || foods.every((f) => !f) || pet.appetite >= pet.appetiteMax}
          onClick={() => {
            run('/feed', 'Your pet is digesting.', { foods })
            setFoods(Array(6).fill(null))
          }}
        >
          Feed
        </GameButton>
      )}
    </section>
  )
}

function Skills({
  pet,
  view,
  busy,
  run,
}: {
  pet: PetView
  view: PetsView
  busy: boolean
  run: Run
}) {
  const [book, setBook] = useState('')
  const full = pet.appetite >= pet.appetiteMax
  return (
    <section aria-label="Skills" className="flex flex-col gap-1">
      <p>
        Skill slots: {pet.slots.reduce((a, b) => a + b, 0)} / {pet.slotCap} | Pet Skill Locks:{' '}
        {view.lockItem.count} | Oblivion Potions: {view.removeItem.count}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {KINDS.map(({ kind, label }) => {
          const skills = pet.skills.filter((s) => s.kind === kind)
          const open = pet.slots[kind - 1]! - skills.length
          return (
            <div key={kind} aria-label={`${label} skills`} role="group" className="game-slot p-1">
              <h4 className="font-bold">{label}</h4>
              <ul className="flex flex-col gap-0.5">
                {skills.map((skill) => {
                  const skillName = nameOf(skill.nameKey, `Skill ${skill.skillId}`)
                  return (
                    <li key={skill.skillId} className="flex flex-wrap items-center gap-1">
                      <span>
                        {skillName}
                        {skill.locked && ' (locked)'}
                      </span>
                      <GameButton
                        small
                        disabled={busy || (!skill.locked && pet.nextLockCost === null)}
                        onClick={() =>
                          run(
                            `/skills/${skill.skillId}/${skill.locked ? 'unlock' : 'lock'}`,
                            skill.locked ? `${skillName} is unlocked.` : `${skillName} is locked.`,
                          )
                        }
                      >
                        {skill.locked
                          ? 'Unlock'
                          : `Lock (${pet.nextLockCost ?? '-'} ${pet.nextLockCost === 1 ? 'lock' : 'locks'})`}
                      </GameButton>
                      <GameButton
                        small
                        disabled={busy || view.removeItem.count === 0}
                        onClick={() =>
                          run(`/skills/${skill.skillId}/remove`, `${skillName} was removed.`)
                        }
                      >
                        Remove
                      </GameButton>
                    </li>
                  )
                })}
                {Array.from({ length: open }, (_, i) => (
                  <li key={`open-${i}`} className="text-[#5c5c5c]">
                    Empty slot
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex flex-wrap gap-1">
                <GameButton
                  small
                  disabled={busy || !full || pet.slots[kind - 1] === 0}
                  onClick={() =>
                    run('/skills/learn', `Your pet learned a new ${label.toLowerCase()} skill.`, {
                      kind,
                    })
                  }
                >
                  Learn
                </GameButton>
                {pet.nextSlotCost !== null && pet.slots[kind - 1]! < 6 && (
                  <GameButton
                    small
                    disabled={busy}
                    onClick={() =>
                      run('/skills/slot', `A new ${label.toLowerCase()} slot was added.`, { kind })
                    }
                  >
                    Add slot ({pet.nextSlotCost} Stone)
                  </GameButton>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {!full && <p>Fill your pet's appetite to learn a skill.</p>}
      {view.books.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Skill book" value={book} onChange={(e) => setBook(e.target.value)}>
            <option value="">Choose a skill book</option>
            {view.books.map((b) => (
              <option key={b.itemId} value={b.itemId}>
                {nameOf(`lg_Skill_${b.skillId}`, nameOf(b.nameKey, b.itemId))} x{b.count}
              </option>
            ))}
          </select>
          <GameButton
            small
            disabled={busy || !book}
            onClick={() => {
              run('/skills/book', 'Your pet learned the skill.', { item: book })
              setBook('')
            }}
          >
            Teach
          </GameButton>
        </div>
      )}
    </section>
  )
}
