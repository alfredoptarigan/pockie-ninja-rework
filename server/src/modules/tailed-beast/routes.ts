// Tailed Beast (M5 decision 27): a weekly world boss with a shared HP pool per beast and mode.
// Rows are keyed by `week` (UTC Monday), so a new week starts fresh without a reset; the weekly
// job only names last week's Kages and drops old rows. Every action locks the character row
// first, then the ninja's week row, then the pool row (plan ground rules).
import { simulateFight } from '@pockie/game-core'
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import {
  beastLevel,
  claimableBox,
  closestByLevel,
  honorFor,
  spendTickets,
  ticketCost,
  TICKETS_PER_DAY,
  todaysBeasts,
  weekday,
} from '../../../../game-core/src/events/tailed-beast.js'
import {
  tailedBeastBoxSchema,
  tailedBeastFightSchema,
  tailedBeastKageSchema,
  tailedBeastShopSchema,
  type TailedBeastFightResult,
  type TailedBeastResult,
  type TailedBeastView,
} from '../../../../shared/src/schemas/tailed-beast.js'
import type { Db } from '../../db/client.js'
import {
  characters,
  tailedBeastKages,
  tailedBeastPlayers,
  tailedBeastPools,
} from '../../db/schema.js'
import { monsterFighter, playerFighter } from '../../game/combat.js'
import { npc, rebornEvents } from '../../game/data.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  requireBagRoom,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { singleGateData } from '../gates/data.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'

type PlayerRow = typeof tailedBeastPlayers.$inferSelect

const DAY_MS = 24 * 3600 * 1000
const VILLAGES = [0, 1, 2, 3, 4]
const LEADERBOARD_SIZE = 10
/** Rewards are bound, like the Honor shop: event currency never becomes tradable goods. */
const BOUND = true
/** How often jobs.ts should run `tailedBeastWeeklyReset` (idempotent, so late runs are fine). */
export const TAILED_BEAST_RESET_INTERVAL_MS = 3600 * 1000

const config = () => rebornEvents().tailedBeast
const previousWeek = (now: Date) => weekStart(new Date(now.getTime() - 7 * DAY_MS))
/** Today's two beasts (UTC). */
export const todayBeasts = (now = new Date()) => todaysBeasts(weekday(now))

/** Las Noches bosses (every 10th floor) with their levels; a beast fights as the closest one. */
const bosses = () =>
  Object.entries(singleGateData().floors)
    .filter(([index]) => Number(index) % 10 === 9)
    .map(([, floor]) => ({ npc: floor.npc, level: Number(npc(floor.npc)?.Level ?? 0) }))

export function beastFighter(beast: number, mode: number, hpLeft: number) {
  const level = beastLevel(beast, mode)
  const boss = closestByLevel(bosses(), level)
  return {
    npcId: boss.npc,
    fighter: {
      ...monsterFighter(boss.npc),
      name: `reborn_beast_${beast}`,
      level,
      hp: hpLeft,
      maxHp: config().hp[mode]!,
    },
  }
}

const ticketsUsed = (row: PlayerRow | undefined, now = new Date()) =>
  row?.ticketDay === utcDay(now) ? row.ticketsUsed : 0

async function playerRow(tx: Tx | Db, week: string, characterId: string) {
  const [row] = await tx
    .select()
    .from(tailedBeastPlayers)
    .where(and(eq(tailedBeastPlayers.week, week), eq(tailedBeastPlayers.characterId, characterId)))
  return row
}

/** The ninja's row for this week, created on first use and locked (after the character row). */
async function lockPlayer(tx: Tx, character: CharacterRow, week: string) {
  await tx
    .insert(tailedBeastPlayers)
    .values({ week, characterId: character.id, village: character.nation })
    .onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(tailedBeastPlayers)
    .where(and(eq(tailedBeastPlayers.week, week), eq(tailedBeastPlayers.characterId, character.id)))
    .for('update')
  return row!
}

