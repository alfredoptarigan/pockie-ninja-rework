// Arena fights (CompeteSystem OnCustomCompeteFight / CompeteBack / FightBoss, CompeteServer
// 1464-1537): the attacker fights live at full HP, the defender as their snapshot. Nothing here
// changes HP or MP.
import { simulateFight, type FighterInput } from '@pockie/game-core'
import { and, eq } from 'drizzle-orm'
import {
  dailyCounters,
  eloDelta,
  fightHonor,
  promotionScore,
  recordResult,
  refereeMul,
  refereeScore,
  revengeGold,
  takeTry,
  type DailyCounters,
} from '../../../../game-core/src/arena/index.js'
import type { ArenaLook } from '../../../../shared/src/schemas/arena.js'
import { arenaOpponents, arenaPlayers, arenaRevenges } from '../../db/schema.js'
import { monsterFighter } from '../../game/combat.js'
import type { Tx } from '../../game/progress.js'
import { sendSystemMail } from '../../game/system-mail.js'
import { bad, newSeed, saveCharacter, utcDay, type CharacterRow } from '../gates/common.js'
import { arenaFighter, fromSnapshot, toSnapshot, type ArenaFighter } from './snapshot.js'
import { addLog, bossNpc, npcScore, rollSlots, tierOf, TOP_TIER, type ArenaRow } from './store.js'

export interface Opponent {
  fighter: FighterInput
  look: ArenaLook
  /** Score for Elo (0 = no change). */
  score: number
  /** Shown in the log: a ninja's name or a text key. */
  name: string
  npcId?: string
  /** The defending ninja and their locked rows. */
  defender?: { character: CharacterRow; arena: ArenaRow }
}

export function npcOpponent(npcId: string): Opponent {
  const fighter = monsterFighter(npcId)
  return {
    fighter: { ...fighter, hp: fighter.maxHp, mp: fighter.maxMp },
    look: { npcId },
    score: npcScore(npcId),
    name: fighter.name,
    npcId,
  }
}

/** Stats the Referee multiplies (FightUmpire): everything but timing and level. */
const REFEREE_STATS = [
  'hp',
  'maxHp',
  'mp',
  'maxMp',
  'minAttack',
  'maxAttack',
  'hit',
  'dodge',
  'crit',
  'critAttach',
  'tough',
  'parry',
  'pierce',
  'defense',
  'neglectDefense',
  'counter',
  'priority',
] as const

/** The Referee (places -10..-1): your own live fighter x (1 + 0.05 |place|). */
export function refereeOpponent(me: ArenaFighter, myScore: number, place: number): Opponent {
  const mul = refereeMul(place)
  const scaled = Object.fromEntries(
    REFEREE_STATS.map((key) => [key, Math.trunc(me.fighter[key] * mul)]),
  )
  return {
    fighter: { ...me.fighter, ...scaled, name: 'lg_name_referee' },
    look: me.look,
    score: refereeScore(myScore, place),
    name: 'lg_name_referee',
  }
}

/** A ninja as the defender: their saved snapshot (built now if it was never stored). */
export async function playerOpponent(
  tx: Tx,
  character: CharacterRow,
  arena: ArenaRow,
): Promise<Opponent> {
  let snapshot = arena.snapshot ? fromSnapshot(arena.snapshot) : null
  if (!snapshot) {
    snapshot = await arenaFighter(tx, character)
    await tx
      .update(arenaPlayers)
      .set({ snapshot: toSnapshot(snapshot), snapshotAt: new Date() })
      .where(eq(arenaPlayers.characterId, character.id))
  }
  return {
    fighter: snapshot.fighter,
    look: snapshot.look,
    score: arena.score,
    name: character.name,
    defender: { character, arena },
  }
}

export function fight(attacker: ArenaFighter, opponent: Opponent) {
  const replay = simulateFight({
    attackers: [attacker.fighter],
    defenders: [opponent.fighter],
    seed: newSeed(),
  })
  return {
    replay,
    won: replay.winner === 'attackers',
    looks: [attacker.look, opponent.look] as [ArenaLook, ArenaLook],
  }
}

/** Takes one try (free, else 8 Gold) after every other check passed (fixes bug 5). */
export function chargeTry(character: CharacterRow, me: ArenaRow, extraGold = 0) {
  const { gold, counters } = takeTry(dailyCounters(me, utcDay()))
  const total = gold + extraGold
  if (character.gold < total) throw bad('no_gold', 'You do not have enough Gold.')
  return { gold: total, counters }
}

interface FightOutcome {
  replay: ReturnType<typeof fight>['replay']
  looks: [ArenaLook, ArenaLook]
  won: boolean
  scoreDelta: number
  honor: number
}

/**
 * A normal or revenge fight: Elo on both sides (zero-sum), Honor for the attacker, streaks, logs
 * and the defender's system mail. The caller has locked both characters and both arena rows.
 */
