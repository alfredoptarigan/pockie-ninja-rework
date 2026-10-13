// Team runs (teams.md 4): toll gates and pub fights led by the captain. The gate routes call these
// first; `undefined` means the ninja is not in a team and the solo route goes on. One fight is
// the members in fight order as sequential duels; every member gets the full reward.
import {
  currentPoint,
  gateLayout,
  GateRuleError,
  PUB_FIGHT_MAX_PER_DAY,
  winPoint,
  type EntryRefusal,
} from '@pockie/game-core'
import type {
  GateRewards,
  PubPullResult,
  TeamMemberRewards,
  TeamPubFightResult,
  TeamTollGateFightResult,
} from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { characters, teamMembers } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { drawPouch } from '../../game/pouch.js'
import { vipDropMul, vipExp } from '../../game/vip.js'
import { requireAlive, requireUser } from '../game/characters.js'
import {
  bad,
  characterView,
  DEMON_CITY,
  grantDrops,
  lastNpcRewards,
  saveCharacter,
  teamDuel,
  utcDay,
  withExp,
} from '../gates/common.js'
import { tollGateConfig, tollGateTables } from '../gates/data.js'
import { fightsToday, lineupOf, pubView, pull, requirePool } from '../gates/pub-fights.js'
import {
  entryRefusalOf,
  loadRun,
  payEntry,
  REFUSALS,
  requireRun,
  runState,
  runView,
  winForMember,
} from '../gates/toll-gates.js'
import {
  charOf,
  disband,
  notify,
  notifyTeam,
  removeMember,
  teamOf,
  teamTransaction,
  type LockedTeam,
  type TeamContext,
} from './context.js'

const NO_REWARDS = (): GateRewards => ({ exp: 0, stone: 0, items: [], levelsGained: 0 })

/** The same refusals as solo, naming the member who fails them (TollGate_TeamPlayerNEC*). */
const MEMBER_REFUSALS: Record<EntryRefusal, (name: string) => string> = {
  no_tries: (name) => `${name} has used all of today’s toll gate tries.`,
  too_low: (name) => `${name}'s level is too low for this toll gate.`,
  missing_item: (name) => `${name} needs the entry item for this toll gate.`,
  no_weapon: (name) => `${name} must equip a weapon before entering a toll gate.`,
  low_hp: (name) => `${name} needs more than 90% HP to enter a toll gate.`,
}

/**
 * Runs `action` with the actor's team locked, or returns undefined when the actor is not in a
 * team (the unlocked look-up skips the team transaction for solo ninjas). Members past the grace
 * are removed first, so the actor may find the team gone and fall back to solo.
 */
async function asTeam<T>(
  db: Db,
  request: FastifyRequest,
  action: (ctx: TeamContext, actorId: string, mine: LockedTeam) => Promise<T>,
): Promise<T | undefined> {
  const [row] = await db
    .select({ id: teamMembers.characterId })
    .from(teamMembers)
    .innerJoin(characters, eq(characters.id, teamMembers.characterId))
    .where(eq(characters.userId, requireUser(request).id))
  if (!row) return undefined
  const actorId = row.id
  try {
    return await teamTransaction(
      db,
      async () => [actorId],
      async (ctx) => {
        const mine = teamOf(ctx, actorId)
        return mine ? action(ctx, actorId, mine) : undefined
      },
    )
  } catch (error) {
    if (error instanceof GateRuleError) throw bad(error.code, error.message)
    throw error
  }
}

function requireCaptain(mine: LockedTeam, actorId: string, action: string) {
  if (mine.team.captainId !== actorId)
    throw bad('not_captain', `Only the team captain can ${action}.`)
}

/** Starting a run or a fight needs every member online (a run in progress rides the grace). */
function requireOnline(ctx: TeamContext, mine: LockedTeam) {
  const away = mine.members.find((m) => m.offlineSince)
  if (away) throw bad('member_offline', `${charOf(ctx, away.characterId).name} is offline.`)
}

const ninjasOf = (ctx: TeamContext, mine: LockedTeam) =>
  mine.members.map((m) => charOf(ctx, m.characterId))

/**
 * POST /gates/enter for a team: only the captain; every member at the guard, online, without a
 * run, inside the gate's level range (both ends, decision 4) and passing the solo checks; then
 * each member spends a try and the item and gets a run row tied to the team.
 */
