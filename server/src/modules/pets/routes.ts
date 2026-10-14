// Pet Kennel under /api/game/pets (M6 decisions 11-18). Every action is one transaction: the
// character row is locked first, then the pet rows; digestion finishes lazily on read and write.
import { and, eq, ne } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Random } from '@pockie/game-core'
import {
  DIGEST_AT_ONCE_PRICE,
  DIGEST_SECONDS,
  EVOLVE_FEATHERS,
  EVOLVE_GROWTH,
  EVOLVE_LEVEL,
  HUNGER_MAX,
  KENNEL_MAX_SLOTS,
  KENNEL_SLOT_PRICE,
  PET_LOCK_ITEM,
  PET_SKILL_REMOVE_ITEM,
} from '../../../../game-core/src/pets/constants.js'
import { canFeed } from '../../../../game-core/src/pets/feeding.js'
import { lockCost, pickLearnSkill } from '../../../../game-core/src/pets/skills.js'
import {
  petActiveBodySchema,
  petBookBodySchema,
  petDigestNowBodySchema,
  petEvolveBodySchema,
  petFeedBodySchema,
  petParamsSchema,
  petSkillKindBodySchema,
  petSkillParamsSchema,
} from '../../../../shared/src/schemas/pets.js'
import type { Db } from '../../db/client.js'
import { characterPets, characters } from '../../db/schema.js'
import { rebornPetFoods, rebornPetSkills } from '../../game/data.js'
import { questCommand, type Tx } from '../../game/progress.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  actionResult,
  bad,
  cryptoRandom,
  EQUIP_PET_COMMAND,
  evolutionsOf,
  FEATHER_ITEM,
  FEED_PET_COMMAND,
  finishDigestion,
  learnPool,
  lockPet,
  nextSlot,
  petFood,
  placeSkill,
  saveSkills,
  settlePets,
  skillRows,
  spendCurrency,
  spendItems,
  type PetRow,
  type SkillRow,
} from './kennel.js'
export { activePetFighterInput, explorePetItem, grantPetExp } from '../../game/pets.js'
export { adoptPetItem } from './kennel.js'

type CharacterRow = typeof characters.$inferSelect
interface Ctx {
  tx: Tx
  character: CharacterRow
  pet: PetRow
  random: Random
}

export interface PetRouteOptions {
  db: Db
  /** Tests pass a fixed roll; production uses crypto seeds. */
  random?: () => Random
}

/** A skill change of the active pet changes its fighter (decision 37). */
const refreshIfActive = (tx: Tx, pet: PetRow) =>
  pet.active ? refreshArenaSnapshot(tx, pet.characterId) : undefined

function slottedSkill(rows: readonly SkillRow[], skillId: number) {
  const row = rows.find((r) => r.skillId === skillId && r.slot !== null)
  if (!row) throw bad('no_skill', 'Your pet does not have that skill.')
  return row
}

async function setActive({ tx, character, pet }: Ctx, active: boolean) {
  if (pet.active === active) return
  if (active)
    await tx
      .update(characterPets)
      .set({ active: false })
      .where(and(eq(characterPets.characterId, character.id), ne(characterPets.id, pet.id)))
  await tx.update(characterPets).set({ active }).where(eq(characterPets.id, pet.id))
  if (active) await questCommand(tx, character, EQUIP_PET_COMMAND)
  await refreshArenaSnapshot(tx, character.id)
}

async function feed({ tx, character, pet }: Ctx, foods: readonly (string | null)[]) {
  if (pet.digestEndsAt) throw bad('digesting', 'Your pet is still digesting.')
  if (pet.appetite >= HUNGER_MAX) throw bad('full', 'Your pet is full. Teach it a skill first.')
  const fed = foods.map((itemId) => {
    if (!itemId) return null
    const food = petFood(itemId)
    if (!food) throw bad('not_food', 'Only pet food can go in the food slots.')
    return food
  })
  if (!canFeed(pet.foodSlots, fed))
    throw bad('wrong_food', 'Each food must match the type its slot asks for.')
  const counts = new Map<string, number>()
  for (const itemId of foods) if (itemId) counts.set(itemId, (counts.get(itemId) ?? 0) + 1)
  for (const [itemId, count] of counts)
    await spendItems(tx, character.id, itemId, count, 'You do not have that much food.')
  await tx
    .update(characterPets)
    .set({
      foodSlots: pet.foodSlots.map((slot, i) => ({
        type: slot.type,
        mul: slot.mul,
        ...(foods[i] && { item: foods[i] }),
      })),
      digestEndsAt: new Date(Date.now() + DIGEST_SECONDS * 1000),
    })
    .where(eq(characterPets.id, pet.id))
  await questCommand(tx, character, FEED_PET_COMMAND)
}

