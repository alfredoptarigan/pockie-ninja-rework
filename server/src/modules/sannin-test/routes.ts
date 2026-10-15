// Sannin Test (Reborn's "Sannin Test - Six Dice", level 60) under /api/game/sannin-test: roll six
// dice, Change Luck (free uses a day), Perfect (Gold), claim the pending EXP and Growing Points,
// and the promotion battle up the title path (each rank adds permanent Max HP). Dice and free
// changes reset at 00:00 UTC. Each action locks the character row, then the ninja's row.
import { createRandom, simulateFight } from '@pockie/game-core'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  type SanninClaimResult,
  type SanninPromotionResult,
  type SanninTestView,
  SANNIN_RULES,
} from '../../../../shared/src/schemas/sannin-test.js'
import type { Db } from '../../db/client.js'
import { characters, sanninPlayers } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { equipmentBonuses, equippedGear } from '../../game/equipment.js'
import type { Tx } from '../../game/progress.js'
import { maxRank } from '../../game/sannin.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { nextDay } from '../events/view.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  newSeed,
  saveCharacter,
  utcDay,
  withCharacter,
  withExp,
  type CharacterRow,
} from '../gates/common.js'
import { usedToday } from '../impel-down/rules.js'
import { SANNIN_PLACEHOLDERS as P } from './config.js'
import {
  changeLuck,
  examinerFighter,
  examinerOf,
  ninjaCount,
  pendingOf,
  perfectDice,
  rewardOf,
  rollDice,
} from './rules.js'

type PlayerRow = typeof sanninPlayers.$inferSelect

async function playerRow(tx: Tx | Db, characterId: string) {
  const [row] = await tx
    .select()
    .from(sanninPlayers)
    .where(eq(sanninPlayers.characterId, characterId))
  return row
}

/** The ninja's row, created on first use and locked (after the character row). */
async function lockPlayer(tx: Tx, characterId: string) {
  await tx.insert(sanninPlayers).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(sanninPlayers)
    .where(eq(sanninPlayers.characterId, characterId))
    .for('update')
  return row!
}

async function savePlayer(tx: Tx, characterId: string, values: Partial<PlayerRow>) {
  const [row] = await tx
    .update(sanninPlayers)
    .set(values)
    .where(eq(sanninPlayers.characterId, characterId))
    .returning()
  return row!
}

/** Today's used dice and changes (both reset with the dice day). */
const today = (row: PlayerRow | undefined, now: Date) => ({
  dice: usedToday(row?.diceDay ?? null, row?.diceUsed ?? 0, now),
  changes: usedToday(row?.diceDay ?? null, row?.changesUsed ?? 0, now),
})

function view(row: PlayerRow | undefined, character: CharacterRow, now: Date): SanninTestView {
  const used = today(row, now)
  const pending = row?.pending ?? null
  return {
    state: {
      rank: row?.rank ?? 0,
      growthPoints: row?.growthPoints ?? 0,
      remainingDice: P.dicePerDay - used.dice,
      remainingFreeChanges: P.freeChangesPerDay - used.changes,
      totalRolls: row?.totalRolls ?? 0,
      pending: pending ? pendingOf(pending) : null,
    },
    rankBonuses: [...P.rankBonuses],
    pendingReward: pending ? rewardOf(pending, character.level) : null,
    makeSixCost: P.makeSixCost,
    gold: character.gold,
    resetAt: nextDay(now),
  }
}

function requireLevel(character: CharacterRow) {
  if (character.level < SANNIN_RULES.minLevel)
    throw new HttpError(
      403,
      'level_too_low',
      `The Sannin Test needs level ${SANNIN_RULES.minLevel}.`,
    )
}

/** Today's counters carried to the current day (a new day starts them at zero). */
const dayValues = (row: PlayerRow, now: Date) => {
  const used = today(row, now)
  return { diceDay: utcDay(now), diceUsed: used.dice, changesUsed: used.changes }
}

async function roll(tx: Tx, character: CharacterRow) {
  const now = new Date()
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  if (me.pending) throw bad('pending', 'Claim the current dice result first.')
  const day = dayValues(me, now)
  if (day.diceUsed >= P.dicePerDay) throw bad('no_dice', 'All dice attempts have been used today.')
  const after = await savePlayer(tx, character.id, {
    ...day,
    diceUsed: day.diceUsed + 1,
    totalRolls: me.totalRolls + 1,
    pending: rollDice(createRandom(newSeed())),
  })
  return view(after, character, now)
}

