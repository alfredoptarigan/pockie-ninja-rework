// Hashirama vs Madara (Reborn scene 9500) under /api/game/hashirama: access (the HUD icon), the
// battle state, choosing a side, attacking the other side's leader, the Fortune Wheel and the
// admin start / end. The battle is counted (winner and spins) by the first request after it ends,
// in its own transaction that locks the event row. Player actions lock the character row, then
// the ninja's row in the event.
import { createRandom, simulateFight } from '@pockie/game-core'
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  fortuneConfigureSchema,
  fortuneSpinSchema,
  HASHIRAMA_RULES,
  hashiramaJoinSchema,
  hashiramaStartSchema,
  type FortuneResult,
  type FortuneSpinResult,
  type FortuneWheelView,
  type HashiramaAccess,
  type HashiramaAttackResult,
  type HashiramaSide,
  type HashiramaView,
} from '../../../../shared/src/schemas/hashirama.js'
import type { Db } from '../../db/client.js'
import { characterBankai, characters, hashiramaEvents, hashiramaPlayers } from '../../db/schema.js'
import { bagFits } from '../../game/bag.js'
import { playerFighter } from '../../game/combat.js'
import { equipmentBonuses, equippedGear } from '../../game/equipment.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  grantItems,
  newSeed,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { HASHIRAMA_PLACEHOLDERS as P, type WheelReward } from './config.js'
import {
  eventView,
  leaderFighter,
  leaderOf,
  mysteryRewards,
  opponentOf,
  payouts,
  phase,
  possibleRewards,
  segments,
  selectionError,
  spin,
  toFortuneReward,
  winnerOf,
} from './rules.js'

type EventRow = typeof hashiramaEvents.$inferSelect
type PlayerRow = typeof hashiramaPlayers.$inferSelect

const HOUR_MS = 3_600_000
/** Wheel rewards are not bound (Reborn: "Rewards are not bound, so you can trade them"). */
const UNBOUND = false

/** The latest event that is not closed yet. */
async function currentEvent(tx: Tx | Db, now: Date) {
  const [row] = await tx
    .select()
    .from(hashiramaEvents)
    .where(gt(hashiramaEvents.closesAt, now))
    .orderBy(desc(hashiramaEvents.startedAt))
    .limit(1)
  return row
}

/**
 * Counts an ended battle once: totals, winner, and each ninja's spins (added to their wheel).
 * Its own transaction, locking the event row, before any player lock is taken.
 */
async function settle(db: Db, event: EventRow) {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(hashiramaEvents)
      .where(eq(hashiramaEvents.id, event.id))
      .for('update')
    if (!locked || locked.settled) return locked ?? event
    const fighters = await tx
      .select({
        characterId: hashiramaPlayers.characterId,
        side: hashiramaPlayers.side,
        damage: hashiramaPlayers.damage,
      })
      .from(hashiramaPlayers)
      .where(and(eq(hashiramaPlayers.eventId, event.id), isNotNull(hashiramaPlayers.side)))
    const sided = fighters.map((f) => ({ ...f, side: f.side! }))
    const totals = { madara: 0, hashirama: 0 }
    for (const f of sided) totals[f.side] += f.damage
    const winner = winnerOf(totals)
    for (const [characterId, spins] of payouts(sided, winner))
      await tx
        .update(hashiramaPlayers)
        .set({ payout: spins, spins: sql`${hashiramaPlayers.spins} + ${spins}` })
        .where(
          and(
            eq(hashiramaPlayers.eventId, event.id),
            eq(hashiramaPlayers.characterId, characterId),
          ),
        )
    const [after] = await tx
      .update(hashiramaEvents)
      .set({ settled: true, winner })
      .where(eq(hashiramaEvents.id, event.id))
      .returning()
    return after!
  })
}

/** The open event, counted first when its battle is over. */
async function openEvent(db: Db, now = new Date()) {
  const event = await currentEvent(db, now)
  if (event && phase(event, now) === 'counting') return settle(db, event)
  return event
}

async function playerRow(tx: Tx | Db, eventId: string, characterId: string) {
  const [row] = await tx
    .select()
    .from(hashiramaPlayers)
    .where(
      and(eq(hashiramaPlayers.eventId, eventId), eq(hashiramaPlayers.characterId, characterId)),
    )
  return row
}

