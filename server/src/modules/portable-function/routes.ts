// Reborn's Portable Function under /api/game/portable-function: Synthesis (synthesisRecipeName /
// synthesisCreate), Recast (getRecastInfo / recastAttempt) and Impress (getImpressRate /
// impressAttempt). Reborn keeps its slots on the server; ours are the row ids of each request.
// Rules live in game/portable-function.ts. Every action locks the character row, then the item
// rows, checks bag room before using anything up, and rolls on the server.
import { addIdentifyProp, createRandom, isAppraised } from '@pockie/game-core'
import { and, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { OUTFIT_STARS, STAR_REQUIRED_TIER } from '../../../../shared/src/schemas/outfit.js'
import {
  RECAST_TALISMAN_COSTS,
  impressSchema,
  recastSchema,
  synthesisSchema,
  type ImpressInput,
  type ImpressPreview,
  type RecastInfo,
  type SynthesisPreview,
} from '../../../../shared/src/schemas/portable-function.js'
import type { Db } from '../../db/client.js'
import { inventoryItems, outfitRecasts } from '../../db/schema.js'
import {
  bagItemsWhere,
  itemInfo,
  itemStackSize,
  requireBagRoom,
  unequippedBagItemsWhere,
} from '../../game/bag.js'
import { identifyList, identifyTables, item, itemNameKey } from '../../game/data.js'
import { newGearState } from '../../game/gear.js'
import {
  PORTABLE_FUNCTION_PLACEHOLDERS,
  RECAST_TALISMAN,
  SYNTHESIS_MIN_LEVEL,
  canRecast,
  impressBaseRate,
  impressOdds,
  recastRange,
  rollImpress,
  rollRecast,
  rollSynthesis,
  synthesisPartProblem,
  synthesisPlan,
  type RecastRange,
  type SynthesisPart,
} from '../../game/portable-function.js'
import { outfitOf } from '../../game/outfit.js'
import { grantItems, removeItems, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { bad, equipmentOf, pay, respond } from '../forge/routes.js'
import { characterOf, lockCharacter, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

type ItemRow = typeof inventoryItems.$inferSelect
const random = () => createRandom(randomInt(2 ** 31))
const BAG_FULL = 'Inventory is full! Please make some space first.'

/** The character's bag rows (worn included) with these ids, in order; locked when `lock`. */
async function rowsOf(tx: Tx | Db, characterId: string, ids: string[], lock: boolean) {
  const query = tx
    .select()
    .from(inventoryItems)
    .where(and(bagItemsWhere(characterId), inArray(inventoryItems.id, [...new Set(ids)])))
  const rows = lock ? await query.for('update') : await query
  return ids.map((id) => {
    const row = rows.find((r) => r.id === id)
    if (!row) throw new HttpError(404, 'no_item', 'You do not have that item.')
    return row
  })
}

/** Uses up `count` of a locked row. */
async function useUp(tx: Tx, row: ItemRow, count: number) {
  if (count <= 0) return
  if (count >= row.count) await tx.delete(inventoryItems).where(eq(inventoryItems.id, row.id))
  else
    await tx
      .update(inventoryItems)
      .set({ count: row.count - count })
      .where(eq(inventoryItems.id, row.id))
}

const held = async (tx: Tx | Db, characterId: string, itemId: string) =>
  (
    await tx
      .select({ count: inventoryItems.count })
      .from(inventoryItems)
      .where(and(unequippedBagItemsWhere(characterId), eq(inventoryItems.itemId, itemId)))
  ).reduce((sum, row) => sum + row.count, 0)

// --- Synthesis ---

/**
 * Checks the Main Item and the two Catalysts (OnMainTestAdd / OnSecondaryTestAdd); a stack may fill
 * several slots. Synthesis destroys what it uses, so worn, locked and socketed items are refused
 * like Reborn's Multi Sell refuses them.
 */
function checkSynthesisRows(rows: ItemRow[], star: boolean) {
  const uses = new Map<string, number>()
  rows.forEach((row, slot) => {
    if (row.equippedSlot) throw bad('worn', 'Take that item off first.')
    if (row.locked) throw bad('locked', 'Locked items cannot be synthesized.')
    if (row.gems.some(Boolean)) throw bad('socketed', 'Remove the gems from that item first.')
    if (item(row.itemId)?.class === 'EquipItem' && !isAppraised(row))
      throw bad('unappraised', 'Appraise that item first.')
    const problem = !star && synthesisPartProblem(row.itemId, slot > 0)
    if (problem) throw bad('cannot_synthesize', problem)
    uses.set(row.id, (uses.get(row.id) ?? 0) + 1)
  })
  if (rows.some((row) => uses.get(row.id)! > row.count))
    throw bad('not_enough', 'You do not have enough of that item.')
}

const partOf = (row: ItemRow): SynthesisPart => ({ itemId: row.itemId, lines: row.identifyCount })

/**
 * Reborn's star rule: a top +N outfit with two matching, unstarred copies of itself gains one
 * sure star, up to five. Returns the stars it would reach, or undefined for any other trio.
 */
function starSynthesis([main, ...catalysts]: ItemRow[]) {
  if (outfitOf(main!.itemId)?.plus !== STAR_REQUIRED_TIER) return undefined
  if (catalysts.some((row) => row.itemId !== main!.itemId)) return undefined
  if (OUTFIT_STARS.requireUnstarredCatalysts && catalysts.some((row) => row.stars > 0))
    throw bad('starred_catalyst', 'The catalyst outfits must have no stars.')
  if (main!.stars >= OUTFIT_STARS.maxStars)
    throw bad('max_stars', `That outfit already has ${OUTFIT_STARS.maxStars} stars.`)
  return main!.stars + 1
}

/** The level gate, the slot checks and the plan of a Synthesis request. */
function synthesisSetup(level: number, rows: ItemRow[]) {
  if (level < SYNTHESIS_MIN_LEVEL)
    throw bad('too_low', `Synthesis opens at level ${SYNTHESIS_MIN_LEVEL}.`)
  if (new Set(rows.map((row) => row.id)).size === rows.length) {
    const stars = starSynthesis(rows)
    if (stars !== undefined) {
      checkSynthesisRows(rows, true)
      return { stars }
    }
  }
  checkSynthesisRows(rows, false)
  // Stars live on the row and an upgrade makes a new one; only +31s starred before the rule moved
  // to +32 can get here.
  if (rows[0]!.stars > 0) throw bad('starred', 'Starred outfits cannot be upgraded.')
  const [main, ...rest] = rows.map(partOf) as [SynthesisPart, SynthesisPart, SynthesisPart]
  const catalysts = rest as [SynthesisPart, SynthesisPart]
  const plan = synthesisPlan(main, catalysts)
  if ('error' in plan) throw bad('no_recipe', plan.error)
  return { main, catalysts, plan }
}

/** A made item: stackable ones join a stack; others get a row whose id is returned. */
async function grantResult(
  tx: Tx,
  characterId: string,
  itemId: string,
  bound: boolean,
  lines: number,
  rng: ReturnType<typeof random>,
) {
  if (itemStackSize(itemId) > 1) {
    await grantItems(tx, characterId, [{ itemId, bound, identifyCount: lines }])
    return undefined
  }
  const [row] = await tx
    .insert(inventoryItems)
    .values({ characterId, itemId, bound, ...newGearState(itemId, lines, rng) })
    .returning({ id: inventoryItems.id })
  return row!.id
}

/** Pays a star Synthesis: the catalysts are used up and the main outfit gains its star. */
async function starSynthesize(
  tx: Tx,
  character: { id: string } & Parameters<typeof pay>[1],
  rows: ItemRow[],
  stars: number,
) {
  const [main, ...catalysts] = rows as [ItemRow, ItemRow, ItemRow]
  await pay(tx, character, 'stone', PORTABLE_FUNCTION_PLACEHOLDERS.synthesisStone)
  for (const row of catalysts) await useUp(tx, row, 1)
  await tx.update(inventoryItems).set({ stars }).where(eq(inventoryItems.id, main.id))
  return {
    success: true,
    resultItemId: main.itemId,
    resultNameKey: itemNameKey(main.itemId),
    ...(await respond(tx, character.id)),
  }
}

// --- Recast ---

function recastRangeOf(row: ItemRow): RecastRange {
  const range = recastRange(row.itemId)
  if (!range) throw bad('cannot_recast', 'This item cannot be used for recasting.')
  return range
}

/** The stored ISV, else the avatar's own Up values. */
async function isvOf(tx: Tx | Db, row: ItemRow, range: RecastRange) {
  const [stored] = await tx.select().from(outfitRecasts).where(eq(outfitRecasts.itemId, row.id))
  return stored
    ? ([stored.strength, stored.agility, stored.stamina] as [number, number, number])
    : range.base
}

// --- Impress ---

/** The rows and odds of an Impress request (IdentifySystem.CanImpressEquip, Reborn's slots). */
async function impressSetup(tx: Tx | Db, characterId: string, input: ImpressInput, lock: boolean) {
  const ids = [input.itemId, input.bladeId, ...(input.crystalId ? [input.crystalId] : [])]
  const [gear, blade, crystal] = (await rowsOf(tx, characterId, ids, lock)) as [
    ItemRow,
    ItemRow,
    ItemRow | undefined,
  ]
  const config = equipmentOf(gear, 'impressed')
  if (!isAppraised(gear)) throw bad('unappraised', 'Appraise that item first.')
  if (gear.props.length >= 4) throw bad('full', 'That item already has 4 stat lines.')
  const list = identifyList(gear.itemId)
  if (!list) throw bad('cannot_impress', 'That item cannot be impressed.')
  const useLevel = config.UseLevel ?? 0
  const bladeDef = item(blade.itemId)
  if (bladeDef?.class !== 'ImpressItem') throw bad('not_blade', 'That is not a Carving Blade.')
  if (Number(bladeDef.ImpressMaxLevel) < useLevel)
    throw bad(
      'blade_level',
      `That blade only carves items up to level ${bladeDef.ImpressMaxLevel}.`,
    )
  const crystalDef = crystal && item(crystal.itemId)
  if (crystal && crystalDef?.class !== 'ImpressRateItem')
    throw bad('not_crystal', 'That is not a Carving Crystal.')
  if (crystalDef && Number(crystalDef.ImpressMaxLevel) < useLevel)
    throw bad(
      'crystal_level',
      `That crystal only helps items up to level ${crystalDef.ImpressMaxLevel}.`,
    )
  // The fourth line of an item with a gold group is the gold one, at the gold rate.
  const base = impressBaseRate(useLevel, gear.props.length === 3 && list.SpecialIdentifyID > 0)
  if (base === undefined) throw bad('no_rate', 'Items of that level cannot be impressed.')
  const odds = impressOdds(base, crystal?.count ?? 0, Number(crystalDef?.ImpressRate ?? 0))
  return { gear, blade, crystal, list, odds }
}

const recastParams = z.object({ itemId: z.uuid() }).strict()

export default async function portableFunctionRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Reborn's synthesisRecipeName: what the three slots make, or why they make nothing.
  app.post(
    '/synthesis/preview',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (request): Promise<SynthesisPreview> => {
      const { mainId, catalystIds } = synthesisSchema.parse(request.body)
      const character = await characterOf(db, requireUser(request).id)
      const rows = await rowsOf(db, character.id, [mainId, ...catalystIds], false)
      const setup = synthesisSetup(character.level, rows)
      if (setup.stars !== undefined) {
        const [main] = rows as [ItemRow]
        return {
          kind: 'star',
          resultItemId: main.itemId,
          resultNameKey: itemNameKey(main.itemId),
          resultInfo: itemInfo(main.itemId, { stars: setup.stars }),
          rate: 100,
          stars: setup.stars,
        }
      }
      const { plan } = setup
      const resultItemId = plan.kind === 'recipe' ? plan.resultItemId : null
      return {
        kind: plan.kind,
        resultItemId,
        resultNameKey: resultItemId ? itemNameKey(resultItemId) : null,
        resultInfo: resultItemId ? itemInfo(resultItemId) : null,
        rate: plan.rate,
        ...(plan.kind === 'random' && plan.value && { value: plan.value }),
      }
    },
  )

  // Reborn's synthesisCreate / ComposeSystem custom 126: success uses all three and makes the
  // result (bound if anything used was); a failed recipe roll uses only the catalysts.
  app.post('/synthesis', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { mainId, catalystIds } = synthesisSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const rows = await rowsOf(tx, character.id, [mainId, ...catalystIds], true)
      const setup = synthesisSetup(character.level, rows)
      if (setup.stars !== undefined) return starSynthesize(tx, character, rows, setup.stars)
      const { main, catalysts, plan } = setup
      const rng = random()
      const roll = rollSynthesis(main, catalysts, plan, rng)
      const bound = rows.some((row) => row.bound)
      if (roll.resultItemId)
        await requireBagRoom(tx, character.id, [{ itemId: roll.resultItemId, bound }], {
          message: BAG_FULL,
        })
      await pay(tx, character, 'stone', PORTABLE_FUNCTION_PLACEHOLDERS.synthesisStone)
      // CopyRecastUpProp: read the main outfit's ISV before it is used up.
      const [mainRow] = rows as [ItemRow]
      const [recast] = await tx
        .select()
        .from(outfitRecasts)
        .where(eq(outfitRecasts.itemId, mainRow.id))
      const used = roll.success ? rows : rows.slice(1)
      for (const row of new Set(used)) {
        await useUp(tx, row, used.filter((other) => other === row).length)
      }
      let resultId: string | undefined
      if (roll.resultItemId) {
        resultId = await grantResult(tx, character.id, roll.resultItemId, bound, roll.lines, rng)
        const sameLook =
          Number(item(roll.resultItemId)?.Clothing ?? -1) === Number(item(mainRow.itemId)?.Clothing)
        if (recast && resultId && sameLook) {
          await tx.insert(outfitRecasts).values({ ...recast, itemId: resultId })
        }
      }
      return {
        success: roll.success,
        resultItemId: roll.resultItemId ?? null,
        resultNameKey: roll.resultItemId ? itemNameKey(roll.resultItemId) : null,
        ...(await respond(tx, character.id)),
      }
    })
  })

  // Reborn's getRecastInfo: an outfit's ISV with its bounds and the talismans in the bag.
  app.get(
    '/recast/:itemId',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (request): Promise<RecastInfo> => {
      const { itemId } = recastParams.parse(request.params)
      const character = await characterOf(db, requireUser(request).id)
      const [row] = await rowsOf(db, character.id, [itemId], false)
      const range = recastRangeOf(row!)
      const isv = await isvOf(db, row!, range)
      return {
        isv,
        base: range.base,
        max: range.max,
        talismans: await held(db, character.id, RECAST_TALISMAN),
        canRecast: canRecast(range, isv, []),
      }
    },
  )

  // Reborn's recastAttempt / AvatarSystem custom 309: locked stats stay, free ones reroll.
  app.post('/recast', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const { itemId, locked } = recastSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const [row] = (await rowsOf(tx, character.id, [itemId], true)) as [ItemRow]
      const range = recastRangeOf(row)
      const isv = await isvOf(tx, row, range)
      if (!canRecast(range, isv, locked))
        throw bad('cannot_recast', 'None of the free stats can change any more.')
      const cost = RECAST_TALISMAN_COSTS[locked.length]!
      if ((await held(tx, character.id, RECAST_TALISMAN)) < cost)
        throw bad('no_talisman', `Not enough Recast Talismans (${cost} needed).`)
      await removeItems(tx, character.id, RECAST_TALISMAN, cost)
      const [strength, agility, stamina] = rollRecast(range, isv, locked, random())
      await tx
        .insert(outfitRecasts)
        .values({ itemId: row.id, strength, agility, stamina })
        .onConflictDoUpdate({
          target: outfitRecasts.itemId,
          set: { strength, agility, stamina },
        })
      if (row.equippedSlot) await refreshArenaSnapshot(tx, character.id)
      return { isv: [strength, agility, stamina], ...(await respond(tx, character.id, row.id)) }
    })
  })

  // Reborn's getImpressRate: the success chance of the chosen gear, blade and crystals.
  app.post(
    '/impress/preview',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (request): Promise<ImpressPreview> => {
      const input = impressSchema.parse(request.body)
      const character = await characterOf(db, requireUser(request).id)
      const { odds } = await impressSetup(db, character.id, input, false)
      return odds
    },
  )

  // Reborn's impressAttempt / IdentifySystem.ImpressEquip: the blade is always used, the crystals
  // as impressOdds says; success adds one stat line and binds the gear to a bound blade or crystal.
  app.post('/impress', { config: { rateLimit: RATE_LIMITS.forge } }, async (request) => {
    const input = impressSchema.parse(request.body)
    const userId = requireUser(request).id
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      const { gear, blade, crystal, list, odds } = await impressSetup(tx, character.id, input, true)
      const rng = random()
      const added = addIdentifyProp(gear, list, identifyTables(), rng)
      if (!added) throw bad('no_line', 'No new stat line fits that item.')
      await pay(tx, character, 'gold', PORTABLE_FUNCTION_PLACEHOLDERS.impressGold)
      const success = rollImpress(odds.rate, rng)
      await useUp(tx, blade, 1)
      if (crystal) await useUp(tx, crystal, odds.crystalsUsed)
      if (success) {
        const props = [...gear.props, added]
        await tx
          .update(inventoryItems)
          .set({
            props,
            identifyCount: props.length,
            canIdentify: true,
            identifyTimes: Math.max(1, gear.identifyTimes),
            bound: gear.bound || blade.bound || (!!crystal?.bound && odds.crystalsUsed > 0),
          })
          .where(eq(inventoryItems.id, gear.id))
        if (gear.equippedSlot) await refreshArenaSnapshot(tx, character.id)
      }
      return { success, ...(await respond(tx, character.id, gear.id)) }
    })
  })
}
