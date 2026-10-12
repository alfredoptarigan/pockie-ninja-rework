import { deriveStats } from '@pockie/game-core'
import {
  createCharacterSchema,
  type Character,
  type CharacterStats,
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
import { playerFighter, type PlayerFighter } from '../../game/combat.js'
import { pouchMax } from '../../game/pouch.js'
import type { Tx } from '../../game/progress.js'
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
    hpPouch: row.hpPouch,
    mpPouch: row.mpPouch,
    pouchMax: pouchMax(row.level),
    sceneId: row.sceneId,
  }
}

/** A defeated (0 HP, dead) ninja cannot fight, travel or explore until revived (StateSystem). */
/** The fighter's stats without its fight state (name, HP/MP, skills). */
function statsOf(fighter: PlayerFighter): CharacterStats {
  return {
    strength: fighter.strength,
    agility: fighter.agility,
    stamina: fighter.stamina,
    maxHp: fighter.maxHp,
    maxMp: fighter.maxMp,
    minAttack: fighter.minAttack,
    maxAttack: fighter.maxAttack,
    atkTime: fighter.atkTime,
    defense: fighter.defense,
    dodge: fighter.dodge,
    hit: fighter.hit,
    crit: fighter.crit,
    critAttach: fighter.critAttach,
    parry: fighter.parry,
    pierce: fighter.pierce,
    tough: fighter.tough,
    neglectDefense: fighter.neglectDefense,
    counter: fighter.counter,
    weaponClass: fighter.weaponClass,
  }
}

export function requireAlive(character: Pick<CharacterRow, 'hp'>, action: string) {
  if (character.hp <= 0) {
    throw new HttpError(400, 'no_hp', `You were defeated. Revive before you ${action}.`)
  }
}

export function requireUser(request: FastifyRequest) {
  if (!request.auth) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  return request.auth.user
}

async function findCharacter(db: Tx | Db, userId: string, lock: boolean) {
  const query = db.select().from(characters).where(eq(characters.userId, userId))
  const [row] = lock ? await query.for('update') : await query
  if (!row) throw new HttpError(404, 'no_character', 'Create your ninja first.')
  return row
}

/** The user's character, unlocked: for reads only. */
export const characterOf = (db: Tx | Db, userId: string) => findCharacter(db, userId, false)

/**
 * Locks the user's character row (SELECT ... FOR UPDATE) and returns it. Every mutating game
 * transaction calls this first, before any check or other read: actions on one character then run
 * one at a time, and the character row is always the first lock taken (before inventory or quest
 * rows), so they cannot deadlock each other.
 */
export const lockCharacter = (tx: Tx, userId: string) => findCharacter(tx, userId, true)

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
    const row = await characterOf(db, requireUser(request).id)
    return { character: toCharacter(row), stats: statsOf(await playerFighter(db, row)) }
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
