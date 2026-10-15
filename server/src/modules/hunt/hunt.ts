// Hunt (Reborn's Arena NPC "Hunt Monsters": `huntBegin`, `huntComplete`, push `huntInfo`): the NPC
// names three field monsters; killing each in an ordinary field fight (or a chain attack) ticks it
// off, and Finish Hunt at the Arena NPC pays "more arena tickets" (used arena challenges back).
import { createRandom, type Random } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import {
  HUNT_PLACEHOLDERS,
  HUNT_RULES,
  type HuntCompleteResult,
  type HuntView,
} from '../../../../shared/src/schemas/hunt.js'
import type { Db } from '../../db/client.js'
import { arenaPlayers, hunts } from '../../db/schema.js'
import { npc, sceneSpawns } from '../../game/data.js'
import { loadQuests, type Tx } from '../../game/progress.js'
import type { QuestProgress } from '../../game/quests.js'
import { npcMenu } from '../game/field-data.js'
import { travelRefusal } from '../game/travel.js'
import { sceneMonsters } from '../game/world.js'
import { bad, characterView, newSeed, utcDay, type CharacterRow } from '../gates/common.js'

type HuntRow = typeof hunts.$inferSelect

const huntsToday = (row: HuntRow | undefined, now: Date) =>
  row?.day === utcDay(now) ? row.huntsDone : 0

export function huntView(row: HuntRow | undefined, now = new Date()): HuntView {
  return {
    monsters: (row?.targets ?? []).map((id, i) => ({
      id,
      nameKey: `lg_${npc(id)?.Name ?? id}`,
      level: Number(npc(id)?.Level ?? 0),
      sceneId: row!.targetScenes[i] ?? 0,
      killed: row!.killed[i] ?? false,
    })),
    huntsToday: huntsToday(row, now),
    huntsPerDay: HUNT_PLACEHOLDERS.huntsPerDay,
    arenaTries: HUNT_PLACEHOLDERS.arenaTries,
  }
}

export async function huntRow(db: Tx | Db, characterId: string) {
  const [row] = await db.select().from(hunts).where(eq(hunts.characterId, characterId))
  return row
}

async function lockHunt(tx: Tx, characterId: string) {
  await tx.insert(hunts).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(hunts)
    .where(eq(hunts.characterId, characterId))
    .for('update')
  return row!
}

/** Hunt Monsters is on the Arena NPC (arenaNpc.js), who stands in each village. */
function requireArenaNpc(character: CharacterRow) {
  if (!sceneSpawns(character.sceneId).some((spawn) => npcMenu(spawn.id) === 'arena'))
    throw bad('not_here', 'Talk to the Arena NPC in a village to hunt monsters.')
}

/**
 * Field monsters in areas the ninja has entered and can reach by the world map (fields stay
 * closed on the map until visited, decision 7): normal monsters from `levelsBelow` levels under
 * the ninja up to its level, each with one scene it spawns in. With fewer than three, every such
 * monster up to the ninja's level counts.
 */
export function huntCandidates(character: CharacterRow, quests: QuestProgress[]) {
  const scenes = [...new Set([character.sceneId, ...character.scenesEntered])].filter(
    (sceneId) => sceneId === character.sceneId || !travelRefusal(character, quests, sceneId, 'map'),
  )
  const reachable = new Map<string, { sceneId: number; level: number }>()
  for (const sceneId of scenes) {
    for (const monster of sceneMonsters(sceneId, character.level, quests)) {
      if (npc(monster.id)?.class !== 'NormalNpc' || monster.level > character.level) continue
      if (!reachable.has(monster.id)) reachable.set(monster.id, { sceneId, level: monster.level })
    }
  }
  const all = [...reachable].map(([id, at]) => ({ id, ...at }))
  const near = all.filter((m) => m.level >= character.level - HUNT_PLACEHOLDERS.levelsBelow)
  return near.length >= HUNT_RULES.monsters ? near : all
}

export function pickTargets(candidates: { id: string; sceneId: number }[], random: Random) {
  const pool = [...candidates]
  return Array.from(
    { length: Math.min(HUNT_RULES.monsters, pool.length) },
    () => pool.splice(random.int(pool.length), 1)[0]!,
  )
}

export async function beginHunt(tx: Tx, character: CharacterRow) {
  requireArenaNpc(character)
  const now = new Date()
  const row = await lockHunt(tx, character.id)
  if (row.targets.length > 0)
    throw bad('hunt_running', 'You are already on a hunt. Finish it first.')
  if (huntsToday(row, now) >= HUNT_PLACEHOLDERS.huntsPerDay)
    throw bad('no_hunts', 'You have finished all of today’s hunts. Come back tomorrow.')
  const targets = pickTargets(
    huntCandidates(character, await loadQuests(tx, character.id)),
    createRandom(newSeed()),
  )
  if (targets.length === 0) throw bad('no_monsters', 'There are no monsters for you to hunt.')
  const [after] = await tx
    .update(hunts)
    .set({
      targets: targets.map((t) => t.id),
      targetScenes: targets.map((t) => t.sceneId),
      killed: targets.map(() => false),
    })
    .where(eq(hunts.characterId, character.id))
    .returning()
  return { hunt: huntView(after, now) }
}

/** A won field fight against `monsterId`: ticks off the first hunted one not killed yet. */
export async function recordHuntKill(tx: Tx, characterId: string, monsterId: string) {
  const [row] = await tx
    .select()
    .from(hunts)
    .where(eq(hunts.characterId, characterId))
    .for('update')
  const index = row?.targets.findIndex((id, i) => id === monsterId && !row.killed[i]) ?? -1
  if (index < 0) return
  await tx
    .update(hunts)
    .set({ killed: row!.killed.map((killed, i) => killed || i === index) })
    .where(eq(hunts.characterId, characterId))
}

export async function completeHunt(tx: Tx, character: CharacterRow): Promise<HuntCompleteResult> {
  requireArenaNpc(character)
  const now = new Date()
  const today = utcDay(now)
  const row = await lockHunt(tx, character.id)
  if (row.targets.length === 0) throw bad('no_hunt', 'You are not on a hunt.')
  if (row.killed.some((killed) => !killed))
    throw bad('hunt_unfinished', 'Defeat every hunted monster first.')
  // Today's used free arena challenges come back (the counters reset each UTC day).
  const [arena] = await tx
    .select()
    .from(arenaPlayers)
    .where(eq(arenaPlayers.characterId, character.id))
    .for('update')
  const restored =
    arena?.day === today ? Math.min(HUNT_PLACEHOLDERS.arenaTries, arena.triesUsed) : 0
  if (restored > 0)
    await tx
      .update(arenaPlayers)
      .set({ triesUsed: arena!.triesUsed - restored })
      .where(eq(arenaPlayers.characterId, character.id))
  const [after] = await tx
    .update(hunts)
    .set({
      targets: [],
      targetScenes: [],
      killed: [],
      day: today,
      huntsDone: huntsToday(row, now) + 1,
    })
    .where(eq(hunts.characterId, character.id))
    .returning()
  return {
    hunt: huntView(after, now),
    arenaTriesRestored: restored,
    character: await characterView(tx, character.id),
  }
}