/** Names the top-Honor ninja of each village for `week` (ties: lower id); idempotent. */
async function nameKages(tx: Tx | Db, week: string) {
  await tx.execute(sql`
    insert into ${tailedBeastKages} (week, village, character_id)
    select distinct on (village) week, village, character_id
    from ${tailedBeastPlayers}
    where week = ${week} and honor > 0
    order by village, honor desc, character_id
    on conflict do nothing`)
}

/**
 * The weekly job (coordinator registers it in jobs.ts): names last week's Kages and drops rows
 * older than last week. Safe to run any number of times.
 */
export async function tailedBeastWeeklyReset(db: Db, now = new Date()) {
  const last = previousWeek(now)
  await db.transaction(async (tx) => {
    await nameKages(tx, last)
    await tx.delete(tailedBeastPools).where(lt(tailedBeastPools.week, last))
    await tx.delete(tailedBeastPlayers).where(lt(tailedBeastPlayers.week, last))
  })
}

async function view(tx: Tx | Db, character: CharacterRow, now = new Date()) {
  const data = config()
  const week = weekStart(now)
  const last = previousWeek(now)
  await nameKages(tx, last)
  const me = await playerRow(tx, week, character.id)
  const pools = await tx.select().from(tailedBeastPools).where(eq(tailedBeastPools.week, week))
  const killers = await tx
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .innerJoin(tailedBeastPools, eq(tailedBeastPools.killedBy, characters.id))
    .where(eq(tailedBeastPools.week, week))
  const top = await tx
    .select({
      name: characters.name,
      level: characters.level,
      village: tailedBeastPlayers.village,
      honor: tailedBeastPlayers.honor,
    })
    .from(tailedBeastPlayers)
    .innerJoin(characters, eq(characters.id, tailedBeastPlayers.characterId))
    .where(and(eq(tailedBeastPlayers.week, week), gt(tailedBeastPlayers.honor, 0)))
    .orderBy(desc(tailedBeastPlayers.honor), asc(tailedBeastPlayers.characterId))
    .limit(LEADERBOARD_SIZE)
  const villageHonor = await tx
    .select({
      village: tailedBeastPlayers.village,
      honor: sql<string>`sum(${tailedBeastPlayers.honor})`,
    })
    .from(tailedBeastPlayers)
    .where(eq(tailedBeastPlayers.week, week))
    .groupBy(tailedBeastPlayers.village)
  const kages = await tx
    .select({
      village: tailedBeastKages.village,
      characterId: tailedBeastKages.characterId,
      name: characters.name,
      claimedItemId: tailedBeastKages.claimedItemId,
    })
    .from(tailedBeastKages)
    .innerJoin(characters, eq(characters.id, tailedBeastKages.characterId))
    .where(eq(tailedBeastKages.week, last))
    .orderBy(asc(tailedBeastKages.village))
  const fights = me?.fights ?? 0
  const claimed = me?.boxesClaimed ?? []
  const result: TailedBeastView = {
    week,
    day: weekday(now),
    resetAt: new Date(Date.parse(`${week}T00:00:00Z`) + 7 * DAY_MS).toISOString(),
    beasts: todayBeasts(now).map((id) => ({
      id,
      nameKey: data.beasts.find((b) => b.id === id)!.nameKey,
      pools: [0, 1, 2].map((mode) => {
        const row = pools.find((p) => p.beast === id && p.mode === mode)
        return {
          mode,
          level: beastLevel(id, mode),
          ticketCost: ticketCost(mode),
          hpLeft: row?.hpLeft ?? data.hp[mode]!,
          maxHp: data.hp[mode]!,
          killedBy: killers.find((k) => k.id === row?.killedBy)?.name ?? null,
        }
      }),
    })),
    tickets: { used: ticketsUsed(me, now), perDay: TICKETS_PER_DAY },
    me: {
      village: me?.village ?? character.nation,
      honor: me?.honor ?? 0,
      essence: me?.essence ?? 0,
      fights,
    },
    boxes: data.boxes
      .map((box) => ({
        fights: box.fights,
        itemId: box.item,
        claimed: claimed.includes(box.fights),
        ready: claimableBox(fights, claimed, box.fights),
      }))
      .sort((a, b) => a.fights - b.fights),
    villages: VILLAGES.map((village) => ({
      village,
      honor: Number(villageHonor.find((v) => v.village === village)?.honor ?? 0),
    })),
    leaderboard: top.map((row, i) => ({ place: i + 1, ...row })),
    kages: kages.map(({ characterId, ...kage }) => ({
      ...kage,
      isMe: characterId === character.id,
    })),
    kageChoices: data.kageChoices,
    // ponytail: limited offers (Level 10 Stone Bag, 5 a week) need a per-item purchase count on
    // tailed_beast_players; they stay unavailable until that column exists.
    shop: data.shop.map((offer) => ({
      itemId: offer.item,
      essence: offer.essence,
      available: offer.limit === undefined,
    })),
  }
  return result
}

