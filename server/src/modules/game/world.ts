import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characters } from '../../db/schema.js'
import { fightMonster } from '../../game/combat.js'
import { exploreSpotIds, npc, sceneLinks, sceneSpawns } from '../../game/data.js'
import { completeReadyRookieQuests, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { requireUser, toCharacter } from './characters.js'

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

export async function worldRoutes(app: FastifyInstance, { db }: { db: Db }) {
  async function characterOf(userId: string, tx: Tx | Db = db) {
    const [row] = await tx.select().from(characters).where(eq(characters.userId, userId))
    if (!row) throw new HttpError(404, 'no_character', 'Create your ninja first.')
    return row
  }

  app.get('/scene', async (request) => {
    const character = await characterOf(requireUser(request).id)
    const sceneId = character.sceneId
    return {
      sceneId,
      nameKey: `lg_Scene_BackGround_${sceneId}`,
      monsters: sceneMonsters(sceneId, character.level),
      npcs: sceneSpawns(sceneId)
        .filter(({ id }) => {
          const row = npc(id)
          return row && !MONSTER_CLASSES.has(String(row.class))
        })
        .map(({ id, x, y, scale }) => ({ id, nameKey: `lg_${npc(id)!.Name}`, x, y, scale })),
      exploreSpots: exploreSpotIds(sceneId),
      links: sceneLinks(sceneId),
    }
  })

  app.post(
    '/fight',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = requireUser(request).id
      const { monsterId } = fightSchema.parse(request.body)

      return db.transaction(async (tx) => {
        const character = await characterOf(userId, tx)
        if (!sceneMonsters(character.sceneId, character.level).some((m) => m.id === monsterId)) {
          throw new HttpError(400, 'not_here', 'That monster is not in this area.')
        }
        if (character.hp <= 0) throw new HttpError(400, 'no_hp', 'Heal before you fight again.')

        const result = await fightMonster(tx, character, monsterId)
        const completed = await completeReadyRookieQuests(tx, character.id)
        const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
        return { ...result, completed, character: toCharacter(updated!) }
      })
    },
  )
}
