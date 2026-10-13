// Team lifecycle (TeamSystem.java, teams.md section 3): invite, apply, accept, refuse, kick,
// leave, captain transfer and fight order. Every check runs again on accept, with the locks held.
import {
  TEAM_MAX_SIZE,
  TEAM_PROMPT_TTL_MS,
  type TeamPromptView,
  type TeamState,
  type TeamView,
} from '@pockie/shared'
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm'
import {
  characters,
  teamBoardEntries,
  teamMembers,
  teamPrompts,
  teams,
  tollGateRuns,
} from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { isBlocked } from './blocks.js'
import {
  bad,
  charOf,
  notify,
  notifyTeam,
  removeMember,
  teamAllowedIn,
  teamOf,
  type LockedTeam,
  type TeamContext,
} from './context.js'

type PromptRow = typeof teamPrompts.$inferSelect

const NOT_CAPTAIN = () => bad('not_captain', 'Only the team captain can do that.')
const NO_TEAM = () => bad('no_team', 'You are not in a team.')
const NO_PROMPT = () => new HttpError(404, 'no_prompt', 'That request is no longer open.')

const ids = (team: LockedTeam) => team.members.map((m) => m.characterId)

/** A ninja in a toll gate run (or holding its cards) is busy (State != 0). */
async function inRun(tx: Tx, characterId: string) {
  const [row] = await tx
    .select({ id: tollGateRuns.characterId })
    .from(tollGateRuns)
    .where(eq(tollGateRuns.characterId, characterId))
  return Boolean(row)
}

async function teamInRun(tx: Tx, teamId: string) {
  const [row] = await tx
    .select({ id: tollGateRuns.characterId })
    .from(tollGateRuns)
    .where(and(eq(tollGateRuns.teamId, teamId), eq(tollGateRuns.cardState, 0)))
    .limit(1)
  return Boolean(row)
}

function requireCaptain(ctx: TeamContext, actorId: string) {
  const mine = teamOf(ctx, actorId)
  if (!mine) throw NO_TEAM()
  if (mine.team.captainId !== actorId) throw NOT_CAPTAIN()
  return mine
}

/** One pending prompt per sender and target; an expired one is replaced. */
async function createPrompt(
  ctx: TeamContext,
  kind: 'invite' | 'apply',
  fromId: string,
  toId: string,
  teamId: string | null,
) {
  const pair = and(eq(teamPrompts.fromId, fromId), eq(teamPrompts.toId, toId))
  await ctx.tx.delete(teamPrompts).where(and(pair, lte(teamPrompts.expiresAt, ctx.now)))
  const [pending] = await ctx.tx.select({ id: teamPrompts.id }).from(teamPrompts).where(pair)
  if (pending) throw bad('prompt_pending', 'You already asked that ninja. Wait for an answer.')
  const expiresAt = new Date(ctx.now.getTime() + TEAM_PROMPT_TTL_MS)
  const [row] = await ctx.tx
    .insert(teamPrompts)
    .values({ kind, fromId, toId, teamId, createdAt: ctx.now, expiresAt })
    .returning()
  const from = charOf(ctx, fromId)
  notify(ctx, [toId], {
    kind: 'teamPrompt',
    promptId: row!.id,
    prompt: kind,
    from: { characterId: from.id, name: from.name, level: from.level },
    expiresAt: expiresAt.toISOString(),
  })
  return { promptId: row!.id, expiresAt: expiresAt.toISOString() }
}

function requireTarget(ctx: TeamContext, actorId: string, targetId: string, self: string) {
  if (actorId === targetId) throw bad('cant_target_self', self)
  if (!ctx.chars.has(targetId)) throw new HttpError(404, 'unknown_ninja', 'There is no such ninja.')
  return charOf(ctx, targetId)
}

