// Impel Down (Reborn chunk 286) under /api/game/impel-down: 6 gates of 25 floors fought in order,
// 3 lives a day (a lost fight costs one), EXP and Zanpakuto crystals per floor (a sure one every
// 5th floor), Auto Sell, and at the intersection after floor 25 the next gate or a paid refresh.
// Lives and refreshes reset at 00:00 UTC. Each action locks the character row, then the ninja's.
import { createRandom, simulateFight, type Random } from '@pockie/game-core'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crystalInfo } from '../../../../game-core/src/zanpakuto/zanpakuto.js'
import {
  IMPEL_DOWN_RULES,
  impelDownFightSchema,
  refreshCost,
  type ImpelDownCrystalDrop,
  type ImpelDownFightResult,
  type ImpelDownView,
} from '../../../../shared/src/schemas/impel-down.js'
import type { Db } from '../../db/client.js'
import { characters, impelDownPlayers } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { equipmentBonuses, equippedGear } from '../../game/equipment.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { nextDay } from '../events/view.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  newSeed,
  saveCharacter,
  utcDay,
  withCharacter,
  withExp,
  type CharacterRow,
} from '../gates/common.js'
import { addSpiritCoins, grantZanpakutoCrystal } from '../zanpakuto/view.js'
import { floorBoss, floorDrops, floorEnemy, floorExp, gateLevel, guaranteed } from './floors.js'
import { autoSells, floorsCleared, rollCrystal, usedToday } from './rules.js'

type PlayerRow = typeof impelDownPlayers.$inferSelect

const { floorsPerGate, gates, lives, maxRefreshes } = IMPEL_DOWN_RULES

async function playerRow(tx: Tx | Db, characterId: string) {
  const [row] = await tx
    .select()
    .from(impelDownPlayers)
    .where(eq(impelDownPlayers.characterId, characterId))
  return row
}

/** The ninja's row, created on first use and locked (after the character row). */
async function lockPlayer(tx: Tx, characterId: string) {
  await tx.insert(impelDownPlayers).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(impelDownPlayers)
    .where(eq(impelDownPlayers.characterId, characterId))
    .for('update')
  return row!
}

async function savePlayer(tx: Tx, characterId: string, values: Partial<PlayerRow>) {
  const [row] = await tx
    .update(impelDownPlayers)
    .set(values)
    .where(eq(impelDownPlayers.characterId, characterId))
    .returning()
  return row!
}

function view(row: PlayerRow | undefined, now: Date): ImpelDownView {
  const gate = row?.gate ?? 0
  const floor = row?.floor ?? 0
  const intersection = floor >= floorsPerGate
  const refreshes = usedToday(row?.refreshDay ?? null, row?.refreshes ?? 0, now)
  return {
    gate,
    floor,
    maxFloor: row?.maxFloor ?? 0,
    intersection,
    lives: lives - usedToday(row?.livesDay ?? null, row?.livesUsed ?? 0, now),
    maxLives: lives,
    refreshes,
    refreshCost: refreshCost(refreshes, gate),
    nextGateLevel: gate + 1 < gates ? gateLevel(gate + 1) : null,
    exp: intersection ? 0 : floorExp(gate, floor),
    drops: intersection ? [] : floorDrops(gate, floor),
    resetAt: nextDay(now),
  }
}

function requireLevel(character: CharacterRow, gate = 0) {
  const level = gateLevel(gate)
  if (character.level < level)
    throw new HttpError(
      403,
      'level_too_low',
      `Gate ${gate + 1} of Impel Down needs level ${level}.`,
    )
}

/** A won floor's crystal: kept in the spirit inventory, or sold by Auto Sell or a full one. */
async function dropCrystal(
  tx: Tx,
  characterId: string,
  me: PlayerRow,
  autoSell: number,
  random: Random,
): Promise<ImpelDownCrystalDrop | null> {
  const iid = rollCrystal(floorDrops(me.gate, me.floor), guaranteed(me.floor), random)
  if (iid === null) return null
  const kept =
    !autoSells(iid, autoSell) && (await grantZanpakutoCrystal(tx, characterId, iid, random))
  if (kept) return { iid, sold: false, coins: 0 }
  const coins = crystalInfo(iid)!.coins
  await addSpiritCoins(tx, characterId, coins)
  return { iid, sold: true, coins }
}