export function teamGateEnter(db: Db, request: FastifyRequest, gateId: number) {
  return asTeam(db, request, async (ctx, actorId, mine) => {
    requireCaptain(mine, actorId, 'enter a toll gate')
    const gate = tollGateTables().gates[String(gateId)]!
    if (Number(gate.RequirTeam) === 0)
      throw bad('solo_only', 'This toll gate is for one ninja only. Leave your team first.')
    const ninjas = ninjasOf(ctx, mine)
    for (const ninja of ninjas) {
      if (ninja.sceneId === DEMON_CITY) continue
      if (ninja.id === actorId)
        throw bad('not_here', 'Talk to the Demon City Guard to enter a toll gate.')
      throw bad('not_same_scene', `${ninja.name} is not at the Demon City Guard.`)
    }
    requireOnline(ctx, mine)
    for (const ninja of ninjas) {
      const self = ninja.id === actorId
      if (await loadRun(ctx.tx, ninja.id))
        throw bad(
          'run_active',
          self ? 'You are already in a toll gate.' : `${ninja.name} is already in a toll gate.`,
        )
      if (ninja.level > gate.RequirMaxLevel)
        throw bad('too_high', `${ninja.name}'s level is too high for this toll gate.`)
      const refusal = await entryRefusalOf(ctx.tx, ninja, gateId)
      if (refusal)
        throw bad(refusal, self ? REFUSALS[refusal] : MEMBER_REFUSALS[refusal](ninja.name))
    }
    const rows = []
    for (const ninja of ninjas) rows.push(await payEntry(ctx.tx, ninja, gateId, mine.team.id))
    const others = ninjas.filter((n) => n.id !== actorId).map((n) => n.id)
    notifyTeam(
      ctx,
      others,
      mine.team.id,
      `${charOf(ctx, actorId).name} led the team into a toll gate.`,
    )
    return {
      run: runView(rows[ninjas.findIndex((n) => n.id === actorId)]!),
      character: await characterView(ctx.tx, actorId),
    }
  })
}

const memberRewards = (
  ctx: TeamContext,
  characterId: string,
  rewards: GateRewards,
  bonus?: { exp: number; stone: number },
): TeamMemberRewards => ({
  characterId,
  name: charOf(ctx, characterId).name,
  rewards,
  ...(bonus && { bonus }),
})

/** Tells the other members what they got (the captain reads the response). */
function notifyRewards(ctx: TeamContext, actorId: string, team: TeamMemberRewards[], won: boolean) {
  for (const member of team) {
    if (member.characterId === actorId) continue
    const { exp, stone } = member.rewards
    notify(ctx, [member.characterId], {
      kind: 'teamChanged',
      teamId: teamOf(ctx, member.characterId)?.team.id ?? null,
      message: won
        ? `Your team won the fight. You received ${exp} EXP and ${stone} Stone.`
        : 'Your team lost the fight.',
    })
  }
}

/**
 * POST /gates/run/fight for a team: the captain starts one fight for the whole team at the run's
 * point. A win pays every member (the captain's bonus by team size, CaptianMul) and moves every
 * run on; the clear deals each member's own cards and ends the team. A loss leaves everyone at
 * 1 HP and ends the runs and the team (TollGateSystem 788-811, 192-236).
 */
export function teamGateFight(db: Db, request: FastifyRequest) {
  return asTeam(db, request, async (ctx, actorId, mine): Promise<TeamTollGateFightResult> => {
    requireCaptain(mine, actorId, 'start a fight')
    const captain = charOf(ctx, actorId)
    requireAlive(captain, 'fight')
    const row = await requireRun(ctx.tx, actorId)
    const runs = await Promise.all(mine.members.map((m) => loadRun(ctx.tx, m.characterId)))
    // Every member's run moves in step; a member without one is not in the fight.
    const fighters = mine.members.flatMap((m, i) => {
      const run = runs[i]
      return run?.teamId === mine.team.id ? [{ ninja: charOf(ctx, m.characterId), run }] : []
    })
    const tables = tollGateTables()
    const layout = gateLayout(row.gateId, tables)
    const point = currentPoint(runState(row), layout)
    const ninjas = fighters.map((f) => f.ninja)
    const { replay, won, states } = await teamDuel(ctx.tx, ninjas, point.npcIds)

    if (!won) {
      for (const [i, ninja] of ninjas.entries())
        await saveCharacter(ctx.tx, ninja.id, { hp: 1, mp: states[i]!.mp })
      const team = ninjas.map((n) => memberRewards(ctx, n.id, NO_REWARDS()))
      notifyRewards(ctx, actorId, team, false)
      await disband(ctx, mine.team.id, 'The toll gate run is over. The team has been disbanded.')
      return {
        replay,
        won,
        npcIds: point.npcIds,
        rewards: NO_REWARDS(),
        run: null,
        character: await characterView(ctx.tx, actorId),
        team,
      }
    }

    const outcome = winPoint(runState(row), layout, tables)
    // Members inside the grace still count (decision 15); expired ones are gone already.
    const captainMul = tollGateConfig().captainMul[String(mine.members.length)]
    const lastNpcId = point.npcIds[point.npcIds.length - 1]!
    const results = []
    for (const [i, { ninja, run }] of fighters.entries()) {
      const mul = ninja.id === actorId ? captainMul : undefined
      results.push(await winForMember(ctx.tx, ninja, run, states[i]!, lastNpcId, outcome, mul))
    }
    const team = results.map((r, i) => memberRewards(ctx, ninjas[i]!.id, r.rewards, r.bonus))
    notifyRewards(ctx, actorId, team, true)
    if (outcome.cleared)
      await disband(ctx, mine.team.id, 'The toll gate is cleared. The team has been disbanded.')
    const own = results[ninjas.findIndex((n) => n.id === actorId)]!
    return {
      replay,
      won,
      npcIds: point.npcIds,
      rewards: own.rewards,
      run: runView(own.run),
      character: await characterView(ctx.tx, actorId),
      team,
    }
  })
}

