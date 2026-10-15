// Akatsuki Invasion (Reborn scene 9400) under /api/game/akatsuki: the hunt state, Zetsu's bait,
// facing a sprung ambush, rematches against beaten pairs and the red outfits. The ambush itself is
// rolled on every won field fight (rollFieldAmbush, called by POST /api/game/fight). Each action
// locks the character row, then the hunter's row.
import { simulateFight } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import {
  akatsukiClaimSchema,
  akatsukiRematchSchema,
  AKATSUKI_RULES,
  type AkatsukiAmbush,
  type AkatsukiClaimResult,
  type AkatsukiFightResult,
  type AkatsukiMember,
  type AkatsukiPairKey,
  type AkatsukiView,
} from '../../../../shared/src/schemas/akatsuki.js'
import type { Db } from '../../db/client.js'
import { akatsukiHunters } from '../../db/schema.js'
import { playerFighter } from '../../game/combat.js'
import { equipmentBonuses, equippedGear } from '../../game/equipment.js'
import type { Tx } from '../../game/progress.js'
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
import { AKATSUKI_PLACEHOLDERS as P } from './config.js'
import {
  ambushChance,
  baitActive,
  huntingPair,
  memberBuild,
  memberStatuses,
  PAIRS,
  pairFighters,
  pairIndex,
  springs,
} from './rules.js'

type HunterRow = typeof akatsukiHunters.$inferSelect

/** The red outfits are bound, like the other event rewards. */
const BOUND = true
const HOUR_MS = 3_600_000

async function hunterRow(tx: Tx | Db, characterId: string) {
  const [row] = await tx
    .select()
    .from(akatsukiHunters)
    .where(eq(akatsukiHunters.characterId, characterId))
  return row
}

/** The hunter's row, created on first use and locked (after the character row). */
async function lockHunter(tx: Tx, characterId: string) {
  await tx.insert(akatsukiHunters).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(akatsukiHunters)
    .where(eq(akatsukiHunters.characterId, characterId))
    .for('update')
  return row!
}

async function saveHunter(tx: Tx, characterId: string, values: Partial<HunterRow>) {
  const [row] = await tx
    .update(akatsukiHunters)
    .set(values)
    .where(eq(akatsukiHunters.characterId, characterId))
    .returning()
  return row!
}

const hunts = (character: Pick<CharacterRow, 'level'>) => P.open && character.level >= P.minLevel

function view(
  row: HunterRow | undefined,
  character: Pick<CharacterRow, 'level'>,
  now: Date,
): AkatsukiView {
  const pairsDefeated = row?.pairsDefeated ?? 0
  const hunting = hunts(character) ? (huntingPair(pairsDefeated)?.key ?? null) : null
  const baitUntil = row?.baitUntil ?? null
  return {
    enabled: P.open,
    minLevel: P.minLevel,
    pairs: PAIRS,
    members: memberStatuses(pairsDefeated),
    pairsDefeated,
    hunting,
    pendingAmbush: hunting && row?.pendingAmbush ? hunting : null,
    ambushChancePercent: ambushChance(baitUntil, now),
    bait: {
      activeUntil: baitActive(baitUntil, now) ? baitUntil!.toISOString() : null,
      usedToday: row?.baitDay === utcDay(now),
    },
    claimed: (row?.claimed ?? []) as AkatsukiMember[],
    redOutfits: Object.fromEntries(
      PAIRS.flatMap((pair) => pair.members).map((member) => [
        member,
        memberBuild(member)!.redOutfit,
      ]),
    ),
  }
}

/**
 * After a won field fight: the hunting pair may spring its ambush (Reborn: the fight result
 * carries `akatsukiAmbush` and the client starts the pair fight). The caller holds the character
 * lock. Returns the ambush, or null.
 */
export async function rollFieldAmbush(
  tx: Tx,
  character: CharacterRow,
  now = new Date(),
): Promise<AkatsukiAmbush | null> {
  if (!hunts(character)) return null
  const row = await lockHunter(tx, character.id)
  const pair = huntingPair(row.pairsDefeated)
  if (!pair || row.pendingAmbush) return null
  if (!springs(randomInt(1_000_000) / 1_000_000, ambushChance(row.baitUntil, now))) return null
  await saveHunter(tx, character.id, { pendingAmbush: true })
  return { pair: pair.key, members: pair.members }
}