async function fight(tx: Tx, character: CharacterRow, autoSell: number) {
  const now = new Date()
  requireLevel(character)
  requireAlive(character, 'fight')
  const me = await lockPlayer(tx, character.id)
  if (me.floor >= floorsPerGate)
    throw bad('intersection', 'Choose the next gate or refresh this one first.')
  const livesUsed = usedToday(me.livesDay, me.livesUsed, now)
  if (livesUsed >= lives) throw bad('no_lives', 'You have no lives left today.')
  // Like a dungeon boss fight, a floor costs no HP or MP: the ninja enters at full strength.
  const player = await playerFighter(tx, character)
  const gear = equipmentBonuses(await equippedGear(tx, character.id), character)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [floorEnemy(me.gate, me.floor, gear)],
    seed: newSeed(),
  })
  const won = replay.winner === 'attackers'
  const exp = won ? floorExp(me.gate, me.floor) : 0
  let crystal: ImpelDownCrystalDrop | null = null
  let after: PlayerRow
  if (won) {
    await saveCharacter(tx, character.id, withExp(character, {}, exp).update)
    crystal = await dropCrystal(tx, character.id, me, autoSell, createRandom(newSeed()))
    const cleared = floorsCleared(me.gate, me.floor + 1)
    after = await savePlayer(tx, character.id, {
      floor: me.floor + 1,
      maxFloor: Math.max(me.maxFloor, cleared),
    })
  } else {
    after = await savePlayer(tx, character.id, {
      livesDay: utcDay(now),
      livesUsed: livesUsed + 1,
    })
  }
  const result: ImpelDownFightResult = {
    replay,
    won,
    look: { clothing: floorBoss(me.gate, me.floor).clothing },
    exp,
    crystal,
    impelDown: view(after, now),
    character: await characterView(tx, character.id),
  }
  return result
}

async function nextGate(tx: Tx, character: CharacterRow) {
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  if (me.floor < floorsPerGate)
    throw bad('not_intersection', `Clear floor ${floorsPerGate} of this gate first.`)
  if (me.gate + 1 >= gates) throw bad('last_gate', 'This is the last gate.')
  requireLevel(character, me.gate + 1)
  return view(await savePlayer(tx, character.id, { gate: me.gate + 1, floor: 0 }), new Date())
}

async function refresh(tx: Tx, character: CharacterRow) {
  const now = new Date()
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  if (me.floor < floorsPerGate)
    throw bad('not_intersection', `Clear floor ${floorsPerGate} of this gate first.`)
  const refreshes = usedToday(me.refreshDay, me.refreshes, now)
  if (refreshes >= maxRefreshes) throw bad('no_refreshes', 'You cannot refresh again today.')
  const cost = refreshCost(refreshes, me.gate)
  if (character.giftCoupon < cost)
    throw bad('not_enough', `You need ${cost.toLocaleString('en-US')} Coupons.`)
  await tx
    .update(characters)
    .set({ giftCoupon: sql`${characters.giftCoupon} - ${cost}` })
    .where(eq(characters.id, character.id))
  const after = await savePlayer(tx, character.id, {
    floor: 0,
    refreshDay: utcDay(now),
    refreshes: refreshes + 1,
  })
  return view(after, now)
}

export async function impelDownRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    requireLevel(character)
    return view(await playerRow(db, character.id), new Date())
  })
  app.post('/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { autoSell } = impelDownFightSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => fight(tx, character, autoSell))
  })
  app.post('/next-gate', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, nextGate),
  )
  app.post('/refresh', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, refresh),
  )
}

export default impelDownRoutes