async function digestNow({ tx, character, pet, random }: Ctx, currency: 'gold' | 'giftCoupon') {
  if (!pet.digestEndsAt) throw bad('not_digesting', 'Your pet is not digesting anything.')
  await spendCurrency(tx, character, currency, DIGEST_AT_ONCE_PRICE)
  await finishDigestion(tx, pet, character.level, random)
}

async function learn({ tx, pet, random }: Ctx, kind: 1 | 2 | 3) {
  if (pet.appetite < HUNGER_MAX)
    throw bad('not_full', 'Feed your pet until its appetite is full first.')
  const rows = await skillRows(tx, pet.id)
  const skillId = pickLearnSkill(learnPool(pet.species, kind), rows, random)
  if (skillId === null) throw bad('nothing_to_learn', 'Your pet knows every skill of that kind.')
  await saveSkills(tx, pet.id, placeSkill(pet, rows, skillId, kind))
  await tx
    .update(characterPets)
    .set({ appetite: pet.appetite - HUNGER_MAX })
    .where(eq(characterPets.id, pet.id))
  await refreshIfActive(tx, pet)
}

async function learnBook({ tx, character, pet }: Ctx, item: string) {
  const book = rebornPetSkills().books.find((b) => b.item === item)
  if (!book) throw bad('not_book', 'That is not a pet skill book.')
  if (!rebornPetSkills().skills[String(book.skill)])
    throw bad('unknown_skill', 'That skill book cannot be used yet.')
  const rows = await skillRows(tx, pet.id)
  const next = placeSkill(pet, rows, book.skill, book.kind)
  await spendItems(tx, character.id, item, 1, 'You do not have that skill book.')
  await saveSkills(tx, pet.id, next)
  await refreshIfActive(tx, pet)
}

async function unlockSkillSlot({ tx, character, pet }: Ctx, kind: 1 | 2 | 3) {
  const next = nextSlot(pet, kind)
  if (!next) throw bad('slot_cap', 'Your pet cannot open another skill slot of that kind yet.')
  await spendCurrency(tx, character, 'stone', next.cost)
  await tx
    .update(characterPets)
    .set({ [next.column]: pet[next.column] + 1 })
    .where(eq(characterPets.id, pet.id))
}

async function lockSkill({ tx, character, pet }: Ctx, skillId: number, locked: boolean) {
  const rows = await skillRows(tx, pet.id)
  const row = slottedSkill(rows, skillId)
  if (row.locked === locked) return
  if (locked) {
    const cost = lockCost(rows.filter((r) => r.locked).length)
    if (cost === null) throw bad('lock_cap', 'A pet can keep only 2 locked skills.')
    await spendItems(tx, character.id, PET_LOCK_ITEM, cost, `You need ${cost} Pet Skill Lock.`)
  }
  await saveSkills(
    tx,
    pet.id,
    rows.map((r) => (r === row ? { ...r, locked } : r)),
  )
}

async function removeSkill({ tx, character, pet }: Ctx, skillId: number) {
  const rows = await skillRows(tx, pet.id)
  const row = slottedSkill(rows, skillId)
  const count = Number(rebornPetFoods().grow.PetSkillRemoveCnt ?? 1)
  await spendItems(tx, character.id, PET_SKILL_REMOVE_ITEM, count, 'You need a skill remover.')
  // The freed slot stays unlocked.
  await saveSkills(
    tx,
    pet.id,
    rows.filter((r) => r !== row),
  )
  await refreshIfActive(tx, pet)
}

