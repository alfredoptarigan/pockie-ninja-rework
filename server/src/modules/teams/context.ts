// The locked view of the teams an action touches. Lock order (every team transaction): the team
// rows by id, then the characters (members and other involved ninjas) by id ascending. A
// membership that changed between the unlocked look-up and the locks retries the transaction.
// Expired members (offline past the grace) are removed here, so every read and action sees them
// gone without a timer (decision 15).
import type { Notice } from '@pockie/shared'
import { TEAM_GRACE_MS } from '@pockie/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { characters, teamMembers, teams, tollGateRuns } from '../../db/schema.js'
import { scene } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { notifyCharacter } from '../realtime/events.js'

export type CharacterRow = typeof characters.$inferSelect
export type TeamRow = typeof teams.$inferSelect
export type MemberRow = typeof teamMembers.$inferSelect

export interface LockedTeam {
  team: TeamRow
  /** Sorted by fight order. */
  members: MemberRow[]
}

/**
 * Demon City: this port has no Valhalla lobby scene (3102), the guard's gate select in 171 is the
 * lobby, so teams for toll gates form here.
 */
export const TOLL_GATE_LOBBY = 171

/** logicscene.ini CanTeam 1 (players) or 3 (players and servants), plus the port's lobby. */
export function teamAllowedIn(sceneId: number) {
  return sceneId === TOLL_GATE_LOBBY || [1, 3].includes(Number(scene(sceneId)?.CanTeam ?? 0))
}

export const bad = (code: string, message: string) => new HttpError(400, code, message)

class Retry extends Error {}
const MAX_ATTEMPTS = 5

export interface TeamContext {
  tx: Tx
  now: Date
  /** Every locked character. */
  chars: Map<string, CharacterRow>
  /** Every locked team, by id. */
  teams: Map<string, LockedTeam>
  /** Sent after the commit. */
  notices: { characterId: string; notice: Notice }[]
}

export const teamOf = (ctx: TeamContext, characterId: string) =>
  [...ctx.teams.values()].find((t) => t.members.some((m) => m.characterId === characterId))

export const charOf = (ctx: TeamContext, characterId: string) => {
  const row = ctx.chars.get(characterId)
  if (!row) throw new Error(`Character ${characterId} is not locked`)
  return row
}

export function notify(ctx: TeamContext, characterIds: string[], notice: Notice) {
  for (const characterId of characterIds) ctx.notices.push({ characterId, notice })
}

/** Tells every member the team changed (or ended), with an optional chat line. */
export function notifyTeam(
  ctx: TeamContext,
  characterIds: string[],
  teamId: string | null,
  message?: string,
) {
  notify(ctx, characterIds, { kind: 'teamChanged', teamId, ...(message && { message }) })
}

async function memberships(tx: Tx, characterIds: string[]) {
  if (characterIds.length === 0) return new Map<string, string>()
  const rows = await tx
    .select({ characterId: teamMembers.characterId, teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(inArray(teamMembers.characterId, characterIds))
  return new Map(rows.map((row) => [row.characterId, row.teamId]))
}

const sameMap = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)

/** Locks the teams of `characterIds` and every character involved, in the fixed order. */
async function lock(tx: Tx, characterIds: string[], now: Date): Promise<TeamContext> {
  const before = await memberships(tx, characterIds)
  const teamIds = [...new Set(before.values())].sort()
  const teamRows = teamIds.length
    ? await tx
        .select()
        .from(teams)
        .where(inArray(teams.id, teamIds))
        .orderBy(asc(teams.id))
        .for('update')
    : []
  if (teamRows.length !== teamIds.length) throw new Retry()
  const memberRows = teamIds.length
    ? await tx
        .select()
        .from(teamMembers)
        .where(inArray(teamMembers.teamId, teamIds))
        .orderBy(asc(teamMembers.fightOrder))
    : []
  const ids = [...new Set([...characterIds, ...memberRows.map((m) => m.characterId)])].sort()
  const charRows = await tx
    .select()
    .from(characters)
    .where(inArray(characters.id, ids))
    .orderBy(asc(characters.id))
    .for('update')
  // Joining needs the joiner's lock and leaving the team's, so with both held this is stable.
  if (!sameMap(before, await memberships(tx, characterIds))) throw new Retry()
  return {
    tx,
    now,
    chars: new Map(charRows.map((row) => [row.id, row])),
    teams: new Map(
      teamRows.map((team) => [
        team.id,
        { team, members: memberRows.filter((m) => m.teamId === team.id) },
      ]),
    ),
    notices: [],
  }
}

/**
 * One transaction holding the locks of `characterIds()` (looked up inside it) and their teams.
 * Members past the grace are removed first. Notices go out after the commit.
 */
export async function teamTransaction<T>(
  db: Db,
  characterIds: (tx: Tx) => Promise<string[]>,
  action: (ctx: TeamContext) => Promise<T>,
  now = new Date(),
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      let notices: TeamContext['notices'] = []
      const result = await db.transaction(async (tx) => {
        const ctx = await lock(tx, await characterIds(tx), now)
        notices = ctx.notices
        await expireOffline(ctx)
        return action(ctx)
      })
      for (const { characterId, notice } of notices) notifyCharacter(characterId, notice)
      return result
    } catch (error) {
      if (!(error instanceof Retry)) throw error
    }
  }
  throw new HttpError(409, 'team_busy', 'The team is busy. Try again.')
}