/** The ninja's row in the event, created on first use and locked (after the character row). */
async function lockPlayer(tx: Tx, eventId: string, characterId: string) {
  await tx.insert(hashiramaPlayers).values({ eventId, characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(hashiramaPlayers)
    .where(
      and(eq(hashiramaPlayers.eventId, eventId), eq(hashiramaPlayers.characterId, characterId)),
    )
    .for('update')
  return row!
}

async function savePlayer(tx: Tx, row: PlayerRow, values: Partial<PlayerRow>) {
  const [after] = await tx
    .update(hashiramaPlayers)
    .set(values)
    .where(
      and(
        eq(hashiramaPlayers.eventId, row.eventId),
        eq(hashiramaPlayers.characterId, row.characterId),
      ),
    )
    .returning()
  return after!
}

const retryIn = (row: PlayerRow | undefined, now: Date) =>
  row?.lastAttackAt
    ? Math.max(0, row.lastAttackAt.getTime() + P.attackCooldownSeconds * 1000 - now.getTime())
    : 0

async function boards(tx: Tx | Db, eventId: string) {
  const rows = await tx
    .select({
      characterId: hashiramaPlayers.characterId,
      side: hashiramaPlayers.side,
      damage: hashiramaPlayers.damage,
      name: characters.name,
    })
    .from(hashiramaPlayers)
    .innerJoin(characters, eq(characters.id, hashiramaPlayers.characterId))
    .where(and(eq(hashiramaPlayers.eventId, eventId), gt(hashiramaPlayers.damage, 0)))
    .orderBy(desc(hashiramaPlayers.damage))
  const bySide = (side: HashiramaSide) => rows.filter((row) => row.side === side)
  return {
    totals: {
      madara: bySide('madara').reduce((sum, row) => sum + row.damage, 0),
      hashirama: bySide('hashirama').reduce((sum, row) => sum + row.damage, 0),
    },
    ranked: { madara: bySide('madara'), hashirama: bySide('hashirama') },
  }
}

async function stateView(
  tx: Tx | Db,
  event: EventRow | undefined,
  character: Pick<CharacterRow, 'id' | 'level'>,
  now: Date,
): Promise<HashiramaView> {
  const base = {
    eligible: character.level >= P.minLevel,
    rewards: P.rewards,
    totals: { madara: 0, hashirama: 0 },
    leaderboards: { madara: [], hashirama: [] },
    me: null,
    myPayout: null,
    freeSpins: 0,
    retryInMs: 0,
  }
  if (!event) return { ...base, event: null }
  const row = await playerRow(tx, event.id, character.id)
  const { totals, ranked } = await boards(tx, event.id)
  const side = row?.side ?? null
  const rank = side ? ranked[side].findIndex((r) => r.characterId === character.id) : -1
  return {
    ...base,
    event: eventView(event, now),
    totals,
    leaderboards: {
      madara: ranked.madara
        .slice(0, P.leaderboardSize)
        .map(({ name, damage }) => ({ name, damage })),
      hashirama: ranked.hashirama
        .slice(0, P.leaderboardSize)
        .map(({ name, damage }) => ({ name, damage })),
    },
    me: side ? { side, damage: row!.damage, rank: rank >= 0 ? rank + 1 : null } : null,
    myPayout: event.settled && row && row.payout > 0 ? { spins: row.payout } : null,
    freeSpins: row?.spins ?? 0,
    retryInMs: retryIn(row, now),
  }
}

function requireRunning(event: EventRow | undefined, now: Date): EventRow {
  if (!event || phase(event, now) !== 'running')
    throw bad('not_running', 'No battle is running in the Valley of the End.')
  return event
}

function requireLevel(character: CharacterRow) {
  if (character.level < P.minLevel)
    throw bad('too_low', `You must be level ${P.minLevel} or higher to join the battle.`)
}

async function join(
  tx: Tx,
  event: EventRow | undefined,
  character: CharacterRow,
  side: HashiramaSide,
) {
  const now = new Date()
  const open = requireRunning(event, now)
  requireLevel(character)
  const row = await lockPlayer(tx, open.id, character.id)
  if (row.side && row.side !== side)
    throw bad('side_final', 'You fight for this side until the battle ends; you cannot switch.')
  if (!row.side) await savePlayer(tx, row, { side })
  return { hashirama: await stateView(tx, open, character, now) }
}

async function attack(
  tx: Tx,
  event: EventRow | undefined,
  character: CharacterRow,
): Promise<HashiramaAttackResult> {
  const now = new Date()
  const open = requireRunning(event, now)
  requireLevel(character)
  requireAlive(character, 'attack')
  const row = await lockPlayer(tx, open.id, character.id)
  if (!row.side) throw bad('no_side', 'Choose your side for this battle')
  const wait = retryIn(row, now)
  if (wait > 0)
    throw new HttpError(
      400,
      'cooldown',
      `Catch your breath: attack again in ${Math.ceil(wait / 1000)}s.`,
      { retryInMs: String(wait) },
    )
  const target = opponentOf(row.side)
  const player = await playerFighter(tx, character)
  const gear = equipmentBonuses(await equippedGear(tx, character.id), character)
  const leader = leaderFighter(target, character.level, gear)
  // Like a dungeon boss fight, an attack costs no HP or MP: the ninja enters at full strength.
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [leader],
    seed: newSeed(),
  })
  const left = replay.fighters.find((f) => f.side === 'defenders')!.hp
  const damage = Math.max(0, leader.maxHp - Math.max(0, left))
  await savePlayer(tx, row, { damage: row.damage + damage, lastAttackAt: now })
  return {
    replay,
    damage,
    look: { clothing: leaderOf(target).clothing },
    hashirama: await stateView(tx, open, character, now),
    character: await characterView(tx, character.id),
  }
}