export async function arenaFight(
  tx: Tx,
  attacker: { character: CharacterRow; arena: ArenaRow },
  opponent: Opponent,
  { counters, gold, revenge }: { counters: DailyCounters; gold: number; revenge: boolean },
): Promise<FightOutcome> {
  const { character, arena } = attacker
  const live = await arenaFighter(tx, character)
  const { replay, won, looks } = fight(live, opponent)
  const scoreDelta = eloDelta(arena.score, opponent.score, won ? 1 : 0)
  const honor = fightHonor(tierOf(arena.tier).honor, revenge)
  const now = new Date()
  const mine = recordResult(arena, won)

  await tx
    .update(arenaPlayers)
    .set({
      ...counters,
      ...mine,
      score: arena.score + scoreDelta,
      ...(scoreDelta !== 0 && { scoreAt: now }),
    })
    .where(eq(arenaPlayers.characterId, character.id))
  await saveCharacter(tx, character.id, {
    gold: character.gold - gold,
    honor: character.honor + honor,
  })
  await addLog(tx, {
    characterId: character.id,
    kind: revenge ? 'revenge' : 'attack',
    opponentId: opponent.defender?.character.id ?? null,
    opponentNpcId: opponent.npcId ?? null,
    opponentName: opponent.name,
    result: won ? 1 : 0,
    scoreDelta,
    honor,
    streak: mine.streak,
    replay: { replay, looks },
  })

  const defender = opponent.defender
  if (defender) {
    const theirs = recordResult(defender.arena, !won)
    await tx
      .update(arenaPlayers)
      .set({
        ...theirs,
        score: defender.arena.score - scoreDelta,
        ...(scoreDelta !== 0 && { scoreAt: now }),
      })
      .where(eq(arenaPlayers.characterId, defender.character.id))
    await addLog(tx, {
      characterId: defender.character.id,
      kind: 'defense',
      opponentId: character.id,
      opponentName: character.name,
      result: won ? 0 : 1,
      scoreDelta: -scoreDelta,
      streak: theirs.streak,
      replay: { replay, looks },
    })
    await sendSystemMail(
      tx,
      defender.character.id,
      'arena',
      won ? 'arena_defense_lost' : 'arena_defense_won',
      { attacker: character.name, score: -scoreDelta },
    )
  }
  return { replay, looks, won, scoreDelta, honor }
}

/** A slot fight: the slot must exist and not be beaten yet; a win marks it beaten. */
export async function markBeaten(tx: Tx, characterId: string, slot: number) {
  await tx
    .update(arenaOpponents)
    .set({ beaten: true })
    .where(and(eq(arenaOpponents.characterId, characterId), eq(arenaOpponents.slot, slot)))
}

/** Revenges used on `targetId` today and the Gold the next one costs. */
export async function revengeCost(tx: Tx, characterId: string, targetId: string) {
  const [row] = await tx
    .select()
    .from(arenaRevenges)
    .where(and(eq(arenaRevenges.characterId, characterId), eq(arenaRevenges.targetId, targetId)))
  const used = row?.day === utcDay() ? row.used : 0
  return { used, gold: revengeGold(used) }
}

export async function recordRevenge(tx: Tx, characterId: string, targetId: string, used: number) {
  const values = { characterId, targetId, day: utcDay(), used: used + 1 }
  await tx
    .insert(arenaRevenges)
    .values(values)
    .onConflictDoUpdate({
      target: [arenaRevenges.characterId, arenaRevenges.targetId],
      set: { day: values.day, used: values.used },
    })
}

/**
 * The tier boss (free, no try, unlimited retries once score >= endscore). A win promotes: tier +1,
 * the new tier's promotion Honor, the score cap, and a fresh opponent list for the new tier.
 */
export async function bossFight(tx: Tx, character: CharacterRow, arena: ArenaRow) {
  const tier = tierOf(arena.tier)
  if (arena.tier >= TOP_TIER) throw bad('top_tier', 'You are already at the highest rank.')
  if (arena.score < tier.endscore)
    throw bad('boss_locked', 'Reach the score needed for the next rank to challenge the boss.')
  const npcId = bossNpc(arena.tier)
  const live = await arenaFighter(tx, character)
  const opponent = npcOpponent(npcId)
  const { replay, won, looks } = fight(live, opponent)
  const mine = recordResult(arena, won)
  const promotedTo = won ? arena.tier + 1 : null
  const next = promotedTo === null ? null : tierOf(promotedTo)
  const honor = next?.ranknpchonor ?? 0
  const update = {
    ...mine,
    ...(promotedTo !== null && {
      tier: promotedTo,
      score: promotionScore(arena.score, next!.beginscore),
      scoreAt: new Date(),
    }),
  }
  await tx.update(arenaPlayers).set(update).where(eq(arenaPlayers.characterId, character.id))
  if (honor) await saveCharacter(tx, character.id, { honor: character.honor + honor })
  await addLog(tx, {
    characterId: character.id,
    kind: 'boss',
    opponentNpcId: npcId,
    opponentName: opponent.name,
    result: won ? 1 : 0,
    honor,
    streak: mine.streak,
    replay: { replay, looks },
  })
  if (promotedTo !== null) await rollSlots(tx, { ...arena, ...update })
  return { replay, looks, won, scoreDelta: 0, honor, promotedTo }
}

/** The Gold check for a revenge: one try plus 10 Gold x revenges already used on the target. */
export async function chargeRevenge(
  tx: Tx,
  character: CharacterRow,
  me: ArenaRow,
  targetId: string,
) {
  const revenge = await revengeCost(tx, character.id, targetId)
  return { ...chargeTry(character, me, revenge.gold), used: revenge.used }
}
