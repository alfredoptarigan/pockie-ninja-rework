// Scroll Dungeons (Reborn chunk 54): 3 of 11 bosses a day, 25 attempts a day shared by them,
// scroll drops with a pity bonus per boss. Attempts and bosses reset at 00:00 UTC, our daily
// reset (Reborn: midnight Europe/Lisbon). Each fight locks the character row, then the ninja's row.
import { createRandom, simulateFight } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  DUNGEON_RULES,
  dungeonFightSchema,
  type DungeonFightResult,
  type DungeonsView,
} from '../../../../shared/src/schemas/dungeons.js'
import type { Db } from '../../db/client.js'
import { dungeonPlayers } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { equipmentBonuses, equippedGear } from '../../game/equipment.js'
import type { Tx } from '../../game/progress.js'
import { nextDay } from '../events/view.js'
import { characterOf, requireAlive, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import {
  bad,
  characterView,
  grantItems,
  newSeed,
  requireBagRoom,
  utcDay,
  withCharacter,
  type CharacterRow,
} from '../gates/common.js'
import { requireBattleFree } from '../hunt/guard.js'
import { BOSSES, bossDrops, bossFighter, bossLevel } from './bosses.js'
import { rollDrops, todaysBosses } from './rules.js'

type PlayerRow = typeof dungeonPlayers.$inferSelect

/** Scrolls are bound, like the other event rewards. */
const BOUND = true

const attemptsUsed = (row: PlayerRow | undefined, now: Date) =>
  row?.attemptDay === utcDay(now) ? row.attemptsUsed : 0

async function playerRow(tx: Tx | Db, characterId: string) {
  const [row] = await tx
    .select()
    .from(dungeonPlayers)
    .where(eq(dungeonPlayers.characterId, characterId))
  return row
}

/** The ninja's row, created on first fight and locked (after the character row). */
async function lockPlayer(tx: Tx, characterId: string) {
  await tx.insert(dungeonPlayers).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(dungeonPlayers)
    .where(eq(dungeonPlayers.characterId, characterId))
    .for('update')
  return row!
}

function view(row: PlayerRow | undefined, now: Date): DungeonsView {
  const resetAt = nextDay(now)
  return {
    activeBosses: todaysBosses(utcDay(now)),
    bosses: BOSSES.map((boss) => ({
      index: boss.index,
      name: boss.name,
      build: boss.build,
      pose: boss.pose,
      drops: bossDrops(boss),
      pity: (row?.pity[boss.index] ?? 0) * DUNGEON_RULES.pityStep,
    })),
    attemptsRemaining: DUNGEON_RULES.maxAttempts - attemptsUsed(row, now),
    maxAttempts: DUNGEON_RULES.maxAttempts,
    resetAt,
    nextRotation: resetAt,
  }
}

async function fight(tx: Tx, character: CharacterRow, index: number) {
  const now = new Date()
  if (character.level < DUNGEON_RULES.minLevel)
    throw bad('too_low', 'You must be level 45 or higher to challenge dungeon bosses.')
  if (!todaysBosses(utcDay(now)).includes(index))
    throw bad('not_today', 'That boss is not in today’s rotation.')
  requireAlive(character, 'fight')
  await requireBattleFree(tx, character.id)
  const me = await lockPlayer(tx, character.id)
  const used = attemptsUsed(me, now)
  if (used >= DUNGEON_RULES.maxAttempts)
    throw bad('no_attempts', 'You have used all of today’s dungeon attempts.')
  const boss = BOSSES[index]!
  const drops = bossDrops(boss)
  // Room for every scroll the boss can drop, so a win never loses one.
  await requireBagRoom(
    tx,
    character.id,
    drops.flatMap((drop) =>
      [drop.itemId, drop.permanentItemId].map((itemId) => ({ itemId, bound: BOUND })),
    ),
    { message: 'Make room in your bag before you challenge a dungeon boss.' },
  )
  // Like the Tailed Beast, a boss fight costs no HP or MP: the ninja enters at full strength.
  const player = await playerFighter(tx, character)
  const gear = equipmentBonuses(await equippedGear(tx, character.id), character)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [bossFighter(boss, bossLevel(character.level), gear)],
    seed: newSeed(),
  })
  const won = replay.winner === 'attackers'
  const roll = won ? rollDrops(drops, me.pity[index] ?? 0, createRandom(newSeed())) : null
  if (roll)
    await grantItems(
      tx,
      character.id,
      roll.items.map((itemId) => ({ itemId, bound: BOUND })),
    )
  const [after] = await tx
    .update(dungeonPlayers)
    .set({
      attemptDay: utcDay(now),
      attemptsUsed: used + 1,
      pity: me.pity.map((steps, i) => (roll && i === index ? roll.pity : steps)),
    })
    .where(eq(dungeonPlayers.characterId, character.id))
    .returning()
  const result: DungeonFightResult = {
    replay,
    won,
    look: { clothing: boss.clothing },
    drops: (roll?.items ?? []).map((itemId) => ({ itemId })),
    dungeons: view(after, now),
    character: await characterView(tx, character.id),
  }
  return result
}

export async function dungeonRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return view(await playerRow(db, character.id), new Date())
  })
  app.post('/fight', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { index } = dungeonFightSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => fight(tx, character, index))
  })
}

export default dungeonRoutes