/** CanRequest (invite): the captain or a solo ninja invites a solo ninja in the same scene. */
export async function invite(ctx: TeamContext, actorId: string, targetId: string) {
  const target = requireTarget(ctx, actorId, targetId, 'You cannot invite yourself.')
  const actor = charOf(ctx, actorId)
  const mine = teamOf(ctx, actorId)
  if (mine && mine.team.captainId !== actorId) throw NOT_CAPTAIN()
  if (await inRun(ctx.tx, actorId)) throw bad('busy', 'Finish your toll gate run first.')
  if (!teamAllowedIn(actor.sceneId)) throw bad('no_team_here', 'Teams cannot be formed here.')
  if (mine && mine.members.length >= TEAM_MAX_SIZE) throw bad('team_full', 'The team is full.')
  if (target.sceneId !== actor.sceneId)
    throw bad('not_same_scene', 'That ninja is not in this area.')
  if (await inRun(ctx.tx, targetId)) throw bad('target_busy', 'That ninja is busy.')
  if (teamOf(ctx, targetId)) throw bad('target_in_team', 'That ninja is already in a team.')
  if (mine && (await teamInRun(ctx.tx, mine.team.id)))
    throw bad('team_in_run', 'Your team is in a toll gate.')
  if (await isBlocked(ctx.tx, targetId, mine ? ids(mine) : [actorId]))
    throw bad('blocked', 'You cannot invite that ninja.')
  return createPrompt(ctx, 'invite', actorId, targetId, mine?.team.id ?? null)
}

/** CanJoinTeam (apply) with the same-scene check the original lacked (bug 1). */
export async function apply(ctx: TeamContext, actorId: string, targetId: string) {
  const target = requireTarget(ctx, actorId, targetId, 'You cannot apply to yourself.')
  const actor = charOf(ctx, actorId)
  if (teamOf(ctx, actorId)) throw bad('already_in_team', 'You are already in a team.')
  if (await inRun(ctx.tx, actorId)) throw bad('busy', 'Finish your toll gate run first.')
  if (!teamAllowedIn(actor.sceneId)) throw bad('no_team_here', 'Teams cannot be formed here.')
  const theirs = teamOf(ctx, target.id)
  if (!theirs) throw bad('target_not_in_team', 'That ninja is not in a team.')
  // CanAnswerJoinTeam showed "full" without returning (bug 6): refuse at once.
  if (theirs.members.length >= TEAM_MAX_SIZE) throw bad('team_full', 'The team is full.')
  if (actor.sceneId !== theirs.team.sceneId)
    throw bad('not_same_scene', 'That team is not in this area.')
  if (await teamInRun(ctx.tx, theirs.team.id))
    throw bad('team_in_run', 'That team is in a toll gate.')
  if (await isBlocked(ctx.tx, actorId, ids(theirs)))
    throw bad('blocked', 'You cannot join that team.')
  return createPrompt(ctx, 'apply', actorId, theirs.team.captainId, theirs.team.id)
}

/** The ninjas an accept or refuse involves (looked up before the locks). */
export async function promptParties(tx: Tx, actorId: string, promptId: string) {
  const [row] = await tx
    .select({ fromId: teamPrompts.fromId })
    .from(teamPrompts)
    .where(and(eq(teamPrompts.id, promptId), eq(teamPrompts.toId, actorId)))
  return row ? [actorId, row.fromId] : [actorId]
}

async function openPrompt(ctx: TeamContext, actorId: string, promptId: string) {
  const [prompt] = await ctx.tx
    .select()
    .from(teamPrompts)
    .where(and(eq(teamPrompts.id, promptId), eq(teamPrompts.toId, actorId)))
  if (!prompt) throw NO_PROMPT()
  if (prompt.expiresAt <= ctx.now) throw bad('prompt_expired', 'That request has expired.')
  return prompt
}

/**
 * Accept an invite (the target joins the inviter's team, created now when the inviter is solo)
 * or an application (the captain lets the applicant in). Fixes bug 3: an inviter who has since
 * joined someone else's team as a member no longer pulls the target into it.
 */