// Fortune Wheel --------------------------------------------------------------------------------

function wheelView(
  row: PlayerRow | undefined,
  event: EventRow | undefined,
  now: Date,
): FortuneWheelView {
  const won = (row?.won ?? {}) as Record<string, number>
  const selection = (row?.selection ?? [null, null, null]) as (string | null)[]
  const side = row?.side ?? null
  return {
    freeSpins: row?.spins ?? 0,
    bonusReady: row?.bonusReady ?? false,
    goldSpinCost: P.wheel.goldSpinCost,
    paidSpins: row?.paidSpins ?? 0,
    bonusEvery: P.wheel.bonusEvery,
    segments: segments(selection, side, won),
    pools: P.wheel.pools.map((pool) => ({
      id: pool.id,
      label: pool.label,
      unique: pool.unique,
      rewards: pool.rewards.map((reward) => toFortuneReward(reward, won)),
    })),
    mysteryPool: mysteryRewards().map((reward) => toFortuneReward(reward, won)),
    selection,
    lastResult: (row?.lastResult as FortuneResult | null) ?? null,
    nextSpinToken: row?.spinToken ?? 0,
    open: Boolean(event && phase(event, now) !== 'closed'),
  }
}

function requireWheel(event: EventRow | undefined): EventRow {
  if (!event) throw bad('closed', 'Hashirama vs Madara is not open right now.')
  return event
}

async function configure(
  tx: Tx,
  event: EventRow | undefined,
  character: CharacterRow,
  selection: (string | null)[],
) {
  const open = requireWheel(event)
  const row = await lockPlayer(tx, open.id, character.id)
  const error = selectionError(selection, row.won as Record<string, number>)
  if (error) throw bad('bad_selection', error)
  const after = await savePlayer(tx, row, { selection })
  return { wheel: wheelView(after, open, new Date()) }
}

async function deliver(tx: Tx, character: CharacterRow, reward: WheelReward) {
  if (reward.kind === 'spins') return { spins: reward.amount }
  if (reward.kind === 'bankaiCoins') {
    await tx
      .insert(characterBankai)
      .values({ characterId: character.id, coins: reward.amount })
      .onConflictDoUpdate({
        target: characterBankai.characterId,
        set: { coins: sql`${characterBankai.coins} + ${reward.amount}` },
      })
    return { spins: 0 }
  }
  await grantItems(
    tx,
    character.id,
    Array.from({ length: reward.amount }, () => ({ itemId: reward.itemId!, bound: UNBOUND })),
  )
  return { spins: 0 }
}

