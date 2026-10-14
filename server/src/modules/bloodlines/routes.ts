// Bloodline limits (M5 decisions 11-14): the Ninja House turn-ins and 3 active limits.
// Every action locks the character row first, then the limit rows (plan ground rules).
import { and, eq, sum } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  bloodlineActiveBodySchema,
  bloodlineParamsSchema,
  type BloodlinesView,
  type BloodlineTurnInResult,
} from '../../../../shared/src/schemas/bloodlines.js'
import type { Db } from '../../db/client.js'
import { characterBloodlines, characters, inventoryItems } from '../../db/schema.js'
import { unequippedBagItemsWhere } from '../../game/bag.js'
import { rebornBloodlines } from '../../game/data.js'
import { removeItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { bloodlineBonuses } from '../../game/bloodlines.js'
export { bloodlineBonuses } from '../../game/bloodlines.js'
export { limitItemDrops } from './rules.js'

type CharacterRow = typeof characters.$inferSelect
const bad = (code: string, message: string) => new HttpError(400, code, message)
const DAY_MS = 86_400_000
const SLOTS = [0, 1, 2] as const

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10)
/** Lazy daily reset (decision 12): turn-ins count only on the stored UTC day. */
const turnInsUsed = (character: CharacterRow) =>
  character.bloodlineDay === utcDay() ? character.bloodlineTurnIns : 0

const limitData = (id: number) => rebornBloodlines().limits.find((l) => l.id === id)!

const limitRows = (tx: Tx | Db, characterId: string) =>
  tx.select().from(characterBloodlines).where(eq(characterBloodlines.characterId, characterId))

/** Unequipped bag count of each item id. */
async function itemCounts(tx: Tx | Db, characterId: string) {
  const rows = await tx
    .select({ itemId: inventoryItems.itemId, count: sum(inventoryItems.count).mapWith(Number) })
    .from(inventoryItems)
    .where(unequippedBagItemsWhere(characterId))
    .groupBy(inventoryItems.itemId)
  return new Map(rows.map((r) => [r.itemId, r.count]))
}

async function view(tx: Tx | Db, character: CharacterRow): Promise<BloodlinesView> {
  const data = rebornBloodlines()
  const rows = await limitRows(tx, character.id)
  const counts = await itemCounts(tx, character.id)
  const label = (field: string) =>
    Object.values(data.stats).find((s) => s.field === field)?.label ?? field
  const bonuses = await bloodlineBonuses(tx, character.id)
  return {
    turnInsUsed: turnInsUsed(character),
    turnInsPerDay: data.turnInsPerDay,
    itemsPerTurnIn: data.itemsPerTurnIn,
    amityPerTurnIn: data.amityPerTurnIn,
    maxActive: data.maxActive,
    resetAt: new Date(Date.parse(`${utcDay()}T00:00:00Z`) + DAY_MS).toISOString(),
    bonuses: Object.entries(bonuses).map(([field, value]) => ({
      field,
      label: label(field),
      value,
    })),
    limits: data.limits.map((limit) => {
      const row = rows.find((r) => r.limitId === limit.id)
      return {
        limitId: limit.id,
        nameKey: limit.nameKey,
        npcId: limit.npcId,
        npcNameKey: limit.npcNameKey,
        requiredLevel: limit.requiredLevel,
        unlockItem: limit.unlockItem,
        itemsHeld: counts.get(limit.unlockItem) ?? 0,
        amity: row?.amity ?? 0,
        amityNeeded: limit.amity,
        unlocked: row?.unlockedAt != null,
        active: row?.activeSlot != null,
        stats: [
          ...Object.entries(limit.base).map(([field, value]) => ({
            field,
            label: label(field),
            value,
          })),
          ...limit.bonus.map(({ field, value }) => ({ field, label: label(field), value })),
        ],
      }
    }),
  }
}

