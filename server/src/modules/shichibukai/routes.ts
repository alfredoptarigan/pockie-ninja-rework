// Shichibukai (Reborn's "Sea of Fallen Waters" dice expedition, level 30) under
// /api/game/shichibukai: start an expedition on an unlocked floor and difficulty (one of today's
// attempts), roll (or pick the face with Buy Dice), open the card sets that chests and marauders
// leave, fight the floor's boss at 50-150% power for EXP, points and stars, sail on to the next
// floor or collect, buy a roll when out of them, and exchange points for items. Attempts reset at
// 00:00 UTC. Each action locks the character row, then the ninja's row.
import { createRandom, simulateFight } from '@pockie/game-core'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  floorUnlocked,
  SHICHIBUKAI_RULES as RULES,
  shichibukaiBossSchema,
  shichibukaiBuyRollSchema,
  shichibukaiCardSchema,
  shichibukaiExchangeSchema,
  shichibukaiRollSchema,
  shichibukaiStartSchema,
  starKey,
  type ShichibukaiActionResult,
  type ShichibukaiBossResult,
  type ShichibukaiRollResult,
  type ShichibukaiRunView,
  type ShichibukaiView,
  type TileEvent,
} from '../../../../shared/src/schemas/shichibukai.js'
import type { Db } from '../../db/client.js'
import { characters, shichibukaiPlayers } from '../../db/schema.js'
import { itemInfo } from '../../game/bag.js'
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
  grantItems,
  newSeed,
  requireBagRoom,
  saveCharacter,
  utcDay,
  withCharacter,
  withExp,
  type CharacterRow,
} from '../gates/common.js'
import { usedToday } from '../impel-down/rules.js'
import { boardOf, edgesOf, walk } from './board.js'
import { SHICHIBUKAI_PLACEHOLDERS as P } from './config.js'
import {
  bossOf,
  bossRewards,
  enterFloor,
  floorBossFighter,
  land,
  peekCost,
  runSchema,
  type Run,
} from './rules.js'

type PlayerRow = typeof shichibukaiPlayers.$inferSelect

/** Cards are bound, like the other event rewards. */
const BOUND = true
const FULL = 100

async function playerRow(tx: Tx | Db, characterId: string) {
  const [row] = await tx
    .select()
    .from(shichibukaiPlayers)
    .where(eq(shichibukaiPlayers.characterId, characterId))
  return row
}

/** The ninja's row, created on first use and locked (after the character row). */
async function lockPlayer(tx: Tx, characterId: string) {
  await tx.insert(shichibukaiPlayers).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(shichibukaiPlayers)
    .where(eq(shichibukaiPlayers.characterId, characterId))
    .for('update')
  return row!
}

async function savePlayer(tx: Tx, characterId: string, values: Partial<PlayerRow>) {
  const [row] = await tx
    .update(shichibukaiPlayers)
    .set(values)
    .where(eq(shichibukaiPlayers.characterId, characterId))
    .returning()
  return row!
}

const runOf = (row: PlayerRow | undefined): Run | null =>
  row?.run ? runSchema.parse(row.run) : null

function runView(run: Run): ShichibukaiRunView {
  const board = boardOf(run.floor)
  const boss = bossOf(run.floor)
  const card = run.card
  return {
    floor: run.floor,
    difficulty: run.difficulty,
    pos: run.pos,
    visited: run.visited,
    rollsLeft: run.rollsLeft,
    throws: run.throws,
    atBoss: run.atBoss,
    cleared: run.cleared,
    bossesKilled: run.bossesKilled,
    runPoints: run.runPoints,
    hpPct: run.hpPct,
    mpPct: run.mpPct,
    card: card && {
      reason: card.reason,
      peeked: Object.fromEntries(card.peeked.map((i) => [i, card.items[i]!])),
      flipped: card.flipped,
      items: card.flipped === null ? null : card.items,
      peekCost: card.flipped === null ? peekCost(card.peeked.length) : null,
    },
    board: {
      cells: board.tags.map((tag, index) => ({
        index,
        tag,
        event: run.events[index] as TileEvent,
      })),
      edges: edgesOf(board),
      bossIndex: board.bossIndex,
    },
    boss: { name: boss.name, pose: boss.pose },
  }
}

