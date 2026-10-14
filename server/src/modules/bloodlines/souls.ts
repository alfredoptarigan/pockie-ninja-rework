// Bloodline souls and prayer (M5 decisions 13, 15, 16). Every action locks the character row
// first, then the soul rows by id, then the limit row, and checks state inside the transaction.
import { createRandom, type Random } from '@pockie/game-core'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import {
  discoverPerDay,
  feedPrayer,
  prayerNeeded,
  prayerPoints,
  refineType,
  rollSoul,
  soulLevelGate,
  synthesisGroups,
} from '../../../../game-core/src/reborn/souls.js'
import {
  bloodlineParamsSchema,
  prayerBodySchema,
  soulBindBodySchema,
  soulDiscoverBodySchema,
  soulIdsBodySchema,
  soulParamsSchema,
  soulRefineBodySchema,
  type SoulsView,
} from '../../../../shared/src/schemas/bloodlines.js'
import type { Db } from '../../db/client.js'
import { characterBloodlinePrayer, characters, characterSouls } from '../../db/schema.js'
import { rebornBloodlines, rebornSouls } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { isVip } from '../../game/vip.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { bad, lockLimit, nextUtcDay, utcDay } from './common.js'

type CharacterRow = typeof characters.$inferSelect
type SoulRow = typeof characterSouls.$inferSelect

/** Reborn's stat label; stat 18 is labelled "Defense Improvement %" but the soul is Block. */
const soulLabel = (field: string) =>
  field === 'parry'
    ? 'Block'
    : (Object.values(rebornBloodlines().stats).find((s) => s.field === field)?.label ?? field)
const random = (): Random => createRandom(randomInt(2 ** 31))
const discoveredToday = (character: CharacterRow) =>
  character.soulDay === utcDay() ? character.soulsDiscovered : 0

async function view(tx: Tx | Db, character: CharacterRow): Promise<SoulsView> {
  const data = rebornSouls()
  const souls = await tx
    .select()
    .from(characterSouls)
    .where(eq(characterSouls.characterId, character.id))
    .orderBy(asc(characterSouls.id))
  const prayers = await tx
    .select()
    .from(characterBloodlinePrayer)
    .where(eq(characterBloodlinePrayer.characterId, character.id))
    .orderBy(asc(characterBloodlinePrayer.limitId))
  return {
    souls: souls.map(({ id, type, level, limitId, socket }) => ({
      id,
      type,
      level,
      limitId,
      socket,
    })),
    inventory: data.inventory,
    socketsPerLimit: data.socketsPerLimit,
    discoveredToday: discoveredToday(character),
    discoverPerDay: discoverPerDay(isVip(character)),
    levelLimits: data.levelLimits,
    types: data.types.map(({ id, nameKey, field, valueByLevel }) => ({
      id,
      nameKey,
      field,
      label: soulLabel(field),
      valueByLevel,
    })),
    prayers: prayers.map(({ limitId, attribute, level, progress }) => ({
      limitId,
      attribute,
      level,
      progress,
      needed: level >= data.prayer.maxLevel ? 0 : prayerNeeded(level),
    })),
    prayerMaxLevel: data.prayer.maxLevel,
    prayerPoints: data.levelLimits.map((_, i) => prayerPoints(i + 1)),
    resetAt: nextUtcDay(),
  }
}

/** Locks the ninja's souls `ids` in id order; refuses duplicates, unknown ids and socketed ones. */
async function lockSouls(
  tx: Tx,
  characterId: string,
  ids: readonly string[],
  { loose = true } = {},
): Promise<Map<string, SoulRow>> {
  if (new Set(ids).size !== ids.length) throw bad('duplicate_soul', 'A soul is listed twice.')
  const rows = await tx
    .select()
    .from(characterSouls)
    .where(and(eq(characterSouls.characterId, characterId), inArray(characterSouls.id, [...ids])))
    .orderBy(asc(characterSouls.id))
    .for('update')
  if (rows.length !== ids.length) throw bad('no_soul', 'That soul no longer exists.')
  if (loose && rows.some((r) => r.limitId !== null))
    throw bad('socketed', 'Remove the soul from its bloodline first.')
  return new Map(rows.map((r) => [r.id, r]))
}