export async function accept(ctx: TeamContext, actorId: string, promptId: string) {
  const prompt = await openPrompt(ctx, actorId, promptId)
  const hostId = prompt.kind === 'invite' ? prompt.fromId : actorId
  const joinerId = prompt.kind === 'invite' ? actorId : prompt.fromId
  const host = charOf(ctx, hostId)
  const joiner = charOf(ctx, joinerId)
  const hostTeam = teamOf(ctx, hostId)
  const stale = () => bad('prompt_stale', 'That request is no longer valid.')
  if (hostTeam && hostTeam.team.captainId !== hostId) throw stale()
  if (prompt.kind === 'apply' && hostTeam?.team.id !== prompt.teamId) throw stale()
  if (teamOf(ctx, joinerId))
    throw bad(
      'already_in_team',
      joinerId === actorId ? 'You are already in a team.' : `${joiner.name} is already in a team.`,
    )
  if ((await inRun(ctx.tx, hostId)) || (await inRun(ctx.tx, joinerId)))
    throw bad('busy', 'Finish the toll gate run first.')
  const sceneId = hostTeam?.team.sceneId ?? host.sceneId
  if (!teamAllowedIn(sceneId)) throw bad('no_team_here', 'Teams cannot be formed here.')
  if (host.sceneId !== sceneId || joiner.sceneId !== sceneId)
    throw bad('not_same_scene', 'You are no longer in the same area.')
  const size = hostTeam?.members.length ?? 1
  if (size >= TEAM_MAX_SIZE) throw bad('team_full', 'The team is full.')
  if (hostTeam && (await teamInRun(ctx.tx, hostTeam.team.id)))
    throw bad('team_in_run', 'The team is in a toll gate.')
  if (await isBlocked(ctx.tx, joinerId, hostTeam ? ids(hostTeam) : [hostId]))
    throw bad('blocked', 'You cannot join that team.')

  let locked = hostTeam
  if (!locked) {
    const [team] = await ctx.tx
      .insert(teams)
      .values({ captainId: hostId, sceneId, createdAt: ctx.now })
      .returning()
    const [member] = await ctx.tx
      .insert(teamMembers)
      .values({ characterId: hostId, teamId: team!.id, fightOrder: 0, joinedAt: ctx.now })
      .returning()
    locked = { team: team!, members: [member!] }
  }
  const [joined] = await ctx.tx
    .insert(teamMembers)
    .values({ characterId: joinerId, teamId: locked.team.id, fightOrder: size, joinedAt: ctx.now })
    .returning()
  const members = [...locked.members, joined!]
  ctx.teams.set(locked.team.id, { team: locked.team, members })
  await ctx.tx.delete(teamPrompts).where(eq(teamPrompts.id, prompt.id))
  // Off the boards: the joiner's own row, and a team that is now full.
  const boardRows = [joinerId, ...(members.length >= TEAM_MAX_SIZE ? [hostId] : [])]
  await ctx.tx.delete(teamBoardEntries).where(inArray(teamBoardEntries.characterId, boardRows))
  notifyTeam(ctx, [joinerId], locked.team.id, `You joined ${host.name}'s team.`)
  notifyTeam(
    ctx,
    members.map((m) => m.characterId).filter((id) => id !== joinerId),
    locked.team.id,
    `${joiner.name} has joined your team.`,
  )
  return locked.team.id
}

export async function refuse(ctx: TeamContext, actorId: string, promptId: string) {
  const [prompt] = await ctx.tx
    .delete(teamPrompts)
    .where(and(eq(teamPrompts.id, promptId), eq(teamPrompts.toId, actorId)))
    .returning()
  if (!prompt) throw NO_PROMPT()
  const name = charOf(ctx, actorId).name
  if (prompt.expiresAt > ctx.now)
    notifyTeam(
      ctx,
      [prompt.fromId],
      teamOf(ctx, prompt.fromId)?.team.id ?? null,
      prompt.kind === 'invite'
        ? `${name} has declined your team invitation.`
        : 'Your application was declined.',
    )
}

export async function kick(ctx: TeamContext, actorId: string, targetId: string) {
  if (actorId === targetId) throw bad('cant_target_self', 'You cannot kick yourself.')
  const mine = requireCaptain(ctx, actorId)
  if (!mine.members.some((m) => m.characterId === targetId))
    throw bad('not_member', 'That ninja is not in your team.')
  if (mine.members.length > 2)
    notifyTeam(
      ctx,
      [actorId],
      mine.team.id,
      `You have kicked ${charOf(ctx, targetId).name} out of the team.`,
    )
  await removeMember(ctx, targetId, 'kick')
}

export async function leave(ctx: TeamContext, actorId: string) {
  if (!teamOf(ctx, actorId)) throw NO_TEAM()
  await removeMember(ctx, actorId, 'leave')
}

/** OnCustomHandOverCatpain: to an online member. */
export async function promote(ctx: TeamContext, actorId: string, targetId: string) {
  if (actorId === targetId) throw bad('cant_target_self', 'You are already the captain.')
  const mine = requireCaptain(ctx, actorId)
  const member = mine.members.find((m) => m.characterId === targetId)
  if (!member) throw bad('not_member', 'That ninja is not in your team.')
  if (member.offlineSince) throw bad('target_offline', 'That ninja is offline.')
  await ctx.tx.update(teams).set({ captainId: targetId }).where(eq(teams.id, mine.team.id))
  ctx.teams.set(mine.team.id, { ...mine, team: { ...mine.team, captainId: targetId } })
  const name = charOf(ctx, targetId).name
  notifyTeam(ctx, [targetId], mine.team.id, 'You are now the team captain.')
  notifyTeam(
    ctx,
    ids(mine).filter((id) => id !== targetId),
    mine.team.id,
    `${name} is now the team captain.`,
  )
}