async function evolve({ tx, character, pet }: Ctx, into: string | undefined) {
  if (pet.level < EVOLVE_LEVEL)
    throw bad('too_low', `Your pet must reach level ${EVOLVE_LEVEL} to evolve.`)
  const forms = evolutionsOf(pet.species)
  if (forms.length === 0) throw bad('no_evolution', 'This pet cannot evolve.')
  const form = into ? forms.find((f) => f.item === into) : forms.length === 1 ? forms[0] : null
  if (!form) throw bad('choose_form', 'Choose which form your pet evolves into.')
  await spendItems(
    tx,
    character.id,
    FEATHER_ITEM,
    EVOLVE_FEATHERS,
    `You need ${EVOLVE_FEATHERS} Feathers.`,
  )
  await tx
    .update(characterPets)
    .set({ species: form.item, growth: pet.growth + EVOLVE_GROWTH })
    .where(eq(characterPets.id, pet.id))
  await refreshIfActive(tx, pet)
}

async function release({ tx, pet }: Ctx) {
  if (pet.active) throw bad('active', 'Set another pet active or rest this one first.')
  await tx.delete(characterPets).where(eq(characterPets.id, pet.id))
}

export async function petRoutes(
  app: FastifyInstance,
  { db, random = cryptoRandom }: PetRouteOptions,
) {
  const item = { config: { rateLimit: RATE_LIMITS.item } }

  /** One locked transaction: character, then every pet (settling digestion), then the result. */
  const run = (request: FastifyRequest, action: (tx: Tx, character: CharacterRow) => unknown) => {
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      await settlePets(tx, character, random())
      await action(tx, character)
      return actionResult(tx, character.id)
    })
  }
  /** `run` for one pet of the character, locked after the character. */
  const onPet = (request: FastifyRequest, action: (ctx: Ctx) => Promise<unknown>) => {
    const { id } = petParamsSchema.parse(request.params)
    return run(request, async (tx, character) =>
      action({ tx, character, pet: await lockPet(tx, character.id, id), random: random() }),
    )
  }

  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, (request) => run(request, () => {}))

  // Decision 17: 100 Gold per extra kennel slot, up to 5.
  app.post('/slots/unlock', item, (request) =>
    run(request, async (tx, character) => {
      if (character.petSlots >= KENNEL_MAX_SLOTS)
        throw bad('slot_cap', `The kennel holds at most ${KENNEL_MAX_SLOTS} pets.`)
      await spendCurrency(tx, character, 'gold', KENNEL_SLOT_PRICE)
      await tx
        .update(characters)
        .set({ petSlots: character.petSlots + 1 })
        .where(eq(characters.id, character.id))
    }),
  )
  app.post('/:id/active', item, (request) =>
    onPet(request, (ctx) => setActive(ctx, petActiveBodySchema.parse(request.body).active)),
  )
  app.post('/:id/feed', item, (request) =>
    onPet(request, (ctx) => feed(ctx, petFeedBodySchema.parse(request.body).foods)),
  )
  app.post('/:id/digest-now', item, (request) =>
    onPet(request, (ctx) => digestNow(ctx, petDigestNowBodySchema.parse(request.body).currency)),
  )
  app.post('/:id/skills/learn', item, (request) =>
    onPet(request, (ctx) => learn(ctx, petSkillKindBodySchema.parse(request.body).kind)),
  )
  app.post('/:id/skills/book', item, (request) =>
    onPet(request, (ctx) => learnBook(ctx, petBookBodySchema.parse(request.body).item)),
  )
  app.post('/:id/skills/slot', item, (request) =>
    onPet(request, (ctx) => unlockSkillSlot(ctx, petSkillKindBodySchema.parse(request.body).kind)),
  )
  app.post('/:id/skills/:skill/lock', item, (request) =>
    onPet(request, (ctx) => lockSkill(ctx, petSkillParamsSchema.parse(request.params).skill, true)),
  )
  app.post('/:id/skills/:skill/unlock', item, (request) =>
    onPet(request, (ctx) =>
      lockSkill(ctx, petSkillParamsSchema.parse(request.params).skill, false),
    ),
  )
  app.post('/:id/skills/:skill/remove', item, (request) =>
    onPet(request, (ctx) => removeSkill(ctx, petSkillParamsSchema.parse(request.params).skill)),
  )
  app.post('/:id/evolve', item, (request) =>
    onPet(request, (ctx) => evolve(ctx, petEvolveBodySchema.parse(request.body ?? {}).into)),
  )
  app.post('/:id/release', item, (request) => onPet(request, release))
}

export default petRoutes
