// Championship (Reborn scene 6002: `loadChampionship`, `enterChampionship`,
// `watchChampionshipMatch`, `openChampionshipPot`) under /api/game/arena/championship. One
// 16-slot bracket per UTC day: during registration a ninja takes an empty slot, or challenges a
// registered one and steals the slot by winning; then one round is fought at each scheduled time,
// every ninja as they are at that moment. Each due round is settled once, in its own
// transaction locking the bracket row, by the job or by the first request after it (like
// Hashirama's settle), and pays Hero Coins for Quarterfinal, Semifinal and Final wins.
import { simulateFight } from '@pockie/game-core'
import { and, asc, desc, eq, isNotNull, lt, lte, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  BRACKET_ROUNDS,
  bracketPhase,
  bracketSchedule,
  matchesIn,
  matchWinner,
  pairings,
  roundsDue,
} from '../../../../game-core/src/arena/index.js'
import type { ArenaLook, ArenaReplay } from '../../../../shared/src/schemas/arena.js'
import {
  championshipEnterSchema,
  championshipMatchParamsSchema,
  coinShopBuySchema,
  type ChampionshipActionResult,
  type ChampionshipChallengeResult,
  type ChampionshipMatchView,
  type ChampionshipView,
} from '../../../../shared/src/schemas/arena-extras.js'
import type { Db } from '../../db/client.js'
import {
  arenaExtras,
  characters,
  championshipChallenges,
  championshipMatches,
  championships,
  championshipSlots,
} from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  newSeed,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { CHAMPIONSHIP, CHAMPIONSHIP_PLACEHOLDERS as P } from './config.js'
import { buyCoinOffer, offerViews, readExtras } from './extras.js'
import { arenaFighter, fromSnapshot, toSnapshot } from './snapshot.js'

type ChampionshipRow = typeof championships.$inferSelect
type SlotRow = typeof championshipSlots.$inferSelect
type MatchRow = typeof championshipMatches.$inferSelect

/** The job looks every minute. */
export const CHAMPIONSHIP_SETTLE_INTERVAL_MS = 60_000
const CHALLENGES_SHOWN = 10
const FINAL = BRACKET_ROUNDS
const SEMIFINAL = BRACKET_ROUNDS - 1

const scheduleOf = (row: Pick<ChampionshipRow, 'day'>) => bracketSchedule(row.day, P)

/** Today's bracket, created on first use (one per UTC day). */
async function todays(db: Db | Tx, now: Date) {
  const day = utcDay(now)
  const schedule = bracketSchedule(day, P)
  await db
    .insert(championships)
    .values({
      day,
      registrationEndsAt: schedule.registrationEndsAt,
      battlingEndsAt: schedule.battlingEndsAt,
      cooldownEndsAt: schedule.cooldownEndsAt,
    })
    .onConflictDoNothing()
  const [row] = await db.select().from(championships).where(eq(championships.day, day))
  return row!
}

/** Adds to a ninja's extras row (created when missing), without a separate lock. */
async function addExtras(
  tx: Tx,
  characterId: string,
  add: { heroCoins?: number; wins?: number; losses?: number; top3?: number },
) {
  const values = {
    heroCoins: add.heroCoins ?? 0,
    championshipWins: add.wins ?? 0,
    championshipLosses: add.losses ?? 0,
    championshipTop3: add.top3 ?? 0,
  }
  await tx
    .insert(arenaExtras)
    .values({ characterId, ...values })
    .onConflictDoUpdate({
      target: arenaExtras.characterId,
      set: {
        heroCoins: sql`${arenaExtras.heroCoins} + ${values.heroCoins}`,
        championshipWins: sql`${arenaExtras.championshipWins} + ${values.championshipWins}`,
        championshipLosses: sql`${arenaExtras.championshipLosses} + ${values.championshipLosses}`,
        championshipTop3: sql`${arenaExtras.championshipTop3} + ${values.championshipTop3}`,
      },
    })
}

