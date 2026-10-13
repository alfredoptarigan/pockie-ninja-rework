// Team routes under /api/game/team, the presence hooks for the 60 s grace (decision 15) and the
// sweep the coordinator schedules.
import {
  TEAM_GRACE_MS,
  teamOrderSchema,
  teamPromptParamsSchema,
  teamTargetSchema,
  type TeamState,
} from '@pockie/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import { requireUser } from '../game/characters.js'
import { onCharacterOffline, onCharacterOnline } from '../realtime/events.js'
import { boardView, joinBoard, leaveBoard } from './board.js'
import { characterIdOf, notifyTeam, teamOf, teamTransaction, type TeamContext } from './context.js'
import {
  accept,
  apply,
  invite,
  kick,
  leave,
  markOffline,
  markOnline,
  promote,
  promptParties,
  refuse,
  reorder,
  sweepTargets,
  teamState,
} from './lifecycle.js'

const LIMITS = {
  read: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  write: { rateLimit: { max: 60, timeWindow: '1 minute' } },
}

/**
 * Removes members past the grace and expired prompts. The realtime hooks and every team read
 * already do this lazily; the sweep catches teams nobody looks at. Run it every few seconds.
 */
export async function sweepTeams(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - TEAM_GRACE_MS)
  const targets = await db.transaction((tx) => sweepTargets(tx, cutoff, now))
  for (const characterId of targets)
    await teamTransaction(
      db,
      async () => [characterId],
      async () => undefined,
      now,
    )
}

export async function teamRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Presence: one chain per character keeps a quick reconnect from overtaking its disconnect.
  const chains = new Map<string, Promise<void>>()
  const enqueue = (characterId: string, step: () => Promise<unknown>) => {
    const next = (chains.get(characterId) ?? Promise.resolve())
      .then(step)
      .then(() => undefined)
      .catch((error: unknown) => app.log.error(error))
    chains.set(characterId, next)
    void next.finally(() => {
      if (chains.get(characterId) === next) chains.delete(characterId)
    })
  }
  const presence = (online: boolean) => (characterId: string) =>
    enqueue(characterId, () =>
      teamTransaction(
        db,
        async () => [characterId],
        async (ctx) => {
          const mine = teamOf(ctx, characterId)
          if (!mine) return
          if (online) await markOnline(ctx, characterId)
          else {
            await markOffline(ctx.tx, characterId, ctx.now)
            notifyTeam(
              ctx,
              mine.members.map((m) => m.characterId),
              mine.team.id,
            )
          }
        },
      ),
    )
  const unsubscribe = [onCharacterOffline(presence(false)), onCharacterOnline(presence(true))]
  app.addHook('onClose', async () => {
    for (const off of unsubscribe) off()
    await Promise.all(chains.values())
  })

  /** Runs `action` for the logged-in ninja with its team (and `others`' teams) locked. */
  function act<T>(
    request: FastifyRequest,
    others: (tx: TeamContext['tx'], actorId: string) => Promise<string[]> | string[],
    action: (ctx: TeamContext, actorId: string) => Promise<T>,
  ) {
    const userId = requireUser(request).id
    let actorId = ''
    return teamTransaction(
      db,
      async (tx) => {
        actorId = await characterIdOf(tx, userId)
        return [actorId, ...(await others(tx, actorId))]
      },
      (ctx) => action(ctx, actorId),
    )
  }
  const none = () => []
  /** A change followed by the actor's new team state. */
  const change = (
    request: FastifyRequest,
    others: Parameters<typeof act>[1],
    action: (ctx: TeamContext, actorId: string) => Promise<unknown>,
  ) =>
    act(request, others, async (ctx, actorId): Promise<TeamState> => {
      await action(ctx, actorId)
      return teamState(ctx, actorId)
    })

  app.get('/', { config: LIMITS.read }, (request) =>
    act(request, none, (ctx, actorId) => teamState(ctx, actorId)),
  )

  app.post('/invite', { config: LIMITS.write }, (request) => {
    const { characterId } = teamTargetSchema.parse(request.body)
    return act(
      request,
      () => [characterId],
      async (ctx, actorId) => ({
        prompt: await invite(ctx, actorId, characterId),
        ...(await teamState(ctx, actorId)),
      }),
    )
  })

  app.post('/apply', { config: LIMITS.write }, (request) => {
    const { characterId } = teamTargetSchema.parse(request.body)
    return act(
      request,
      () => [characterId],
      async (ctx, actorId) => ({
        prompt: await apply(ctx, actorId, characterId),
        ...(await teamState(ctx, actorId)),
      }),
    )
  })

  app.post('/prompts/:id/accept', { config: LIMITS.write }, (request) => {
    const { id } = teamPromptParamsSchema.parse(request.params)
    return change(
      request,
      (tx, actorId) => promptParties(tx, actorId, id),
      (ctx, actorId) => accept(ctx, actorId, id),
    )
  })

  app.post('/prompts/:id/refuse', { config: LIMITS.write }, (request) => {
    const { id } = teamPromptParamsSchema.parse(request.params)
    return change(
      request,
      (tx, actorId) => promptParties(tx, actorId, id),
      (ctx, actorId) => refuse(ctx, actorId, id),
    )
  })

  app.post('/kick', { config: LIMITS.write }, (request) => {
    const { characterId } = teamTargetSchema.parse(request.body)
    return change(request, none, (ctx, actorId) => kick(ctx, actorId, characterId))
  })

  app.post('/leave', { config: LIMITS.write }, (request) =>
    change(request, none, (ctx, actorId) => leave(ctx, actorId)),
  )

  app.post('/captain', { config: LIMITS.write }, (request) => {
    const { characterId } = teamTargetSchema.parse(request.body)
    return change(request, none, (ctx, actorId) => promote(ctx, actorId, characterId))
  })

  app.post('/order', { config: LIMITS.write }, (request) => {
    const { characterId, direction } = teamOrderSchema.parse(request.body)
    return change(request, none, (ctx, actorId) => reorder(ctx, actorId, characterId, direction))
  })

  app.get('/board', { config: LIMITS.read }, (request) =>
    act(request, none, (ctx, actorId) => boardView(ctx, actorId)),
  )

  app.post('/board/join', { config: LIMITS.write }, (request) =>
    act(request, none, async (ctx, actorId) => {
      await joinBoard(ctx, actorId)
      return boardView(ctx, actorId)
    }),
  )

  app.post('/board/leave', { config: LIMITS.write }, (request) =>
    act(request, none, async (ctx, actorId) => {
      await leaveBoard(ctx, actorId)
      return boardView(ctx, actorId)
    }),
  )
}
