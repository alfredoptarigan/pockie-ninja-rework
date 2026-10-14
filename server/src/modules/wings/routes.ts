// Wings and auras under /api/game/wings (M6 decisions 22-25): the view, enhancement and the Wing
// Collection. Every action locks the character row first, then the item rows, and checks inside.
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import { createRandom, type Bonuses, type Random } from '@pockie/game-core'
import {
  COLLECTION_REWARD_ITEM,
  collectionReward,
  WING_MAX_LEVEL,
} from '../../../../game-core/src/wings/constants.js'
import { enhance, type WingTalismans } from '../../../../game-core/src/wings/enhance.js'
import { wingStats } from '../../../../game-core/src/wings/stats.js'
import {
  wingCollectionParamsSchema,
  wingEnhanceBodySchema,
  wingRowParamsSchema,
  type OwnedWing,
  type TalismanFamily,
  type WingKind,
  type WingsView,
} from '../../../../shared/src/schemas/wings.js'
import type { Db } from '../../db/client.js'
import { characterWingCollection, inventoryItems } from '../../db/schema.js'
import { bagItemsWhere, requireBagRoom, unequippedBagItemsWhere } from '../../game/bag.js'
import { itemNameKey, rebornBloodlines, rebornWings } from '../../game/data.js'
import { consumeOne, grantItems, type Tx } from '../../game/progress.js'
import { WING_SLOT } from '../../game/wings.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
export { wingBonuses } from '../../game/wings.js'

type ItemRow = typeof inventoryItems.$inferSelect

const FAMILIES: readonly TalismanFamily[] = ['luck', 'safety', 'integrity']
const bad = (code: string, message: string) => new HttpError(400, code, message)
const cryptoRandom = () => createRandom(randomInt(2 ** 31))

function kindOf(itemId: string): WingKind | undefined {
  const { wings, auras } = rebornWings()
  if (wings.some((w) => w.item === itemId)) return 'wing'
  if (auras.some((a) => a.item === itemId)) return 'aura'
  return undefined
}

/** Reborn stat labels (M5 decision 11) plus the three wing-only fields of decision 23. */
const WING_LABELS: Record<string, string> = {
  counter: 'Counter %',
  vampiricHp: 'Life Steal %',
  decDamage: 'Damage Reduction %',
}
const labelOf = (field: string) =>
  WING_LABELS[field] ??
  Object.values(rebornBloodlines().stats).find((s) => s.field === field)?.label ??
  field
const statList = (bonuses: Partial<Bonuses>) =>
  Object.entries(bonuses).map(([field, value]) => ({ field, label: labelOf(field), value }))

const ownedWing = (row: ItemRow): OwnedWing => ({
  id: row.id,
  itemId: row.itemId,
  nameKey: itemNameKey(row.itemId),
  kind: kindOf(row.itemId)!,
  level: row.enhanceLevel,
  equipped: row.equippedSlot === WING_SLOT,
  stats: statList(wingStats(row.itemId, row.enhanceLevel)),
  next:
    row.enhanceLevel < WING_MAX_LEVEL
      ? statList(wingStats(row.itemId, row.enhanceLevel + 1))
      : null,
})

async function wingsView(tx: Tx | Db, characterId: string): Promise<WingsView> {
  const rows = await tx.select().from(inventoryItems).where(bagItemsWhere(characterId))
  const registered = new Set(
    (
      await tx
        .select({ itemId: characterWingCollection.itemId })
        .from(characterWingCollection)
        .where(eq(characterWingCollection.characterId, characterId))
    ).map((row) => row.itemId),
  )
  const { wings, auras, stones, talismans } = rebornWings()
  const loose = (itemId: string) =>
    rows
      .filter((row) => row.itemId === itemId && !row.equippedSlot)
      .reduce((sum, row) => sum + row.count, 0)
  const owned = rows.filter((row) => kindOf(row.itemId)).map(ownedWing)
  return {
    maxLevel: WING_MAX_LEVEL,
    equipped: owned.find((wing) => wing.equipped) ?? null,
    owned,
    stones: stones.map((s) => ({
      itemId: s.item,
      nameKey: itemNameKey(s.item),
      levelJump: s.levelJump,
      count: loose(s.item),
    })),
    talismans: talismans.map((t) => ({
      itemId: t.item,
      nameKey: itemNameKey(t.item),
      family: t.family,
      value: t.value,
      count: loose(t.item),
    })),
    rewardItemId: COLLECTION_REWARD_ITEM,
    collection: [...wings, ...auras].map(({ item }) => ({
      itemId: item,
      nameKey: itemNameKey(item),
      kind: kindOf(item)!,
      reward: collectionReward(item),
      registered: registered.has(item),
      owned: rows.some((row) => row.itemId === item),
    })),
  }
}

