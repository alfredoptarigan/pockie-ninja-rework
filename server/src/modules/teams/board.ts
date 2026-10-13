// Team stone boards (teams.md 3.3): per neutral field, teams of two looking for a third and solo
// ninjas looking for a team. Rows are checked on read, so a row whose team filled up, broke up
// or moved on simply stops showing (and is deleted).
import { TEAM_MAX_SIZE, type BoardPlayer, type TeamBoardView } from '@pockie/shared'
import { and, count, desc, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import { arenaPlayers, characters, teamBoardEntries, teamMembers, teams } from '../../db/schema.js'
import { pubPool } from '../gates/data.js'
import { bad, charOf, teamOf, type TeamContext } from './context.js'

/** ReadyTeamRec / RequestTeamRec refuse new rows at 100. */
export const BOARD_LIMIT = 100

function requireBoard(ctx: TeamContext, actorId: string) {
  const actor = charOf(ctx, actorId)
  if (!pubPool(actor.sceneId)?.length) throw bad('not_here', 'There is no team stone here.')
  const mine = teamOf(ctx, actorId)
  // TeamStone_ForbidEntry: only a solo ninja or the captain uses the board.
  if (mine && mine.team.captainId !== actorId)
    throw bad('not_captain', 'Only the team captain can use the team stone.')
  return { actor, mine }
}

async function players(ctx: TeamContext, ids: string[]) {
  if (ids.length === 0) return new Map<string, BoardPlayer & { sceneId: number }>()
  const rows = await ctx.tx
    .select({
      characterId: characters.id,
      name: characters.name,
      level: characters.level,
      sceneId: characters.sceneId,
      arenaTier: arenaPlayers.tier,
    })
    .from(characters)
    .leftJoin(arenaPlayers, eq(arenaPlayers.characterId, characters.id))
    .where(inArray(characters.id, ids))
  return new Map(rows.map((row) => [row.characterId, row]))
}

const strip = ({ characterId, name, level, arenaTier }: BoardPlayer): BoardPlayer => ({
  characterId,
  name,
  level,
  arenaTier,
})

export async function boardView(ctx: TeamContext, actorId: string): Promise<TeamBoardView> {
  const { actor } = requireBoard(ctx, actorId)
  const sceneId = actor.sceneId
  const rows = await ctx.tx
    .select()
    .from(teamBoardEntries)
    .where(eq(teamBoardEntries.sceneId, sceneId))
    .orderBy(desc(teamBoardEntries.createdAt))
  const teamIds = rows.flatMap((row) => (row.teamId ? [row.teamId] : []))
  const memberRows = teamIds.length
    ? await ctx.tx
        .select({
          teamId: teamMembers.teamId,
          characterId: teamMembers.characterId,
          captainId: teams.captainId,
          sceneId: teams.sceneId,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(inArray(teamMembers.teamId, teamIds))
    : []
  const soloIds = rows.filter((row) => !row.teamId).map((row) => row.characterId)
  const inTeams = soloIds.length
    ? await ctx.tx
        .select({ characterId: teamMembers.characterId })
        .from(teamMembers)
        .where(inArray(teamMembers.characterId, soloIds))
    : []
  const people = await players(ctx, [...soloIds, ...memberRows.map((m) => m.characterId)])
  const busy = new Set(inTeams.map((row) => row.characterId))

  const stale: string[] = []
  const view: TeamBoardView = { sceneId, teams: [], solos: [], listed: false }
  for (const row of rows) {
    if (!row.teamId) {
      const player = people.get(row.characterId)
      if (!player || busy.has(row.characterId) || player.sceneId !== sceneId) {
        stale.push(row.characterId)
        continue
      }
      view.solos.push(strip(player))
    } else {
      const members = memberRows.filter((m) => m.teamId === row.teamId)
      const valid =
        members.length === TEAM_MAX_SIZE - 1 &&
        members[0]!.captainId === row.characterId &&
        members[0]!.sceneId === sceneId
      if (!valid) {
        stale.push(row.characterId)
        continue
      }
      const other = members.find((m) => m.characterId !== row.characterId)!
      view.teams.push({
        teamId: row.teamId,
        captain: strip(people.get(row.characterId)!),
        member: strip(people.get(other.characterId)!),
      })
    }
    if (row.characterId === actorId) view.listed = true
  }
  if (stale.length)
    await ctx.tx.delete(teamBoardEntries).where(inArray(teamBoardEntries.characterId, stale))
  view.teams = view.teams.slice(0, BOARD_LIMIT)
  view.solos = view.solos.slice(0, BOARD_LIMIT)
  return view
}

/** OnCustomJoinSceneReadyTeam (captain of two) / OnCustomJoinSceneRequestTeam (solo). */
export async function joinBoard(ctx: TeamContext, actorId: string) {
  const { actor, mine } = requireBoard(ctx, actorId)
  if (mine && mine.members.length !== TEAM_MAX_SIZE - 1)
    throw bad('cannot_list', 'Only a solo ninja or the captain of a team of two can be listed.')
  const teamId = mine?.team.id ?? null
  const [{ listed } = { listed: 0 }] = await ctx.tx
    .select({ listed: count() })
    .from(teamBoardEntries)
    .where(
      and(
        eq(teamBoardEntries.sceneId, actor.sceneId),
        teamId ? isNotNull(teamBoardEntries.teamId) : isNull(teamBoardEntries.teamId),
      ),
    )
  if (listed >= BOARD_LIMIT) throw bad('board_full', 'The board is full. Try again later.')
  await ctx.tx
    .insert(teamBoardEntries)
    .values({ characterId: actorId, sceneId: actor.sceneId, teamId, createdAt: ctx.now })
    .onConflictDoUpdate({
      target: teamBoardEntries.characterId,
      set: { sceneId: actor.sceneId, teamId, createdAt: ctx.now },
    })
}

export async function leaveBoard(ctx: TeamContext, actorId: string) {
  await ctx.tx.delete(teamBoardEntries).where(eq(teamBoardEntries.characterId, actorId))
}