/** The user's character id (ids never change, so no lock is needed to find it). */
export async function characterIdOf(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.userId, userId))
  if (!row) throw new HttpError(404, 'no_character', 'Create your ninja first.')
  return row.id
}

async function expireOffline(ctx: TeamContext) {
  const cutoff = ctx.now.getTime() - TEAM_GRACE_MS
  for (const { team, members } of [...ctx.teams.values()]) {
    for (const member of members) {
      if (member.offlineSince && member.offlineSince.getTime() <= cutoff && ctx.teams.has(team.id))
        await removeMember(ctx, member.characterId, 'offline')
    }
  }
}

/** Ends the in-progress (not yet cleared) toll gate runs of these members. */
async function endRuns(ctx: TeamContext, teamId: string, characterIds: string[]) {
  if (characterIds.length === 0) return
  await ctx.tx
    .delete(tollGateRuns)
    .where(
      and(
        eq(tollGateRuns.teamId, teamId),
        eq(tollGateRuns.cardState, 0),
        inArray(tollGateRuns.characterId, characterIds),
      ),
    )
}

/** Deletes the team (members, its prompts and board rows cascade). */
export async function disband(ctx: TeamContext, teamId: string, message?: string) {
  const locked = ctx.teams.get(teamId)
  if (!locked) return
  const ids = locked.members.map((m) => m.characterId)
  await endRuns(ctx, teamId, ids)
  await ctx.tx.delete(teams).where(eq(teams.id, teamId))
  ctx.teams.delete(teamId)
  notifyTeam(ctx, ids, null, message ?? 'The team has been disbanded.')
}

const LEAVE_LINES = {
  leave: (name: string) => `${name} has left the team.`,
  offline: (name: string) => `${name} has left the team.`,
  kick: (name: string) => `${name} has been kicked by the captain.`,
}

/**
 * QuitTeam / kick / logout: a 2-member team disbands; the captain of 3 hands over to the
 * remaining member with the lowest fight order; the higher slots move down (ReCalculate).
 */
export async function removeMember(
  ctx: TeamContext,
  characterId: string,
  reason: keyof typeof LEAVE_LINES,
) {
  const locked = teamOf(ctx, characterId)
  if (!locked) return
  const { team } = locked
  const name = charOf(ctx, characterId).name
  if (locked.members.length <= 2) {
    const own = reason === 'kick' ? 'You have been kicked from the team.' : undefined
    if (own) notifyTeam(ctx, [characterId], null, own)
    await disband(ctx, team.id)
    return
  }
  await endRuns(ctx, team.id, [characterId])
  await ctx.tx.delete(teamMembers).where(eq(teamMembers.characterId, characterId))
  const rest = locked.members.filter((m) => m.characterId !== characterId)
  const captainId = team.captainId === characterId ? rest[0]!.characterId : team.captainId
  if (captainId !== team.captainId)
    await ctx.tx.update(teams).set({ captainId }).where(eq(teams.id, team.id))
  const members = await Promise.all(
    rest.map(async (member, fightOrder) => {
      if (member.fightOrder !== fightOrder)
        await ctx.tx
          .update(teamMembers)
          .set({ fightOrder })
          .where(eq(teamMembers.characterId, member.characterId))
      return { ...member, fightOrder }
    }),
  )
  ctx.teams.set(team.id, { team: { ...team, captainId }, members })
  const restIds = members.map((m) => m.characterId)
  notifyTeam(
    ctx,
    [characterId],
    null,
    reason === 'kick' ? 'You have been kicked from the team.' : 'You have left the team.',
  )
  notifyTeam(ctx, restIds, team.id, LEAVE_LINES[reason](name))
  if (captainId !== team.captainId)
    notifyTeam(ctx, restIds, team.id, `${charOf(ctx, captainId).name} is now the team captain.`)
}

/** Refuses actions a team member cannot take (travel, go home, explore, field fights). */
export async function requireNoTeam(tx: Tx | Db, characterId: string, action: string) {
  const [row] = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.characterId, characterId))
  if (row) throw bad('in_team', `Leave your team before you ${action}.`)
}