async function spinWheel(
  tx: Tx,
  event: EventRow | undefined,
  character: CharacterRow,
  token: number,
  payWith: 'gold' | undefined,
): Promise<FortuneSpinResult> {
  const now = new Date()
  const open = requireWheel(event)
  const row = await lockPlayer(tx, open.id, character.id)
  if (token !== row.spinToken)
    throw bad('STALE_TOKEN', 'The wheel changed. Refresh it before spinning again.')
  const selection = row.selection as (string | null)[]
  const won = row.won as Record<string, number>
  if (selection.some((id) => id === null) || selectionError(selection, won))
    throw bad('choose_three', 'Choose three different rewards before spinning.')
  const cost = P.wheel.goldSpinCost
  const bonus = payWith !== 'gold' && row.bonusReady
  if (payWith === 'gold' && character.gold < cost)
    throw bad('no_gold', 'You do not have enough gold for this spin.')
  if (payWith !== 'gold' && !bonus && row.spins <= 0)
    throw bad('no_spins', 'You have no spins left. Win more in battle and in events.')
  // Room for any item the wheel could give, so a spin never loses one.
  for (const reward of possibleRewards(selection, row.side))
    if (
      reward.kind === 'item' &&
      !(await bagFits(
        tx,
        character.id,
        Array.from({ length: reward.amount }, () => ({ itemId: reward.itemId!, bound: UNBOUND })),
      ))
    )
      throw bad('bag_full', 'You need room in your bag before spinning.')

  const slices = segments(selection, row.side, won)
  const { winningIndex, reward } = spin(slices, createRandom(newSeed()))
  const { spins: wonSpins } = await deliver(tx, character, reward)
  if (payWith === 'gold')
    await tx
      .update(characters)
      .set({ gold: character.gold - cost })
      .where(eq(characters.id, character.id))
  const paidSpins = row.paidSpins + (payWith === 'gold' ? 1 : 0)
  const earnedBonus = paidSpins >= P.wheel.bonusEvery
  const result: FortuneResult = {
    token: row.spinToken,
    winningIndex,
    reward: toFortuneReward(reward, { ...won, [reward.id]: (won[reward.id] ?? 0) + 1 }),
    bonus,
  }
  const after = await savePlayer(tx, row, {
    spins: row.spins - (payWith !== 'gold' && !bonus ? 1 : 0) + wonSpins,
    paidSpins: earnedBonus ? 0 : paidSpins,
    bonusReady: earnedBonus || (row.bonusReady && !bonus),
    won: { ...won, [reward.id]: (won[reward.id] ?? 0) + 1 },
    spinToken: row.spinToken + 1,
    lastResult: result,
  })
  return {
    result,
    wheel: wheelView(after, open, now),
    character: await characterView(tx, character.id),
  }
}

// Admin ----------------------------------------------------------------------------------------

function requireAdmin(request: FastifyRequest) {
  if (requireUser(request).role !== 'admin')
    throw new HttpError(403, 'forbidden', 'Only administrators can start or end the battle.')
}

async function startBattle(db: Db, hours: number) {
  const now = new Date()
  return db.transaction(async (tx) => {
    // One battle at a time: serialise starts on the events table.
    await tx.execute(sql`lock table ${hashiramaEvents} in share row exclusive mode`)
    if (await currentEvent(tx, now)) throw bad('already_open', 'A battle is already open.')
    const endsAt = new Date(now.getTime() + hours * HOUR_MS)
    const [event] = await tx
      .insert(hashiramaEvents)
      .values({
        endsAt,
        closesAt: new Date(endsAt.getTime() + HASHIRAMA_RULES.spendHours * HOUR_MS),
      })
      .returning()
    return eventView(event!, now)
  })
}

/** Ends the running battle now (Reborn: `/hashirama end`); spins stay spendable for 24 hours. */
async function endBattle(db: Db) {
  const now = new Date()
  const event = requireRunning(await currentEvent(db, now), now)
  const [ended] = await db
    .update(hashiramaEvents)
    .set({ endsAt: now, closesAt: new Date(now.getTime() + HASHIRAMA_RULES.spendHours * HOUR_MS) })
    .where(eq(hashiramaEvents.id, event.id))
    .returning()
  return eventView(await settle(db, ended!), new Date())
}

export async function hashiramaRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get(
    '/access',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (): Promise<HashiramaAccess> => {
      const event = await openEvent(db)
      return { open: Boolean(event), closesAt: event?.closesAt.toISOString() ?? null }
    },
  )
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return stateView(db, await openEvent(db), character, new Date())
  })
  app.post('/join', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { side } = hashiramaJoinSchema.parse(request.body)
    const event = await openEvent(db)
    return withCharacter(db, request, (tx, character) => join(tx, event, character, side))
  })
  app.post('/attack', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const event = await openEvent(db)
    return withCharacter(db, request, (tx, character) => attack(tx, event, character))
  })
  app.get('/wheel', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const event = await openEvent(db)
    return wheelView(event && (await playerRow(db, event.id, character.id)), event, new Date())
  })
  app.post('/wheel/configure', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { selection } = fortuneConfigureSchema.parse(request.body)
    const event = await openEvent(db)
    return withCharacter(db, request, (tx, character) => configure(tx, event, character, selection))
  })
  app.post('/wheel/spin', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { token, payWith } = fortuneSpinSchema.parse(request.body)
    const event = await openEvent(db)
    return withCharacter(db, request, (tx, character) =>
      spinWheel(tx, event, character, token, payWith),
    )
  })
  app.post('/admin/start', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    requireAdmin(request)
    const { hours = HASHIRAMA_RULES.battleHours } = hashiramaStartSchema.parse(request.body ?? {})
    return startBattle(db, hours)
  })
  app.post('/admin/end', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    requireAdmin(request)
    return endBattle(db)
  })
}

export default hashiramaRoutes