async function unlockedLimit(tx: Tx, characterId: string, limitId: number) {
  const row = await lockLimit(tx, characterId, limitId)
  if (!row?.unlockedAt) throw bad('locked', 'Unlock this bloodline at the Ninja House first.')
  return row
}

const deleteSouls = (tx: Tx, ids: readonly string[]) =>
  tx.delete(characterSouls).where(inArray(characterSouls.id, [...ids]))

async function discover(tx: Tx, userId: string, wanted: number) {
  const character = await lockCharacter(tx, userId)
  const used = discoveredToday(character)
  const perDay = discoverPerDay(isVip(character))
  if (used + wanted > perDay)
    throw bad('daily_limit', `You can discover ${perDay} souls a day (${perDay - used} left).`)
  const [{ held }] = (await tx
    .select({ held: count() })
    .from(characterSouls)
    .where(eq(characterSouls.characterId, character.id))) as [{ held: number }]
  if (held + wanted > rebornSouls().inventory)
    throw bad('inventory_full', `Your soul inventory is full (${rebornSouls().inventory} souls).`)
  const rng = random()
  await tx
    .insert(characterSouls)
    .values(Array.from({ length: wanted }, () => ({ characterId: character.id, ...rollSoul(rng) })))
  const [updated] = await tx
    .update(characters)
    .set({ soulDay: utcDay(), soulsDiscovered: used + wanted })
    .where(eq(characters.id, character.id))
    .returning()
  return view(tx, updated!)
}

async function destroy(tx: Tx, userId: string, ids: string[]) {
  const character = await lockCharacter(tx, userId)
  await lockSouls(tx, character.id, ids)
  await deleteSouls(tx, ids)
  return view(tx, character)
}

async function synthesize(tx: Tx, userId: string, ids: string[]) {
  const character = await lockCharacter(tx, userId)
  const souls = await lockSouls(tx, character.id, ids)
  const levels = synthesisGroups(ids.map((id) => souls.get(id)!.level))
  if (!levels)
    throw bad(
      'bad_synthesis',
      'Synthesis needs groups of 3 souls of the same level, below level 10.',
    )
  await deleteSouls(tx, ids)
  const rng = random()
  await tx
    .insert(characterSouls)
    // The new soul's type is uniform, like a discovery.
    .values(levels.map((level) => ({ characterId: character.id, level, type: rollSoul(rng).type })))
  return view(tx, character)
}

async function refine(tx: Tx, userId: string, targetId: string, fuelIds: string[]) {
  const character = await lockCharacter(tx, userId)
  const souls = await lockSouls(tx, character.id, [targetId, ...fuelIds])
  const target = souls.get(targetId)!
  if (fuelIds.some((id) => souls.get(id)!.level !== target.level))
    throw bad(
      'level_mismatch',
      'Refining needs souls of the same level as the first selected soul.',
    )
  const rng = random()
  const type = fuelIds.reduce((current) => refineType(current, rng), target.type)
  await deleteSouls(tx, fuelIds)
  await tx.update(characterSouls).set({ type }).where(eq(characterSouls.id, targetId))
  return view(tx, character)
}

async function bind(tx: Tx, userId: string, soulId: string, limitId: number) {
  const character = await lockCharacter(tx, userId)
  const soul = (await lockSouls(tx, character.id, [soulId])).get(soulId)!
  await unlockedLimit(tx, character.id, limitId)
  const gate = soulLevelGate(soul.level)
  if (character.level < gate) throw bad('too_low', `This soul needs character level ${gate}.`)
  const socketed = await tx
    .select({ type: characterSouls.type, socket: characterSouls.socket })
    .from(characterSouls)
    .where(and(eq(characterSouls.characterId, character.id), eq(characterSouls.limitId, limitId)))
  if (socketed.some((s) => s.type === soul.type))
    throw bad('duplicate_type', 'This bloodline already holds a soul of that type.')
  const socket = Array.from({ length: rebornSouls().socketsPerLimit }, (_, i) => i).find(
    (i) => !socketed.some((s) => s.socket === i),
  )
  if (socket === undefined)
    throw bad('sockets_full', 'All soul sockets of this bloodline are full.')
  await tx.update(characterSouls).set({ limitId, socket }).where(eq(characterSouls.id, soulId))
  await refreshArenaSnapshot(tx, character.id)
  return view(tx, character)
}