async function lockLimit(tx: Tx, characterId: string, limitId: number) {
  const [row] = await tx
    .select()
    .from(characterBloodlines)
    .where(
      and(
        eq(characterBloodlines.characterId, characterId),
        eq(characterBloodlines.limitId, limitId),
      ),
    )
    .for('update')
  return row
}

async function turnIn(tx: Tx, userId: string, limitId: number): Promise<BloodlineTurnInResult> {
  const character = await lockCharacter(tx, userId)
  const data = rebornBloodlines()
  const limit = limitData(limitId)
  if (character.level < limit.requiredLevel)
    throw bad('too_low', `This bloodline needs level ${limit.requiredLevel}.`)
  const used = turnInsUsed(character)
  if (used >= data.turnInsPerDay)
    throw bad('daily_limit', `You can turn in items ${data.turnInsPerDay} times a day.`)
  const row = await lockLimit(tx, character.id, limitId)
  if (row?.unlockedAt) throw bad('already_unlocked', 'This bloodline is already unlocked.')
  const held = (await itemCounts(tx, character.id)).get(limit.unlockItem) ?? 0
  if (held < data.itemsPerTurnIn)
    throw bad('not_enough_items', `You need ${data.itemsPerTurnIn} of the requested item.`)

  await removeItems(tx, character.id, limit.unlockItem, data.itemsPerTurnIn)
  const amity = Math.min((row?.amity ?? 0) + data.amityPerTurnIn, limit.amity)
  const next = { amity, unlockedAt: amity >= limit.amity ? new Date() : null }
  await tx
    .insert(characterBloodlines)
    .values({ characterId: character.id, limitId, ...next })
    .onConflictDoUpdate({
      target: [characterBloodlines.characterId, characterBloodlines.limitId],
      set: next,
    })
  const [updated] = await tx
    .update(characters)
    .set({ bloodlineDay: utcDay(), bloodlineTurnIns: used + 1 })
    .where(eq(characters.id, character.id))
    .returning()
  return { ...(await view(tx, updated!)), character: toCharacter(updated!) }
}

async function setActive(tx: Tx, userId: string, limitId: number, active: boolean) {
  const character = await lockCharacter(tx, userId)
  const row = await lockLimit(tx, character.id, limitId)
  if (active !== (row?.activeSlot != null)) {
    const taken = (await limitRows(tx, character.id)).flatMap((r) =>
      r.activeSlot == null ? [] : [r.activeSlot],
    )
    if (active) {
      if (!row?.unlockedAt) throw bad('locked', 'Unlock this bloodline at the Ninja House first.')
      if (character.level < limitData(limitId).requiredLevel)
        throw bad('too_low', `This bloodline needs level ${limitData(limitId).requiredLevel}.`)
      if (taken.length >= rebornBloodlines().maxActive)
        throw bad(
          'too_many_active',
          `Only ${rebornBloodlines().maxActive} bloodlines can be active.`,
        )
    }
    const activeSlot = active ? SLOTS.find((slot) => !taken.includes(slot))! : null
    await tx
      .update(characterBloodlines)
      .set({ activeSlot })
      .where(
        and(
          eq(characterBloodlines.characterId, character.id),
          eq(characterBloodlines.limitId, limitId),
        ),
      )
    await refreshArenaSnapshot(tx, character.id)
  }
  return view(tx, character)
}

export async function bloodlineRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    view(db, await characterOf(db, requireUser(request).id)),
  )
  app.post('/:id/turn-in', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const userId = requireUser(request).id
    const { id } = bloodlineParamsSchema.parse(request.params)
    return db.transaction((tx) => turnIn(tx, userId, id))
  })
  app.post('/:id/active', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const userId = requireUser(request).id
    const { id } = bloodlineParamsSchema.parse(request.params)
    const { active } = bloodlineActiveBodySchema.parse(request.body)
    return db.transaction((tx) => setActive(tx, userId, id, active))
  })
}

export default bloodlineRoutes