/**
 * POST /gates/run/exit inside a team run: the member leaves the team (the run ends for them; a
 * team of 2 disbands and ends every run), the rest go on (TollGateSystem 1459-1465). After a clear
 * the team is already gone and the solo exit hands out a card.
 */
export function teamGateExit(db: Db, request: FastifyRequest) {
  return asTeam(db, request, async (ctx, actorId, mine) => {
    const run = await loadRun(ctx.tx, actorId)
    if (run?.teamId !== mine.team.id) return undefined
    await removeMember(ctx, actorId, 'leave')
    return { card: null, character: await characterView(ctx.tx, actorId) }
  })
}

/**
 * POST /gates/pub/fight for a team (PubMonsterFightSystem 502-708): the captain starts it against
 * the captain's line-up; every member must be in the captain's field, online, at full HP and
 * under the daily limit. Every member gets the last NPC's reward; only the captain pulls a new
 * line-up (with its combo reward) after a win. A loss leaves everyone at 1 HP.
 */
export function teamPubFight(db: Db, request: FastifyRequest) {
  return asTeam(db, request, async (ctx, actorId, mine): Promise<TeamPubFightResult> => {
    requireCaptain(mine, actorId, 'start a fight')
    const captain = charOf(ctx, actorId)
    const pool = requirePool(captain)
    const ninjas = ninjasOf(ctx, mine)
    for (const ninja of ninjas)
      if (ninja.sceneId !== captain.sceneId)
        throw bad('not_same_scene', `${ninja.name} is not in this area.`)
    requireOnline(ctx, mine)
    for (const ninja of ninjas) {
      const self = ninja.id === actorId
      if (ninja.hp < (await playerFighter(ctx.tx, ninja)).maxHp)
        throw bad(
          'not_full_hp',
          self
            ? 'You need full HP for a pub fight.'
            : `${ninja.name} needs full HP for a pub fight.`,
        )
      if (fightsToday(ninja) >= PUB_FIGHT_MAX_PER_DAY)
        throw bad(
          'daily_limit',
          self
            ? 'You cannot fight in the pub any more today.'
            : `${ninja.name} cannot fight in the pub any more today.`,
        )
    }
    const npcIds = await lineupOf(ctx.tx, captain, pool)
    const { replay, won, states } = await teamDuel(ctx.tx, ninjas, npcIds)
    const lastNpcId = npcIds[npcIds.length - 1]!
    const team: TeamMemberRewards[] = []
    for (const [i, ninja] of ninjas.entries()) {
      const daily = { pubFightDay: utcDay(), pubFightsToday: fightsToday(ninja) + 1 }
      if (!won) {
        await saveCharacter(ctx.tx, ninja.id, { ...daily, hp: 1, mp: states[i]!.mp })
        team.push(memberRewards(ctx, ninja.id, NO_REWARDS()))
        continue
      }
      const { hp, mp, maxHp, maxMp } = states[i]!
      const hpDraw = drawPouch(hp, maxHp, ninja.hpPouch)
      const mpDraw = drawPouch(mp, maxMp, ninja.mpPouch)
      const kill = lastNpcRewards(lastNpcId, vipDropMul(ninja))
      const exp = vipExp(kill.exp, ninja)
      const { update, levelsGained } = withExp(
        ninja,
        { hp: hpDraw.value, mp: mpDraw.value, hpPouch: hpDraw.pouch, mpPouch: mpDraw.pouch },
        exp,
      )
      const items = await grantDrops(ctx.tx, ninja.id, kill.items)
      await saveCharacter(ctx.tx, ninja.id, {
        ...update,
        ...daily,
        stone: ninja.stone + kill.stone,
      })
      const lost = kill.items.length - items.length
      const rewards = { exp, stone: kill.stone, items, levelsGained, ...(lost > 0 && { lost }) }
      team.push(memberRewards(ctx, ninja.id, rewards))
    }
    let lineup = npcIds
    let combo: PubPullResult['combo'] = null
    let own = team.find((m) => m.characterId === actorId)!
    if (won) {
      const next = await pull(ctx.tx, captain, pool, true)
      ;({ lineup, combo } = next)
      const lost = (own.rewards.lost ?? 0) + next.lost
      if (lost > 0) own = { ...own, rewards: { ...own.rewards, lost } }
    }
    notifyRewards(ctx, actorId, team, won)
    const daily = { pubFightDay: utcDay(), pubFightsToday: fightsToday(captain) + 1 }
    return {
      replay,
      won,
      npcIds,
      rewards: own.rewards,
      combo,
      pub: pubView({ ...captain, ...daily }, lineup),
      character: await characterView(ctx.tx, actorId),
      team,
    }
  })
}