async function result(tx: Tx, characterId: string): Promise<TailedBeastResult> {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId))
  return { tailedBeast: await view(tx, row!), character: await characterView(tx, characterId) }
}

async function fight(tx: Tx, character: CharacterRow, beast: number, mode: number) {
  const now = new Date()
  const week = weekStart(now)
  if (!todayBeasts(now).includes(beast))
    throw bad('not_today', 'That tailed beast is not out today.')
  requireAlive(character, 'fight')
  const me = await lockPlayer(tx, character, week)
  const used = spendTickets(ticketsUsed(me, now), mode)

  // The pool row is locked for the whole fight, so the beast starts at its true HP and only one
  // fight can deal the last hit.
  await tx
    .insert(tailedBeastPools)
    .values({ week, beast, mode, hpLeft: config().hp[mode]! })
    .onConflictDoNothing()
  const [pool] = await tx
    .select()
    .from(tailedBeastPools)
    .where(
      and(
        eq(tailedBeastPools.week, week),
        eq(tailedBeastPools.beast, beast),
        eq(tailedBeastPools.mode, mode),
      ),
    )
    .for('update')
  if (!pool || pool.hpLeft <= 0) throw bad('beast_dead', 'This tailed beast was already defeated.')

  // Beast fights do not cost HP or MP: the ninja enters at full strength and is not hurt.
  const player = await playerFighter(tx, character)
  const beastSide = beastFighter(beast, mode, pool.hpLeft)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [beastSide.fighter],
    seed: randomInt(2 ** 31),
  })
  const beastEnd = replay.fighters.find((f) => f.side === 'defenders')!
  const damage = Math.max(0, pool.hpLeft - Math.max(0, beastEnd.hp))

  const [after] = await tx
    .update(tailedBeastPools)
    .set({
      hpLeft: sql`greatest(${tailedBeastPools.hpLeft} - ${damage}, 0)`,
      killedBy: sql`case when ${tailedBeastPools.hpLeft} <= ${damage} then ${character.id}::uuid else ${tailedBeastPools.killedBy} end`,
      killedAt: sql`case when ${tailedBeastPools.hpLeft} <= ${damage} then now() else ${tailedBeastPools.killedAt} end`,
    })
    .where(
      and(
        eq(tailedBeastPools.week, week),
        eq(tailedBeastPools.beast, beast),
        eq(tailedBeastPools.mode, mode),
        gt(tailedBeastPools.hpLeft, 0),
      ),
    )
    .returning({ hpLeft: tailedBeastPools.hpLeft })
  if (!after) throw bad('beast_dead', 'This tailed beast was already defeated.')

  const honor = honorFor(damage)
  await tx
    .update(tailedBeastPlayers)
    .set({
      honor: me.honor + honor,
      essence: me.essence + honor,
      fights: me.fights + 1,
      ticketDay: utcDay(now),
      ticketsUsed: used,
    })
    .where(and(eq(tailedBeastPlayers.week, week), eq(tailedBeastPlayers.characterId, character.id)))
  const response: TailedBeastFightResult = {
    replay,
    npcIds: [beastSide.npcId],
    damage,
    honor,
    killed: after.hpLeft === 0,
    ...(await result(tx, character.id)),
  }
  return response
}

