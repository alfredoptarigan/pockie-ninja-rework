// Clans: /api/game/clans (shared/src/schemas/clans.ts). Every write runs in one transaction with
// the locks of clans.ts and answers with the fresh clan and character; notices go out after commit.
import {
  clanCreateSchema,
  clanDonateSchema,
  clanListQuerySchema,
  clanMemberRefSchema,
  clanNoticeSchema,
  clanRefSchema,
  clanSetRoleSchema,
  clanWithdrawSchema,
  type ClanActionResult,
} from '@pockie/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import { deliver, type Outbox } from '../social/players.js'
import {
  acceptApplication,
  applicationsView,
  applyToClan,
  clanView,
  createClan,
  createInfo,
  donate,
  kick,
  leave,
  listClans,
  lockClanOf,
  rejectApplication,
  setNotice,
  setRole,
  withdraw,
  withdrawTargets,
  type ClanContext,
} from './clans.js'

// Per route and IP (@fastify/rate-limit).
const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } })
const READ = perMinute(120)
const WRITE = perMinute(30)
const CREATE = perMinute(10)

export async function clanRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const me = (request: FastifyRequest) => characterOf(db, requireUser(request).id)

  /** Runs `action` in a transaction, then answers with the clan and character as committed. */
  const act = async (
    request: FastifyRequest,
    action: (tx: Tx, callerId: string) => Promise<Outbox | void>,
  ): Promise<ClanActionResult> => {
    const callerId = (await me(request)).id
    const result = await db.transaction(async (tx) => {
      const outbox = (await action(tx, callerId)) ?? []
      const [row] = await tx.select().from(characters).where(eq(characters.id, callerId))
      return { outbox, clan: await clanView(tx, callerId), character: toCharacter(row!) }
    })
    deliver(result.outbox)
    return { clan: result.clan, character: result.character }
  }
  /** `act` with the caller's clan locked (see lockClanOf for `others`). */
  const inClan = (
    request: FastifyRequest,
    fn: (ctx: ClanContext) => Promise<void>,
    others?: (tx: Tx, callerId: string, clanId: string) => Promise<string[]> | string[],
  ) =>
    act(request, async (tx, callerId) => {
      const ctx = await lockClanOf(tx, callerId, (clanId) => others?.(tx, callerId, clanId) ?? [])
      await fn(ctx)
      return ctx.outbox
    })

  app.get('/', { config: READ }, async (request) => {
    const query = clanListQuerySchema.parse(request.query)
    return listClans(db, (await me(request)).id, query)
  })
  app.get('/me', { config: READ }, async (request) => ({
    clan: await clanView(db, (await me(request)).id),
  }))
  app.get('/create-info', { config: READ }, async (request) => createInfo(db, await me(request)))
  app.get('/applications', { config: READ }, async (request) =>
    applicationsView(db, (await me(request)).id),
  )

  app.post('/create', { config: CREATE }, (request) => {
    const { name } = clanCreateSchema.parse(request.body)
    return act(request, async (tx) =>
      createClan(tx, await lockCharacter(tx, requireUser(request).id), name),
    )
  })
  app.post('/apply', { config: WRITE }, (request) => {
    const { clanId } = clanRefSchema.parse(request.body)
    return act(request, async (tx) =>
      applyToClan(tx, await lockCharacter(tx, requireUser(request).id), clanId),
    )
  })
  app.post('/applications/accept', { config: WRITE }, (request) => {
    const { characterId } = clanMemberRefSchema.parse(request.body)
    return inClan(
      request,
      (ctx) => acceptApplication(ctx, characterId),
      () => [characterId],
    )
  })
  app.post('/applications/reject', { config: WRITE }, (request) => {
    const { characterId } = clanMemberRefSchema.parse(request.body)
    return inClan(request, (ctx) => rejectApplication(ctx, characterId))
  })
  app.post('/notice', { config: WRITE }, (request) => {
    const { notice } = clanNoticeSchema.parse(request.body)
    return inClan(request, (ctx) => setNotice(ctx, notice))
  })
  app.post('/role', { config: WRITE }, (request) => {
    const { characterId, role } = clanSetRoleSchema.parse(request.body)
    return inClan(request, (ctx) => setRole(ctx, characterId, role))
  })
  app.post('/kick', { config: WRITE }, (request) => {
    const { characterId } = clanMemberRefSchema.parse(request.body)
    return inClan(request, (ctx) => kick(ctx, characterId))
  })
  app.post('/leave', { config: WRITE }, (request) => inClan(request, leave))
  app.post('/donate', { config: WRITE }, (request) => {
    const { currency, amount } = clanDonateSchema.parse(request.body)
    return inClan(request, (ctx) => donate(ctx, currency, amount))
  })
  app.post('/withdraw', { config: WRITE }, (request) => {
    const input = clanWithdrawSchema.parse(request.body)
    return inClan(
      request,
      (ctx) => withdraw(ctx, input),
      (tx, callerId, clanId) => withdrawTargets(input, callerId, clanId, tx),
    )
  })
}