const attemptsUsed = (row: PlayerRow | undefined, now: Date) =>
  usedToday(row?.attemptDay ?? null, row?.attemptsUsed ?? 0, now)

function view(row: PlayerRow | undefined, now: Date): ShichibukaiView {
  const run = runOf(row)
  return {
    attempts: P.attemptsPerDay - attemptsUsed(row, now),
    maxAttempts: P.attemptsPerDay,
    points: row?.points ?? 0,
    stars: row?.stars ?? {},
    run: run && runView(run),
    exchange: P.exchange.map((entry, id) => ({
      id,
      itemId: entry.itemId,
      info: itemInfo(entry.itemId),
      points: entry.points,
    })),
    floorBosses: Array.from({ length: RULES.floors }, (_, i) => {
      const boss = bossOf(i + 1)
      return { name: boss.name, pose: boss.pose }
    }),
    resetAt: nextDay(now),
  }
}

function requireLevel(character: CharacterRow) {
  if (character.level < RULES.minLevel)
    throw new HttpError(403, 'level_too_low', `Shichibukai needs level ${RULES.minLevel}.`)
}

/** The locked row and its run, which must exist. */
async function lockRun(tx: Tx, character: CharacterRow) {
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  const run = runOf(me)
  if (!run) throw bad('no_run', 'Start an expedition first.')
  return { me, run }
}

const result = async (
  tx: Tx,
  row: PlayerRow,
  characterId: string,
): Promise<ShichibukaiActionResult> => ({
  shichibukai: view(row, new Date()),
  character: await characterView(tx, characterId),
})

/** Takes `amount` of a currency column after checking the locked row has it. */
async function pay(
  tx: Tx,
  character: CharacterRow,
  column: 'gold' | 'giftCoupon' | 'stone',
  amount: number,
  label: string,
) {
  if (character[column] < amount)
    throw bad('not_enough', `You need ${amount.toLocaleString('en-US')} ${label}.`)
  await tx
    .update(characters)
    .set({ [column]: sql`${characters[column]} - ${amount}` })
    .where(eq(characters.id, character.id))
}

async function start(tx: Tx, character: CharacterRow, request: FastifyRequest) {
  const { floor, difficulty } = shichibukaiStartSchema.parse(request.body)
  const now = new Date()
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  if (me.run) throw bad('run_active', 'Finish or give up your current expedition first.')
  if (!floorUnlocked(me.stars, floor, difficulty))
    throw bad('locked', 'Earn a star on the previous floor and difficulty first.')
  const used = attemptsUsed(me, now)
  if (used >= P.attemptsPerDay) throw bad('no_attempts', 'You have no expeditions left today.')
  const after = await savePlayer(tx, character.id, {
    attemptDay: utcDay(now),
    attemptsUsed: used + 1,
    run: enterFloor(floor, difficulty, createRandom(newSeed())),
  })
  return result(tx, after, character.id)
}

async function roll(
  tx: Tx,
  character: CharacterRow,
  request: FastifyRequest,
): Promise<ShichibukaiRollResult> {
  const { face } = shichibukaiRollSchema.parse(request.body ?? {})
  const { me, run } = await lockRun(tx, character)
  if (run.atBoss || run.cleared) throw bad('at_boss', 'Face the boss first.')
  if (run.card) throw bad('card', 'Open the cards first.')
  if (run.rollsLeft < 1) throw bad('no_rolls', 'You are out of rolls.')
  // Buy Dice (Reborn's Moon Eye): the chosen face for Gold.
  if (face !== undefined) await pay(tx, character, 'gold', RULES.moonEyeGold, 'Gold')
  const random = createRandom(newSeed())
  const dice = face ?? 1 + random.int(6)
  const path = walk(boardOf(run.floor), run.pos, dice, random)
  const moved: Run = { ...run, rollsLeft: run.rollsLeft - 1, throws: run.throws + 1 }
  const landed = land(moved, path[path.length - 1]!, random)
  const earned = landed.run.runPoints - run.runPoints
  const after = await savePlayer(tx, character.id, { run: landed.run, points: me.points + earned })
  return { dice, path, steps: landed.steps, ...(await result(tx, after, character.id)) }
}