const slotsOf = (tx: Db | Tx, championshipId: string) =>
  tx
    .select()
    .from(championshipSlots)
    .where(eq(championshipSlots.championshipId, championshipId))
    .orderBy(asc(championshipSlots.slot))

const matchesOf = (tx: Db | Tx, championshipId: string) =>
  tx
    .select()
    .from(championshipMatches)
    .where(eq(championshipMatches.championshipId, championshipId))
    .orderBy(asc(championshipMatches.round), asc(championshipMatches.matchIndex))

/**
 * A registered ninja as they are now (Reborn's Championship has Swap Gear / Swap Skills), read
 * without a lock; the entry's fighter if the ninja is gone.
 */
async function slotFighter(tx: Tx, slot: SlotRow) {
  const [character] = await tx.select().from(characters).where(eq(characters.id, slot.characterId))
  return character ? arenaFighter(tx, character) : fromSnapshot(slot.snapshot)
}

/** Fights one round: every pairing, byes included, and the round's Hero Coins and records. */
async function fightRound(tx: Tx, row: ChampionshipRow, round: number, slots: SlotRow[]) {
  const bySlot = new Map(slots.map((slot) => [slot.slot, slot]))
  const filled = new Set(bySlot.keys())
  const previous = (await matchesOf(tx, row.id))
    .filter((match) => match.round === round - 1)
    .map((match) => match.winnerSlot)
  const results: MatchRow[] = []
  for (const [matchIndex, pair] of pairings(round, previous).entries()) {
    const played: { replay?: ArenaReplay } = {}
    const both = pair.every((slot) => filled.has(slot))
    const one = both ? await slotFighter(tx, bySlot.get(pair[0])!) : null
    const two = both ? await slotFighter(tx, bySlot.get(pair[1])!) : null
    const winnerSlot = matchWinner(pair, filled, () => {
      const fought = simulateFight({
        attackers: [one!.fighter],
        defenders: [two!.fighter],
        seed: newSeed(),
      })
      played.replay = { replay: fought, looks: [one!.look, two!.look] as [ArenaLook, ArenaLook] }
      return fought.winner === 'attackers'
    })
    const [match] = await tx
      .insert(championshipMatches)
      .values({
        championshipId: row.id,
        round,
        matchIndex,
        slot1: pair[0],
        slot2: pair[1],
        winnerSlot,
        replay: played.replay ?? null,
      })
      .returning()
    results.push(match!)
    if (!played.replay) continue
    const winner = bySlot.get(winnerSlot)!
    const loser = bySlot.get(winnerSlot === pair[0] ? pair[1] : pair[0])!
    await addExtras(tx, winner.characterId, {
      wins: 1,
      heroCoins: CHAMPIONSHIP.heroCoins[round] ?? 0,
    })
    await addExtras(tx, loser.characterId, {
      losses: 1,
      // Top 3: the Final's loser and both Semifinal losers (the champion is counted below).
      top3: round >= SEMIFINAL ? 1 : 0,
    })
  }
  if (round !== FINAL) return
  const champion = bySlot.get(results[0]!.winnerSlot)
  if (champion) {
    await addExtras(tx, champion.characterId, { top3: 1 })
    await tx
      .update(championships)
      .set({ winnerId: champion.characterId, winnerName: champion.name })
      .where(eq(championships.id, row.id))
  }
}

/** Settles the bracket's due rounds once: locks the bracket row, then fights what is left. */
export async function settleChampionship(db: Db, id: string, now = new Date()) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(championships)
      .where(eq(championships.id, id))
      .for('update')
    if (!row) return
    const due = roundsDue(scheduleOf(row).roundsAt, now)
    if (row.roundsSettled >= due) return
    const slots = await slotsOf(tx, row.id)
    for (let round = row.roundsSettled + 1; round <= due; round++)
      await fightRound(tx, row, round, slots)
    await tx.update(championships).set({ roundsSettled: due }).where(eq(championships.id, row.id))
  })
}