/** OnCustomSetFightOrder: swaps a member with the neighbour above or below. */
export async function reorder(
  ctx: TeamContext,
  actorId: string,
  targetId: string,
  direction: 'up' | 'down',
) {
  const mine = requireCaptain(ctx, actorId)
  const member = mine.members.find((m) => m.characterId === targetId)
  if (!member) throw bad('not_member', 'That ninja is not in your team.')
  const order = member.fightOrder + (direction === 'up' ? -1 : 1)
  const other = mine.members.find((m) => m.fightOrder === order)
  if (!other) throw bad('bad_order', 'That ninja cannot move further.')
  const set = (characterId: string, fightOrder: number) =>
    ctx.tx.update(teamMembers).set({ fightOrder }).where(eq(teamMembers.characterId, characterId))
  await set(member.characterId, other.fightOrder)
  await set(other.characterId, member.fightOrder)
  const members = mine.members
    .map((m) =>
      m === member
        ? { ...m, fightOrder: order }
        : m === other
          ? { ...m, fightOrder: member.fightOrder }
          : m,
    )
    .sort((a, b) => a.fightOrder - b.fightOrder)
  ctx.teams.set(mine.team.id, { ...mine, members })
  notifyTeam(ctx, ids(mine), mine.team.id)
}

export async function teamView(ctx: TeamContext, locked: LockedTeam): Promise<TeamView> {
  return {
    id: locked.team.id,
    sceneId: locked.team.sceneId,
    captainId: locked.team.captainId,
    members: await Promise.all(
      locked.members.map(async (member) => {
        const row = charOf(ctx, member.characterId)
        const fighter = await playerFighter(ctx.tx, row)
        return {
          characterId: row.id,
          name: row.name,
          level: row.level,
          clothing: row.clothing,
          gender: row.gender as 0 | 1,
          hp: row.hp,
          maxHp: fighter.maxHp,
          mp: row.mp,
          maxMp: fighter.maxMp,
          fightOrder: member.fightOrder,
          captain: member.characterId === locked.team.captainId,
          online: member.offlineSince === null,
        }
      }),
    ),
  }
}

async function promptsTo(tx: Tx, characterId: string, now: Date): Promise<TeamPromptView[]> {
  const rows = await tx
    .select({ prompt: teamPrompts, from: characters })
    .from(teamPrompts)
    .innerJoin(characters, eq(characters.id, teamPrompts.fromId))
    .where(and(eq(teamPrompts.toId, characterId), gt(teamPrompts.expiresAt, now)))
  return rows.map(
    ({ prompt, from }: { prompt: PromptRow; from: typeof characters.$inferSelect }) => ({
      id: prompt.id,
      kind: prompt.kind,
      from: { characterId: from.id, name: from.name, level: from.level },
      expiresAt: prompt.expiresAt.toISOString(),
    }),
  )
}

export async function teamState(ctx: TeamContext, characterId: string): Promise<TeamState> {
  const mine = teamOf(ctx, characterId)
  return {
    team: mine ? await teamView(ctx, mine) : null,
    prompts: await promptsTo(ctx.tx, characterId, ctx.now),
  }
}

/** Marks a member disconnected (the grace starts); a no-op for ninjas without a team. */
export async function markOffline(tx: Tx, characterId: string, now: Date) {
  await tx
    .update(teamMembers)
    .set({ offlineSince: now })
    .where(and(eq(teamMembers.characterId, characterId), isNull(teamMembers.offlineSince)))
}

/** Clears the grace for a member who came back (run inside a team transaction, after expiry). */
export async function markOnline(ctx: TeamContext, characterId: string) {
  const mine = teamOf(ctx, characterId)
  if (!mine) return
  await ctx.tx
    .update(teamMembers)
    .set({ offlineSince: null })
    .where(eq(teamMembers.characterId, characterId))
  notifyTeam(ctx, ids(mine), mine.team.id)
}

/** Expired prompts and the ids of teams with a member past the grace (for the sweep). */
export async function sweepTargets(tx: Tx, cutoff: Date, now: Date) {
  await tx.delete(teamPrompts).where(lte(teamPrompts.expiresAt, now))
  const rows = await tx
    .selectDistinct({ characterId: teamMembers.characterId, teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(lte(teamMembers.offlineSince, cutoff))
  return [...new Map(rows.map((row) => [row.teamId, row.characterId])).values()]
}
