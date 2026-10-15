// Clan Missions under /api/game/clan-events/missions (Reborn: clanMissionsInit,
// clanMissionsStartBattle, clanMissionsCancelScheduled, clanMissionsAttackBoss,
// clanMissionsExtendTime). Writes lock the character, then the clan (lockClanOf); every request
// first settles an escaped boss in its own transaction.
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  clanMissionStartSchema,
  type ClanMissionAttackResult,
  type ClanMissionsResult,
  type ClanMissionsView,
} from '../../../../shared/src/schemas/clan-activities.js'
import type { Db } from '../../db/client.js'
import { clanMembers } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { lockClanOf, type ClanContext } from '../clans/clans.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { characterView } from '../gates/common.js'
import {
  attackBoss,
  cancelScheduled,
  extendBoss,
  missionsView,
  readMissions,
  settleClan,
  startBoss,
} from './missions.js'

async function membership(db: Db | Tx, characterId: string) {
  const [row] = await db.select().from(clanMembers).where(eq(clanMembers.characterId, characterId))
  if (!row) throw new HttpError(404, 'no_clan', 'You are not in a clan.')
  return row
}

const view = async (db: Db | Tx, characterId: string, now = new Date()) => {
  const member = await membership(db, characterId)
  return missionsView(await readMissions(db, member.clanId), characterId, member.role, now)
}

export async function clanMissionRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const callerId = async (request: FastifyRequest) =>
    (await characterOf(db, requireUser(request).id)).id

  const act = async <R extends object>(
    request: FastifyRequest,
    fn: (ctx: ClanContext, now: Date) => Promise<R | void>,
  ) => {
    const id = await callerId(request)
    await settleClan(db, (await membership(db, id)).clanId)
    return db.transaction(async (tx): Promise<ClanMissionsResult & Partial<R>> => {
      const now = new Date()
      const result = await fn(await lockClanOf(tx, id), now)
      return {
        ...(result ?? {}),
        missions: await view(tx, id, now),
        character: await characterView(tx, id),
      } as ClanMissionsResult & Partial<R>
    })
  }

  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const id = await callerId(request)
    await settleClan(db, (await membership(db, id)).clanId)
    const missions: ClanMissionsView = await view(db, id)
    return missions
  })

  app.post('/start', { config: { rateLimit: RATE_LIMITS.item } }, (request) => {
    const { bossIndex, delayHours } = clanMissionStartSchema.parse(request.body)
    return act(request, (ctx, now) => startBoss(ctx, bossIndex, delayHours, now))
  })

  app.post('/cancel', { config: { rateLimit: RATE_LIMITS.item } }, (request) =>
    act(request, cancelScheduled),
  )

  app.post(
    '/attack',
    { config: { rateLimit: RATE_LIMITS.fight } },
    async (request) => (await act(request, attackBoss)) as ClanMissionAttackResult,
  )

  app.post('/extend', { config: { rateLimit: RATE_LIMITS.item } }, (request) =>
    act(request, extendBoss),
  )
}

export default clanMissionRoutes