/** The ninja (at full strength, like a dungeon boss fight) against both members of `key`. */
async function fightPair(
  tx: Tx,
  character: CharacterRow,
  row: HunterRow,
  key: AkatsukiPairKey,
): Promise<AkatsukiFightResult> {
  const now = new Date()
  const player = await playerFighter(tx, character)
  const gear = equipmentBonuses(await equippedGear(tx, character.id), character)
  const level = Math.max(P.minLevel, character.level)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: pairFighters(key, level, gear),
    seed: newSeed(),
  })
  const won = replay.winner === 'attackers'
  const beatHunter = won && pairIndex(key) === row.pairsDefeated
  const after = await saveHunter(tx, character.id, {
    pendingAmbush: false,
    pairsDefeated: row.pairsDefeated + (beatHunter ? 1 : 0),
  })
  const pair = PAIRS[pairIndex(key)]!
  return {
    replay,
    won,
    pair: key,
    looks: pair.members.map((member) => ({ clothing: memberBuild(member)!.clothing })),
    akatsuki: view(after, character, now),
    character: await characterView(tx, character.id),
  }
}

async function requireHunt(tx: Tx, character: CharacterRow) {
  if (!P.open) throw bad('inactive', 'The hunt is not active.')
  if (character.level < P.minLevel)
    throw bad('too_low', `The Akatsuki only hunt ninjas of level ${P.minLevel} and above.`)
  requireAlive(character, 'fight')
  return lockHunter(tx, character.id)
}

async function faceAmbush(tx: Tx, character: CharacterRow) {
  const row = await requireHunt(tx, character)
  const pair = huntingPair(row.pairsDefeated)
  if (!pair || !row.pendingAmbush) throw bad('no_ambush', 'Nobody is waiting for you right now.')
  return fightPair(tx, character, row, pair.key)
}

async function rematch(tx: Tx, character: CharacterRow, key: AkatsukiPairKey) {
  const row = await requireHunt(tx, character)
  if (pairIndex(key) >= row.pairsDefeated)
    throw bad('not_defeated', 'They find you, not the other way around: keep winning field fights.')
  return fightPair(tx, character, row, key)
}

async function setBait(tx: Tx, character: CharacterRow) {
  const now = new Date()
  const row = await requireHunt(tx, character)
  if (!huntingPair(row.pairsDefeated)) throw bad('no_hunt', 'Nobody is hunting you.')
  if (row.baitDay === utcDay(now)) throw bad('bait_used', 'Bait already used today')
  const after = await saveHunter(tx, character.id, {
    baitDay: utcDay(now),
    baitUntil: new Date(now.getTime() + AKATSUKI_RULES.baitHours * HOUR_MS),
  })
  return { akatsuki: view(after, character, now) }
}

async function claim(
  tx: Tx,
  character: CharacterRow,
  member: AkatsukiMember,
): Promise<AkatsukiClaimResult> {
  const row = await lockHunter(tx, character.id)
  const build = memberBuild(member)
  if (!build) throw bad('no_outfit', 'No red outfit is registered')
  if (memberStatuses(row.pairsDefeated)[member] !== 'defeated')
    throw bad('not_defeated', `Defeat ${build.name} first.`)
  if (row.claimed.includes(member)) throw bad('claimed', 'Red outfit claimed')
  // ponytail: Reborn mails the outfit when the bag is full; our system mail has no attachments.
  const award = { itemId: build.redOutfit, bound: BOUND }
  await requireBagRoom(tx, character.id, [award], {
    message: 'Make room in your bag before you claim the red outfit.',
  })
  await grantItems(tx, character.id, [award])
  const after = await saveHunter(tx, character.id, { claimed: [...row.claimed, member] })
  return {
    itemId: build.redOutfit,
    akatsuki: view(after, character, new Date()),
    character: await characterView(tx, character.id),
  }
}

export async function akatsukiRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    return view(await hunterRow(db, character.id), character, new Date())
  })
  app.post('/bait', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) =>
    withCharacter(db, request, setBait),
  )
  app.post('/ambush', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) =>
    withCharacter(db, request, faceAmbush),
  )
  app.post('/rematch', { config: { rateLimit: RATE_LIMITS.gateFight } }, async (request) => {
    const { pair } = akatsukiRematchSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => rematch(tx, character, pair))
  })
  app.post('/claim', { config: { rateLimit: RATE_LIMITS.gates } }, async (request) => {
    const { member } = akatsukiClaimSchema.parse(request.body)
    return withCharacter(db, request, (tx, character) => claim(tx, character, member))
  })
}

export default akatsukiRoutes
