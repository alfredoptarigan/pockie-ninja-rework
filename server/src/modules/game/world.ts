import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characters } from '../../db/schema.js'
import { fightMonster, monsterDrops } from '../../game/combat.js'
import { exploreSpotIds, npc, sceneLinks, sceneSpawns } from '../../game/data.js'
import { rookieHandIns, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { reviveTerms } from './actions.js'
import { characterOf, lockCharacter, requireAlive, requireUser, toCharacter } from './characters.js'
import { RATE_LIMITS } from './rate-limits.js'

const MONSTER_CLASSES = new Set(['NormalNpc', 'TaskBossNpc', 'SnowNpc'])
const MAX_LISTED_MONSTERS = 6
const MAX_LEVEL_ABOVE_PLAYER = 5

const fightSchema = z.object({ monsterId: z.string().regex(/^n\d+$/, 'Unknown monster.') })

/** UI_GostList.as: up to 6 monsters, normal ones hidden when more than 5 levels above. */
export function sceneMonsters(sceneId: number, playerLevel: number) {
  return sceneSpawns(sceneId)
    .flatMap(({ id }) => {
      const row = npc(id)
      if (!row || !MONSTER_CLASSES.has(String(row.class))) return []
      const level = Number(row.Level)
      if (row.class === 'NormalNpc' && level > playerLevel + MAX_LEVEL_ABOVE_PLAYER) return []
      return [{ id, nameKey: `lg_${row.Name}`, level }]
    })
    .slice(0, MAX_LISTED_MONSTERS)
}

/**
 * SceneSystem.SetScenePass: remembers the scene the ninja stands in (ScenesEntered), once.
 * Looking at the scene is what entering it means, so this covers creation and every travel.
 */
export async function recordSceneEntered(db: Db | Tx, characterId: string, sceneId: number) {
  const visited = characters.scenesEntered
  const [row] = await db
    .update(characters)
    .set({
      scenesEntered: sql`case when ${sceneId} = any(${visited}) then ${visited} else array_append(${visited}, ${sceneId}) end`,
    })
    .where(eq(characters.id, characterId))
    .returning({ scenesEntered: visited })
  return row?.scenesEntered ?? [sceneId]
}

export async function worldRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/scene', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const sceneId = character.sceneId
    const visitedScenes = await recordSceneEntered(db, character.id, sceneId)
    return {
      sceneId,
      visitedScenes,
      nameKey: `lg_Scene_BackGround_${sceneId}`,
      monsters: sceneMonsters(sceneId, character.level).map((monster) => ({
        ...monster,
        drops: monsterDrops(monster.id),
      })),
      npcs: sceneSpawns(sceneId)
        .filter(({ id }) => {
          const row = npc(id)
          return row && !MONSTER_CLASSES.has(String(row.class))
        })
        .map(({ id, x, y, scale }) => ({ id, nameKey: `lg_${npc(id)!.Name}`, x, y, scale })),
      exploreSpots: exploreSpotIds(sceneId),
      links: sceneLinks(sceneId),
      revive: reviveTerms(character),
    }
  })

  app.post('/fight', { config: { rateLimit: RATE_LIMITS.fight } }, async (request) => {
    const userId = requireUser(request).id
    const { monsterId } = fightSchema.parse(request.body)

    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, userId)
      if (!sceneMonsters(character.sceneId, character.level).some((m) => m.id === monsterId)) {
        throw new HttpError(400, 'not_here', 'That monster is not in this area.')
      }
      requireAlive(character, 'fight again')

      const result = await fightMonster(tx, character, monsterId)
      // `rewards` already holds the fight's loot, so hand-ins go in `questRewards`.
      // A quest level-up counts as the fight's own, so the result shows it.
      const handIns = await rookieHandIns(tx, character.id)
      const rewards = {
        ...result.rewards,
        levelsGained: result.rewards.levelsGained + handIns.levelsGained,
      }
      const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
      return {
        ...result,
        rewards,
        completed: handIns.completed,
        questRewards: handIns.rewards,
        character: toCharacter(updated!),
      }
    })
  })
}