async function claimBox(tx: Tx, character: CharacterRow, fights: number) {
  const week = weekStart(new Date())
  const me = await lockPlayer(tx, character, week)
  if (me.boxesClaimed.includes(fights))
    throw bad('box_claimed', 'You have already opened this box this week.')
  if (!claimableBox(me.fights, me.boxesClaimed, fights))
    throw bad('box_locked', `Fight ${fights} times this week to open this box.`)
  const award = { itemId: config().boxes.find((box) => box.fights === fights)!.item, bound: BOUND }
  await requireBagRoom(tx, character.id, [award])
  await grantItems(tx, character.id, [award])
  await tx
    .update(tailedBeastPlayers)
    .set({ boxesClaimed: [...me.boxesClaimed, fights] })
    .where(and(eq(tailedBeastPlayers.week, week), eq(tailedBeastPlayers.characterId, character.id)))
  return result(tx, character.id)
}

async function claimKage(tx: Tx, character: CharacterRow, itemId: string) {
  if (!config().kageChoices.includes(itemId))
    throw bad('unknown_item', 'That item is not a Kage reward.')
  const last = previousWeek(new Date())
  await nameKages(tx, last)
  const [kage] = await tx
    .select()
    .from(tailedBeastKages)
    .where(and(eq(tailedBeastKages.week, last), eq(tailedBeastKages.characterId, character.id)))
    .for('update')
  if (!kage) throw bad('not_kage', 'Only last week\u2019s Kage of a village can pick a reward.')
  if (kage.claimedItemId) throw bad('kage_claimed', 'You have already picked your Kage reward.')
  const award = { itemId, bound: BOUND }
  await requireBagRoom(tx, character.id, [award])
  await grantItems(tx, character.id, [award])
  await tx
    .update(tailedBeastKages)
    .set({ claimedItemId: itemId, claimedAt: new Date() })
    .where(and(eq(tailedBeastKages.week, last), eq(tailedBeastKages.village, kage.village)))
  return result(tx, character.id)
}

async function buy(tx: Tx, character: CharacterRow, itemId: string, count: number) {
  const offer = config().shop.find((o) => o.item === itemId)
  if (!offer) throw bad('unknown_item', 'That item is not sold here.')
  if (offer.limit !== undefined) throw bad('unavailable', 'This item is not available yet.')
  const week = weekStart(new Date())
  const me = await lockPlayer(tx, character, week)
  const price = offer.essence * count
  if (me.essence < price) throw bad('no_essence', 'You do not have enough Essence.')
  const awards = Array.from({ length: count }, () => ({ itemId, bound: BOUND }))
  await requireBagRoom(tx, character.id, awards)
  await grantItems(tx, character.id, awards)
  await tx
    .update(tailedBeastPlayers)
    .set({ essence: me.essence - price })
    .where(and(eq(tailedBeastPlayers.week, week), eq(tailedBeastPlayers.characterId, character.id)))
  return result(tx, character.id)
}

export async function tailedBeastRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    view(db, await characterOf(db, requireUser(request).id)),
  )
  app.post('/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { beast, mode } = tailedBeastFightSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => fight(tx, character, beast, mode))
  })
  app.post('/box', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { fights } = tailedBeastBoxSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => claimBox(tx, character, fights))
  })
  app.post('/kage', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { itemId } = tailedBeastKageSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => claimKage(tx, character, itemId))
  })
  app.post('/shop', { config: { rateLimit: RATE_LIMITS.shopBuy } }, async (request) => {
    const { itemId, count } = tailedBeastShopSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => buy(tx, character, itemId, count))
  })
}

export default tailedBeastRoutes