/** The pending dice, or a 400 when there are none. */
const pendingDice = (me: PlayerRow) => {
  if (!me.pending) throw bad('no_pending', 'Roll the dice first.')
  return me.pending
}

async function changeLuckAction(tx: Tx, character: CharacterRow) {
  const now = new Date()
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  const dice = pendingDice(me)
  if (ninjaCount(dice) >= SANNIN_RULES.dice) throw bad('perfect', 'All six dice are Ninja dice.')
  const day = dayValues(me, now)
  if (day.changesUsed >= P.freeChangesPerDay)
    throw bad('no_changes', 'You have no free luck changes left today.')
  const after = await savePlayer(tx, character.id, {
    ...day,
    changesUsed: day.changesUsed + 1,
    pending: changeLuck(dice, createRandom(newSeed())),
  })
  return view(after, character, now)
}

async function perfect(tx: Tx, character: CharacterRow) {
  const now = new Date()
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  if (ninjaCount(pendingDice(me)) !== SANNIN_RULES.dice - 1)
    throw bad('not_five', 'Perfect needs exactly five Ninja dice.')
  if (character.gold < P.makeSixCost) throw bad('not_enough', `You need ${P.makeSixCost} Gold.`)
  await tx
    .update(characters)
    .set({ gold: sql`${characters.gold} - ${P.makeSixCost}` })
    .where(eq(characters.id, character.id))
  const after = await savePlayer(tx, character.id, { pending: perfectDice() })
  const gold = { ...character, gold: character.gold - P.makeSixCost }
  return {
    sanninTest: view(after, gold, now),
    character: await characterView(tx, character.id),
  }
}

async function claim(tx: Tx, character: CharacterRow): Promise<SanninClaimResult> {
  const now = new Date()
  requireLevel(character)
  const me = await lockPlayer(tx, character.id)
  const reward = rewardOf(pendingDice(me), character.level)
  const { update } = withExp(character, {}, reward.experience)
  await saveCharacter(tx, character.id, update)
  const after = await savePlayer(tx, character.id, {
    pending: null,
    growthPoints: me.growthPoints + reward.growthPoints,
  })
  return {
    sanninTest: view(after, { ...character, ...update }, now),
    experience: reward.experience,
    growthPoints: reward.growthPoints,
    character: await characterView(tx, character.id),
  }
}

async function promote(tx: Tx, character: CharacterRow): Promise<SanninPromotionResult> {
  const now = new Date()
  requireLevel(character)
  requireAlive(character, 'fight')
  const me = await lockPlayer(tx, character.id)
  if (me.pending) throw bad('pending', 'Claim the current dice result before a promotion battle.')
  if (me.rank >= maxRank) throw bad('max_rank', 'All Sannin titles have been unlocked.')
  const targetRank = me.rank + 1
  const required = P.rankBonuses[targetRank]!.requiredPoints
  if (me.growthPoints < required) throw bad('not_enough', `Requires ${required} Growing Points.`)
  // Like a dungeon boss, the battle costs no HP or MP: the ninja enters at full strength.
  const player = await playerFighter(tx, character)
  const gear = equipmentBonuses(await equippedGear(tx, character.id), character)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [examinerFighter(targetRank, character.level, gear)],
    seed: newSeed(),
  })
  const victory = replay.winner === 'attackers'
  const after = victory
    ? await savePlayer(tx, character.id, {
        rank: targetRank,
        growthPoints: me.growthPoints - required,
      })
    : me
  // The new rank's Max HP joins the arena defence.
  if (victory) await refreshArenaSnapshot(tx, character.id)
  return {
    replay,
    victory,
    targetRank,
    look: { clothing: examinerOf(targetRank).clothing },
    sanninTest: view(after, character, now),
    character: await characterView(tx, character.id),
  }
}

export async function sanninTestRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    requireLevel(character)
    return view(await playerRow(db, character.id), character, new Date())
  })
  app.post('/roll', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, roll),
  )
  app.post('/change-luck', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, changeLuckAction),
  )
  app.post('/perfect', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, perfect),
  )
  app.post('/claim', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, claim),
  )
  app.post('/promote', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) =>
    withCharacter(db, request, promote),
  )
}

export default sanninTestRoutes