/** The run's card set, which must be waiting for its pick. */
function openCard(run: Run) {
  if (!run.card) throw bad('no_card', 'There are no cards to open.')
  return run.card
}

async function peek(tx: Tx, character: CharacterRow, request: FastifyRequest) {
  const { index } = shichibukaiCardSchema.parse(request.body)
  const { run } = await lockRun(tx, character)
  const card = openCard(run)
  if (card.flipped !== null) throw bad('flipped', 'A card has already been picked.')
  if (card.peeked.includes(index)) throw bad('seen', 'You have already seen that card.')
  const cost = peekCost(card.peeked.length)
  if (cost === null) throw bad('no_peeks', 'No peeks are left.')
  await pay(tx, character, 'stone', cost, 'Stone')
  const after = await savePlayer(tx, character.id, {
    run: { ...run, card: { ...card, peeked: [...card.peeked, index] } },
  })
  return result(tx, after, character.id)
}

async function flip(tx: Tx, character: CharacterRow, request: FastifyRequest) {
  const { index } = shichibukaiCardSchema.parse(request.body)
  const { run } = await lockRun(tx, character)
  const card = openCard(run)
  if (card.flipped !== null) throw bad('flipped', 'A card has already been picked.')
  const after = await savePlayer(tx, character.id, {
    run: { ...run, card: { ...card, flipped: index } },
  })
  return result(tx, after, character.id)
}

async function claimCard(tx: Tx, character: CharacterRow) {
  const { run } = await lockRun(tx, character)
  const card = openCard(run)
  if (card.flipped === null) throw bad('not_flipped', 'Pick a card first.')
  const itemId = card.items[card.flipped]!
  const award = [{ itemId, bound: BOUND }]
  await requireBagRoom(tx, character.id, award, {
    message: 'Make room in your bag to claim your treasure.',
  })
  await grantItems(tx, character.id, award)
  const after = await savePlayer(tx, character.id, { run: { ...run, card: null } })
  return { ...(await result(tx, after, character.id)), item: { itemId, info: itemInfo(itemId) } }
}

async function boss(
  tx: Tx,
  character: CharacterRow,
  request: FastifyRequest,
): Promise<ShichibukaiBossResult> {
  const { power } = shichibukaiBossSchema.parse(request.body)
  requireAlive(character, 'fight')
  const { me, run } = await lockRun(tx, character)
  if (!run.atBoss || run.cleared) throw bad('no_boss', 'Reach the boss first.')
  if (run.card) throw bad('card', 'Open the cards first.')
  const player = await playerFighter(tx, character)
  const gear = equipmentBonuses(await equippedGear(tx, character.id), character)
  // The ninja fights with the run's HP and MP, not the character's.
  const hp = Math.max(1, Math.round((player.maxHp * run.hpPct) / FULL))
  const mp = Math.round((player.maxMp * run.mpPct) / FULL)
  const replay = simulateFight({
    attackers: [{ ...player, hp, mp }],
    defenders: [floorBossFighter(run, power, character.level, gear)],
    seed: newSeed(),
  })
  const victory = replay.winner === 'attackers'
  const look = { clothing: bossOf(run.floor).clothing }
  if (!victory) {
    // Defeat ends the expedition.
    const after = await savePlayer(tx, character.id, { run: null })
    return { replay, victory, look, rewards: null, ...(await result(tx, after, character.id)) }
  }
  const rewards = bossRewards(run, power, character.level)
  await saveCharacter(tx, character.id, withExp(character, {}, rewards.exp).update)
  const left = replay.fighters[0]!
  const key = starKey(run.difficulty, run.floor)
  const after = await savePlayer(tx, character.id, {
    points: me.points + rewards.points,
    stars: { ...me.stars, [key]: Math.max(me.stars[key] ?? 0, rewards.stars) },
    run: {
      ...run,
      cleared: true,
      bossesKilled: run.bossesKilled + 1,
      runPoints: run.runPoints + rewards.points,
      hpPct: Math.max(1, Math.round((left.hp / player.maxHp) * FULL)),
      mpPct: Math.round((left.mp / Math.max(1, player.maxMp)) * FULL),
    },
  })
  return { replay, victory, look, rewards, ...(await result(tx, after, character.id)) }
}

