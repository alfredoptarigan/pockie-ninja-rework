// Team Stone matchmaking (M5 decision 28): a job pairs the waiting queue into 3v3 matches, fills
// empty seats with arena snapshots of a similar score after 15-30 s, and runs the fight at once as
// sequential duels (like team toll gates). The attempt is spent here, when the fight starts.
import { simulateFight } from '@pockie/game-core'
import {
  fighterPower,
  planMatches,
  scoreDelta,
  type MatchPlan,
} from '../../../../game-core/src/events/team-stone.js'
import { and, asc, eq, gte, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import {
  arenaPlayers,
  characters,
  teamStoneMatches,
  teamStonePlayers,
  teamStoneQueue,
} from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { newSeed } from '../gates/common.js'
import { lockCharacters } from '../arena/store.js'
import { arenaFighter, fromSnapshot, type ArenaFighter } from '../arena/snapshot.js'
import {
  attemptsUsed,
  config,
  lockPlayer,
  monthStart,
  settle,
  utcDay,
  type PlayerRow,
} from './store.js'

/** "Run it every few seconds" (the bot fill is 15-30 s). */
export const TEAM_STONE_MATCH_INTERVAL_MS = 5_000

interface Bot {
  id: string
  snapshot: ArenaFighter
}

/** What a match stores in `replay`: the fight, the looks and every queued ninja's score change. */
export interface StoredMatch {
  replay: ReturnType<typeof simulateFight>
  looks: ArenaFighter['look'][]
  names: string[]
  deltas: Record<string, number>
}

/**
 * Arena snapshots of level-50+ ninjas nearest `score` (Team Stone score, 0 if never played),
 * skipping `taken`: everyone in the queue and every seat already filled this run.
 */
async function pickBots(
  db: Db,
  count: number,
  score: number,
  taken: Set<string>,
  now: Date,
) {
  if (count === 0) return []
  const rows = await db
    .select({ id: arenaPlayers.characterId, snapshot: arenaPlayers.snapshot })
    .from(arenaPlayers)
    .innerJoin(characters, eq(characters.id, arenaPlayers.characterId))
    .leftJoin(teamStonePlayers, eq(teamStonePlayers.characterId, arenaPlayers.characterId))
    .where(
      and(
        isNotNull(arenaPlayers.snapshot),
        gte(characters.level, config().minLevel),
        taken.size ? notInArray(arenaPlayers.characterId, [...taken]) : undefined,
      ),
    )
    .orderBy(
      // The current-month score; a stale month counts as 0 (the full monthly reset).
      sql`abs((case when ${teamStonePlayers.month} = ${monthStart(now)} then ${teamStonePlayers.score} else 0 end) - ${score})`,
      asc(arenaPlayers.characterId),
    )
    .limit(count)
  return rows.map((row): Bot => ({ id: row.id, snapshot: fromSnapshot(row.snapshot!) }))
}

/**
 * Starts one planned match in its own transaction: locks the queued ninjas and the bots
 * (characters by id, then the queued player rows, then their queue rows) and re-checks they are
 * still waiting with an attempt left and that no bot joined the queue since the job read it.
 * Returns the match id, or null when the plan went stale.
 */
async function startMatch(tx: Tx, plan: MatchPlan, bots: [Bot[], Bot[]], now: Date) {
  const queuedIds = [...plan.sides[0], ...plan.sides[1]]
  const botIds = [...bots[0], ...bots[1]].map((b) => b.id)
  // Joining the queue locks the character too, so a bot cannot queue until this commits.
  const locked = await lockCharacters(tx, [...queuedIds, ...botIds])
  if (locked.size !== queuedIds.length + botIds.length) return null
  if (botIds.length) {
    const queuedBots = await tx
      .select({ id: teamStoneQueue.characterId })
      .from(teamStoneQueue)
      .where(inArray(teamStoneQueue.characterId, botIds))
    if (queuedBots.length) return null
  }
  const players = new Map<string, PlayerRow>()
  for (const id of [...queuedIds].sort())
    players.set(id, await settle(tx, await lockPlayer(tx, id), now))
  const queue = await tx
    .select()
    .from(teamStoneQueue)
    .where(and(inArray(teamStoneQueue.characterId, queuedIds), isNull(teamStoneQueue.matchId)))
    .orderBy(asc(teamStoneQueue.characterId))
    .for('update')
  if (queue.length !== queuedIds.length) return null
  const { attemptsPerDay } = config()
  const spent = queue.filter(
    (q) => attemptsUsed(players.get(q.characterId)!, now) >= attemptsPerDay,
  )
  if (spent.length) {
    // A ninja out of attempts (a new day cannot cause it) leaves the queue; the rest wait on.
    await tx.delete(teamStoneQueue).where(
      inArray(
        teamStoneQueue.characterId,
        spent.map((q) => q.characterId),
      ),
    )
    return null
  }

  const queuePower = new Map(queue.map((q) => [q.characterId, q.power]))
  const side = async (ids: string[], sideBots: Bot[]) => {
    const live = await Promise.all(ids.map((id) => arenaFighter(tx, locked.get(id)!)))
    return [
      ...ids.map((id, i) => ({ id, fighter: live[i]!, power: queuePower.get(id)!, queued: true })),
      ...sideBots.map((b) => ({
        id: b.id,
        fighter: b.snapshot,
        power: fighterPower(b.snapshot.fighter),
        queued: false,
      })),
    ]
  }
  const teams = [await side(plan.sides[0], bots[0]), await side(plan.sides[1], bots[1])] as const
  const replay = simulateFight({
    attackers: teams[0].map((s) => s.fighter.fighter),
    defenders: teams[1].map((s) => s.fighter.fighter),
    seed: newSeed(),
  })
  const winner = replay.winner === 'attackers' ? 0 : 1
  const power = teams.map((t) => t.reduce((sum, s) => sum + s.power, 0))
  // The applied change: the score never drops below 0.
  const deltas: Record<string, number> = {}
  for (const [i, team] of teams.entries())
    for (const seat of team) {
      if (!seat.queued) continue
      const score = players.get(seat.id)!.score
      const raw = scoreDelta(power[i]!, power[1 - i]!, winner === i)
      deltas[seat.id] = Math.max(0, score + raw) - score
    }

  const names = await tx
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(
      inArray(
        characters.id,
        [...teams[0], ...teams[1]].map((s) => s.id),
      ),
    )
  const nameOf = new Map(names.map((n) => [n.id, n.name]))
  const all = [...teams[0], ...teams[1]]
  const stored: StoredMatch = {
    replay,
    looks: all.map((s) => s.fighter.look),
    names: all.map((s) => nameOf.get(s.id) ?? ''),
    deltas,
  }
  const [match] = await tx
    .insert(teamStoneMatches)
    .values({
      teamA: teams[0].map((s) => s.id),
      teamB: teams[1].map((s) => s.id),
      winner,
      replay: stored,
    })
    .returning({ id: teamStoneMatches.id })

  const today = utcDay(now)
  for (const id of queuedIds) {
    const row = players.get(id)!
    await tx
      .update(teamStonePlayers)
      .set({
        score: row.score + deltas[id]!,
        attemptsDay: today,
        attemptsUsed: attemptsUsed(row, now) + 1,
        playedThisWeek: true,
      })
      .where(eq(teamStonePlayers.characterId, id))
  }
  await tx.delete(teamStoneQueue).where(inArray(teamStoneQueue.characterId, queuedIds))
  return match!.id
}

/**
 * The matchmaking job: plans matches from the waiting queue and starts each one. A queued ninja
 * is never a bot, and no ninja takes two seats in one run. Returns the started match ids.
 */
export async function matchTeamStone(db: Db, now = new Date()) {
  const queue = await db.select().from(teamStoneQueue)
  const waiting = queue
    .filter((q) => q.matchId === null)
    .map((q) => ({ id: q.characterId, score: q.score, queuedAt: q.queuedAt.getTime() }))
  const plans = planMatches(waiting, now.getTime(), config().botFillSeconds)
  const taken = new Set(queue.map((q) => q.characterId))
  const started: string[] = []
  for (const plan of plans) {
    const bots = await pickBots(db, plan.bots[0] + plan.bots[1], plan.score, taken, now)
    // Not enough arena ninjas yet: the plan waits for more players.
    if (bots.length < plan.bots[0] + plan.bots[1]) continue
    for (const bot of bots) taken.add(bot.id)
    const split: [Bot[], Bot[]] = [bots.slice(0, plan.bots[0]), bots.slice(plan.bots[0])]
    const id = await db.transaction((tx) => startMatch(tx, plan, split, now))
    if (id) started.push(id)
  }
  return started
}