/** The job and every request: creates today's bracket and settles every bracket with due rounds. */
export async function settleChampionships(db: Db, now = new Date()) {
  await todays(db, now)
  const open = await db
    .select({ id: championships.id })
    .from(championships)
    .where(and(lt(championships.roundsSettled, FINAL), lte(championships.registrationEndsAt, now)))
  for (const { id } of open) await settleChampionship(db, id, now)
}

function matchViews(row: ChampionshipRow, played: MatchRow[]) {
  const { roundsAt } = scheduleOf(row)
  const views: ChampionshipMatchView[] = []
  let previous: number[] = []
  for (let round = 1; round <= BRACKET_ROUNDS; round++) {
    const fought = played.filter((match) => match.round === round)
    const pairs =
      round === 1
        ? pairings(1)
        : pairings(round, previous.length ? previous : Array(matchesIn(round - 1)).fill(-1))
    const scheduledAt = roundsAt[round - 1]!.toISOString()
    pairs.forEach(([slot1, slot2], matchIndex) => {
      const match = fought.find((m) => m.matchIndex === matchIndex)
      views.push({
        round,
        matchIndex,
        slot1: match ? match.slot1 : slot1,
        slot2: match ? match.slot2 : slot2,
        winnerSlot: match ? match.winnerSlot : null,
        scheduledAt,
        hasReplay: Boolean(match?.replay),
      })
    })
    previous = views.filter((view) => view.round === round).map((view) => view.winnerSlot ?? -1)
  }
  return views
}

async function championshipView(
  tx: Db | Tx,
  row: ChampionshipRow,
  characterId: string,
  now = new Date(),
): Promise<ChampionshipView> {
  const schedule = scheduleOf(row)
  const slots = await slotsOf(tx, row.id)
  const played = await matchesOf(tx, row.id)
  const challenges = await tx
    .select()
    .from(championshipChallenges)
    .where(eq(championshipChallenges.championshipId, row.id))
    .orderBy(desc(championshipChallenges.createdAt))
    .limit(CHALLENGES_SHOWN)
  const [last] = await tx
    .select({ name: championships.winnerName })
    .from(championships)
    .where(and(lt(championships.day, row.day), isNotNull(championships.winnerName)))
    .orderBy(desc(championships.day))
    .limit(1)
  const extras = await readExtras(tx, characterId)
  const bySlot = new Map(slots.map((slot) => [slot.slot, slot]))
  return {
    phase: bracketPhase(schedule, now),
    registrationEndsAt: schedule.registrationEndsAt.toISOString(),
    battlingEndsAt: schedule.battlingEndsAt.toISOString(),
    cooldownEndsAt: schedule.cooldownEndsAt.toISOString(),
    minLevel: CHAMPIONSHIP.minLevel,
    slots: Array.from({ length: CHAMPIONSHIP.slots }, (_, slot) => {
      const entry = bySlot.get(slot)
      return entry
        ? {
            slot,
            characterId: entry.characterId,
            name: entry.name,
            level: entry.level,
            clothing: entry.clothing,
          }
        : null
    }),
    mySlot: slots.find((slot) => slot.characterId === characterId)?.slot ?? null,
    matches: matchViews(row, played),
    challenges: challenges.map((c) => ({
      challengerName: c.challengerName,
      defenderName: c.defenderName,
      won: c.won,
      createdAt: c.createdAt.toISOString(),
    })),
    champion: row.winnerName,
    lastChampion: last?.name ?? null,
    heroCoins: extras.heroCoins,
    wins: extras.championshipWins,
    losses: extras.championshipLosses,
    top3: extras.championshipTop3,
    rewards: Object.entries(CHAMPIONSHIP.heroCoins).map(([round, heroCoins]) => ({
      round: Number(round),
      heroCoins,
    })),
    shop: offerViews(P.shop),
  }
}

async function result(
  tx: Tx,
  row: ChampionshipRow,
  characterId: string,
): Promise<ChampionshipActionResult> {
  return {
    championship: await championshipView(tx, row, characterId),
    character: await characterView(tx, characterId),
  }
}