async function unbind(tx: Tx, userId: string, soulId: string) {
  const character = await lockCharacter(tx, userId)
  const soul = (await lockSouls(tx, character.id, [soulId], { loose: false })).get(soulId)!
  if (soul.limitId === null) throw bad('not_socketed', 'This soul is not socketed.')
  await tx
    .update(characterSouls)
    .set({ limitId: null, socket: null })
    .where(eq(characterSouls.id, soulId))
  await refreshArenaSnapshot(tx, character.id)
  return view(tx, character)
}

async function pray(tx: Tx, userId: string, limitId: number, attribute: number, ids: string[]) {
  const character = await lockCharacter(tx, userId)
  const souls = await lockSouls(tx, character.id, ids)
  await unlockedLimit(tx, character.id, limitId)
  const [row] = await tx
    .select()
    .from(characterBloodlinePrayer)
    .where(
      and(
        eq(characterBloodlinePrayer.characterId, character.id),
        eq(characterBloodlinePrayer.limitId, limitId),
      ),
    )
    .for('update')
  // Switching the attribute resets level and progress (decision 16).
  const state = row && row.attribute === attribute ? row : { level: 0, progress: 0 }
  if (state.level >= rebornSouls().prayer.maxLevel)
    throw bad('max_level', 'This prayer is at its highest level.')
  const points = [...souls.values()].reduce((sum, s) => sum + prayerPoints(s.level), 0)
  const next = { attribute, ...feedPrayer(state, points) }
  await deleteSouls(tx, ids)
  await tx
    .insert(characterBloodlinePrayer)
    .values({ characterId: character.id, limitId, ...next })
    .onConflictDoUpdate({
      target: [characterBloodlinePrayer.characterId, characterBloodlinePrayer.limitId],
      set: next,
    })
  await refreshArenaSnapshot(tx, character.id)
  return view(tx, character)
}

export async function soulRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const item = { config: { rateLimit: RATE_LIMITS.item } }
  app.get('/souls', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    view(db, await characterOf(db, requireUser(request).id)),
  )
  app.post('/souls/discover', item, async (request) => {
    const userId = requireUser(request).id
    const { count: wanted } = soulDiscoverBodySchema.parse(request.body)
    return db.transaction((tx) => discover(tx, userId, wanted))
  })
  app.post('/souls/destroy', item, async (request) => {
    const userId = requireUser(request).id
    const { soulIds } = soulIdsBodySchema.parse(request.body)
    return db.transaction((tx) => destroy(tx, userId, soulIds))
  })
  app.post('/souls/synthesize', item, async (request) => {
    const userId = requireUser(request).id
    const { soulIds } = soulIdsBodySchema.parse(request.body)
    return db.transaction((tx) => synthesize(tx, userId, soulIds))
  })
  app.post('/souls/refine', item, async (request) => {
    const userId = requireUser(request).id
    const { targetId, fuelIds } = soulRefineBodySchema.parse(request.body)
    return db.transaction((tx) => refine(tx, userId, targetId, fuelIds))
  })
  app.post('/souls/:soulId/bind', item, async (request) => {
    const userId = requireUser(request).id
    const { soulId } = soulParamsSchema.parse(request.params)
    const { limitId } = soulBindBodySchema.parse(request.body)
    return db.transaction((tx) => bind(tx, userId, soulId, limitId))
  })
  app.post('/souls/:soulId/unbind', item, async (request) => {
    const userId = requireUser(request).id
    const { soulId } = soulParamsSchema.parse(request.params)
    return db.transaction((tx) => unbind(tx, userId, soulId))
  })
  app.post('/:id/prayer', item, async (request) => {
    const userId = requireUser(request).id
    const { id } = bloodlineParamsSchema.parse(request.params)
    const { attribute, soulIds } = prayerBodySchema.parse(request.body)
    return db.transaction((tx) => pray(tx, userId, id, attribute, soulIds))
  })
}
