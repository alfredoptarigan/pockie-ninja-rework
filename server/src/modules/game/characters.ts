import { deriveStats } from '@pockie/game-core'
import {
  createCharacterSchema,
  type Character,
  type CreationOptions,
  type Nation,
} from '@pockie/shared'
import { count, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { characterQuests, characters } from '../../db/schema.js'
import {
  avatarIdForClothing,
  avatarStats,
  creationOutfits,
  FIRST_TUTORIAL_TASK,
  nationScenes,
  subTasks,
} from '../../game/data.js'
import { HttpError } from '../../http.js'
import { RATE_LIMITS } from './rate-limits.js'

const NATIONS: Nation[] = [0, 1, 2, 3, 4]
const NAME_TAKEN = 'That ninja name is already taken.'

type CharacterRow = typeof characters.$inferSelect

export function toCharacter(row: CharacterRow): Character {
  const stats = deriveStats(avatarStats(row.avatarId), row.level)
  return {
    id: row.id,
    name: row.name,
    gender: row.gender as 0 | 1,
    nation: row.nation as Nation,
    clothing: row.clothing,
    avatarId: row.avatarId,
    level: row.level,
    exp: row.exp,
    stone: row.stone,
    gold: row.gold,
    giftCoupon: row.giftCoupon,
    honor: row.honor,
    hp: row.hp,
    mp: row.mp,
    maxHp: stats.maxHp,
    maxMp: stats.maxMp,
    sceneId: row.sceneId,
  }
}

/** A defeated (0 HP, dead) ninja cannot fight, travel or explore until revived (StateSystem). */
export function requireAlive(character: Pick<CharacterRow, 'hp'>, action: string) {
  if (character.hp <= 0) {
    throw new HttpError(400, 'no_hp', `You were defeated. Revive before you ${action}.`)
  }
}

export function requireUser(request: FastifyRequest) {
  if (!request.auth) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  return request.auth.user
}

async function suggestedNation(db: Db): Promise<Nation> {
  const rows = await db
    .select({ nation: characters.nation, total: count() })
    .from(characters)
    .groupBy(characters.nation)
  const totals = new Map(rows.map((row) => [row.nation, row.total]))
  // The original client pre-selects the least-populated village; ties go to the lowest nation.
  return NATIONS.reduce((best, nation) =>
    (totals.get(nation) ?? 0) < (totals.get(best) ?? 0) ? nation : best,
  )
}

function constraintOf(error: unknown) {
  const pg = (error as { cause?: { code?: string; constraint_name?: string } }).cause
  return pg?.code === '23505' ? pg.constraint_name : undefined
}

export async function characterRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get(
    '/creation',
    { config: { rateLimit: RATE_LIMITS.read } },
    async (request): Promise<CreationOptions> => {
      requireUser(request)
      const scenes = nationScenes()
      return {
        outfits: creationOutfits(),
        villages: NATIONS.map((nation) => ({ nation, sceneId: scenes[nation]!.castle })),
        suggestedNation: await suggestedNation(db),
      }
    },
  )

  app.get('/character', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const user = requireUser(request)
    const [row] = await db.select().from(characters).where(eq(characters.userId, user.id))
    if (!row) throw new HttpError(404, 'no_character', 'Create your ninja first.')
    return { character: toCharacter(row) }
  })

  app.post(
    '/characters',
    { config: { rateLimit: RATE_LIMITS.createCharacter } },
    async (request, reply) => {
      const user = requireUser(request)
      const input = createCharacterSchema.parse(request.body)

      const outfit = creationOutfits().find((o) => o.clothing === input.clothing)
      if (!outfit || outfit.gender !== input.gender) {
        throw new HttpError(400, 'validation', 'Please check the highlighted fields.', {
          clothing: 'Choose one of the starting outfits.',
        })
      }

      const avatarId = avatarIdForClothing(input.clothing)
      const stats = deriveStats(avatarStats(avatarId), 1)
      const sceneId = nationScenes()[input.nation]!.login
      const firstTask = FIRST_TUTORIAL_TASK[input.nation]!

      const row = await db
        .transaction(async (tx) => {
          const [created] = await tx
            .insert(characters)
            .values({
              userId: user.id,
              name: input.name,
              gender: input.gender,
              nation: input.nation,
              clothing: input.clothing,
              avatarId,
              hp: stats.maxHp,
              mp: stats.maxMp,
              sceneId,
            })
            .returning()
          await tx.insert(characterQuests).values({
            characterId: created!.id,
            taskId: firstTask,
            progress: subTasks(firstTask).map(() => 0),
          })
          return created!
        })
        .catch((error: unknown) => {
          const constraint = constraintOf(error)
          if (constraint === 'characters_name_lower_key') {
            throw new HttpError(409, 'conflict', NAME_TAKEN, { name: NAME_TAKEN })
          }
          if (constraint === 'characters_user_id_key') {
            throw new HttpError(409, 'conflict', 'You already have a ninja.')
          }
          throw error
        })

      return reply.code(201).send({ character: toCharacter(row) })
    },
  )
}