async function nextFloor(tx: Tx, character: CharacterRow) {
  const { run } = await lockRun(tx, character)
  if (!run.cleared) throw bad('not_cleared', 'Defeat the boss first.')
  if (run.floor >= RULES.floors) throw bad('last_floor', 'This is the last floor.')
  const next = enterFloor(run.floor + 1, run.difficulty, createRandom(newSeed()), run)
  const after = await savePlayer(tx, character.id, { run: next })
  return result(tx, after, character.id)
}

const ROLL_COST = {
  gold: { column: 'gold', label: 'Gold' },
  gc: { column: 'giftCoupon', label: 'Gift Certificates' },
  stones: { column: 'stone', label: 'Stone' },
} as const

async function buyRoll(tx: Tx, character: CharacterRow, request: FastifyRequest) {
  const { currency } = shichibukaiBuyRollSchema.parse(request.body)
  const { run } = await lockRun(tx, character)
  if (run.rollsLeft > 0) throw bad('has_rolls', 'You still have rolls.')
  if (run.atBoss || run.cleared) throw bad('at_boss', 'Face the boss first.')
  const { column, label } = ROLL_COST[currency]
  await pay(tx, character, column, RULES.rollPrices[currency], label)
  const after = await savePlayer(tx, character.id, { run: { ...run, rollsLeft: 1 } })
  return result(tx, after, character.id)
}

/** Give Up, Exit or Collect: the expedition ends (rewards were paid as they came). */
async function quit(tx: Tx, character: CharacterRow) {
  const { run } = await lockRun(tx, character)
  if (run.card) throw bad('card', 'Open the cards first.')
  const after = await savePlayer(tx, character.id, { run: null })
  return result(tx, after, character.id)
}

async function exchange(tx: Tx, character: CharacterRow, request: FastifyRequest) {
  const { id } = shichibukaiExchangeSchema.parse(request.body)
  const entry = P.exchange[id]
  if (!entry) throw bad('unknown', 'That item is not in the exchange.')
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  if (me.points < entry.points)
    throw bad('not_enough', `You need ${entry.points.toLocaleString('en-US')} points.`)
  const award = [{ itemId: entry.itemId, bound: BOUND }]
  await requireBagRoom(tx, character.id, award)
  await grantItems(tx, character.id, award)
  const after = await savePlayer(tx, character.id, { points: me.points - entry.points })
  return {
    ...(await result(tx, after, character.id)),
    item: { itemId: entry.itemId, info: itemInfo(entry.itemId) },
  }
}

type Action = (tx: Tx, character: CharacterRow, request: FastifyRequest) => Promise<unknown>

export async function shichibukaiRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const post = (path: string, action: Action, rateLimit = RATE_LIMITS.gates) =>
    app.post(path, { config: { rateLimit } }, async (request) =>
      withCharacter(db, request, (tx, character) => action(tx, character, request)),
    )
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    requireLevel(character)
    return view(await playerRow(db, character.id), new Date())
  })
  post('/start', start)
  post('/roll', roll, RATE_LIMITS.bagMove)
  post('/card/peek', peek)
  post('/card/flip', flip)
  post('/card/claim', claimCard)
  post('/boss', boss, RATE_LIMITS.gateFight)
  post('/next-floor', nextFloor)
  post('/buy-roll', buyRoll)
  post('/quit', quit)
  post('/exchange', exchange)
}

export default shichibukaiRoutes