/** The entry: the ninja's live arena fighter, kept for the challenges and the rounds. */
async function entryOf(tx: Tx, character: CharacterRow) {
  const fighter = await arenaFighter(tx, character)
  return {
    characterId: character.id,
    name: character.name,
    level: character.level,
    clothing: character.visualClothing ?? character.clothing,
    snapshot: toSnapshot(fighter),
    fighter,
  }
}

export async function championshipRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/championship', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const me = await characterOf(db, requireUser(request).id)
    const now = new Date()
    await settleChampionships(db, now)
    const row = await todays(db, now)
    return championshipView(db, row, me.id, now)
  })

  // Takes an empty slot, or fights the slot's holder for it ("Win to steal their position!").
  app.post(
    '/championship/enter',
    { config: { rateLimit: RATE_LIMITS.gateFight } },
    async (request) => {
      const { slot } = championshipEnterSchema.parse(request.body)
      const now = new Date()
      await settleChampionships(db, now)
      return withCharacter(db, request, async (tx, character) => {
        if (character.level < CHAMPIONSHIP.minLevel)
          throw bad(
            'level_too_low',
            `You must be at least level ${CHAMPIONSHIP.minLevel} to participate.`,
          )
        const today = await todays(tx, now)
        // The bracket row lock queues every registration and challenge of the day.
        const [row] = await tx
          .select()
          .from(championships)
          .where(eq(championships.id, today.id))
          .for('update')
        if (bracketPhase(scheduleOf(row!), now) !== 'registration')
          throw bad('registration_closed', 'Registration for this Championship is closed.')
        const slots = await slotsOf(tx, row!.id)
        if (slots.some((s) => s.characterId === character.id))
          throw bad('registered', 'You are already registered.')
        const holder = slots.find((s) => s.slot === slot)
        const entry = await entryOf(tx, character)
        const { fighter, ...values } = entry
        if (!holder) {
          await tx.insert(championshipSlots).values({ championshipId: row!.id, slot, ...values })
          return result(tx, row!, character.id)
        }
        const defender = await slotFighter(tx, holder)
        const fought = simulateFight({
          attackers: [fighter.fighter],
          defenders: [defender.fighter],
          seed: newSeed(),
        })
        const won = fought.winner === 'attackers'
        if (won)
          await tx
            .update(championshipSlots)
            .set(values)
            .where(
              and(eq(championshipSlots.championshipId, row!.id), eq(championshipSlots.slot, slot)),
            )
        await tx.insert(championshipChallenges).values({
          championshipId: row!.id,
          challengerId: character.id,
          challengerName: character.name,
          defenderId: holder.characterId,
          defenderName: holder.name,
          won,
        })
        const challenge: ChampionshipChallengeResult = {
          ...(await result(tx, row!, character.id)),
          fight: {
            replay: fought,
            looks: [fighter.look, defender.look] as [ArenaLook, ArenaLook],
            won,
          },
        }
        return challenge
      })
    },
  )

  app.get(
    '/championship/matches/:round/:match',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (request) => {
      const { round, match } = championshipMatchParamsSchema.parse(request.params)
      await characterOf(db, requireUser(request).id)
      const row = await todays(db, new Date())
      const [played] = await db
        .select({ replay: championshipMatches.replay })
        .from(championshipMatches)
        .where(
          and(
            eq(championshipMatches.championshipId, row.id),
            eq(championshipMatches.round, round),
            eq(championshipMatches.matchIndex, match),
          ),
        )
      if (!played?.replay) throw bad('no_match', 'That match has not been fought.')
      return played.replay as ArenaReplay
    },
  )

  // Championship Shop: Hero Coins for items.
  app.post(
    '/championship/shop/buy',
    { config: { rateLimit: RATE_LIMITS.shopBuy } },
    async (request) => {
      const { id } = coinShopBuySchema.parse(request.body)
      const now = new Date()
      return withCharacter(db, request, async (tx, character) => {
        await buyCoinOffer(tx, character.id, P.shop, id, 'heroCoins')
        return result(tx, await todays(tx, now), character.id)
      })
    },
  )
}