/** Locks the unequipped stacks of a material and uses one, bound stacks first. */
async function spendOne(tx: Tx, characterId: string, itemId: string, code: string) {
  const [row] = await tx
    .select()
    .from(inventoryItems)
    .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))
    .orderBy(desc(inventoryItems.bound))
    .limit(1)
    .for('update')
  if (!row) throw bad(code, 'You do not have that item.')
  await consumeOne(tx, row)
}

export interface WingRouteOptions {
  db: Db
  /** Tests pass a fixed roll; production uses crypto seeds. */
  random?: () => Random
}

export async function wingRoutes(
  app: FastifyInstance,
  { db, random = cryptoRandom }: WingRouteOptions,
) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    wingsView(db, (await characterOf(db, requireUser(request).id)).id),
  )

  // Decision 24: the stone and talismans are used up on every attempt.
  app.post('/:itemRowId/enhance', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemRowId } = wingRowParamsSchema.parse(request.params)
    const body = wingEnhanceBodySchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const [wing] = await tx
        .select()
        .from(inventoryItems)
        .where(and(bagItemsWhere(character.id), eq(inventoryItems.id, itemRowId)))
        .for('update')
      if (!wing) throw new HttpError(404, 'no_item', 'You do not have that item.')
      if (!kindOf(wing.itemId)) throw bad('not_wing', 'Only wings and auras can be enhanced here.')
      if (wing.enhanceLevel >= WING_MAX_LEVEL)
        throw bad('max_level', 'That wing cannot be enhanced any further.')
      const data = rebornWings()
      const stone = data.stones.find((s) => s.item === body.stone)
      if (!stone) throw bad('wrong_stone', 'Choose a wing stone.')
      const values: WingTalismans = {}
      for (const family of FAMILIES) {
        const itemId = body[family]
        if (!itemId) continue
        const talisman = data.talismans.find((t) => t.item === itemId && t.family === family)
        if (!talisman) throw bad('wrong_talisman', 'That talisman does not fit there.')
        values[family] = talisman.value
      }
      await spendOne(tx, character.id, stone.item, 'no_stone')
      for (const family of FAMILIES) {
        const itemId = body[family]
        if (itemId) await spendOne(tx, character.id, itemId, 'no_talisman')
      }
      const result = enhance(wing.enhanceLevel, stone, values, random())
      // A destroyed wing leaves the Wing slot with its row.
      if (result.level === null)
        await tx.delete(inventoryItems).where(eq(inventoryItems.id, wing.id))
      else
        await tx
          .update(inventoryItems)
          .set({ enhanceLevel: result.level })
          .where(eq(inventoryItems.id, wing.id))
      await refreshArenaSnapshot(tx, character.id)
      return { ...result, ...(await wingsView(tx, character.id)) }
    })
  })

  // Decision 25: registering keeps the wing; each id pays once.
  app.post('/collection/:itemId', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { itemId } = wingCollectionParamsSchema.parse(request.params)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      if (!kindOf(itemId)) throw bad('not_wing', 'Only wings and auras can be registered.')
      const [owned] = await tx
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(and(bagItemsWhere(character.id), eq(inventoryItems.itemId, itemId)))
        .limit(1)
      if (!owned) throw bad('no_item', 'Put that wing in your bag first.')
      const alreadyRegistered = () =>
        new HttpError(409, 'already_registered', 'That wing is already registered.')
      // A repeat claim is refused as such, before the bag-room check (character row is locked).
      const [done] = await tx
        .select({ itemId: characterWingCollection.itemId })
        .from(characterWingCollection)
        .where(
          and(
            eq(characterWingCollection.characterId, character.id),
            eq(characterWingCollection.itemId, itemId),
          ),
        )
      if (done) throw alreadyRegistered()
      const reward = collectionReward(itemId)
      // Bound, so wings passed between ninjas cannot farm tradeable shards.
      const shards = Array.from({ length: reward }, () => ({
        itemId: COLLECTION_REWARD_ITEM,
        bound: true,
      }))
      await requireBagRoom(tx, character.id, shards)
      const added = await tx
        .insert(characterWingCollection)
        .values({ characterId: character.id, itemId })
        .onConflictDoNothing()
        .returning()
      if (added.length === 0) throw alreadyRegistered()
      await grantItems(tx, character.id, shards)
      return { reward, ...(await wingsView(tx, character.id)) }
    })
  })
}

export default wingRoutes
