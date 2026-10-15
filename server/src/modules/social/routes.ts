// Friends, Blocked list, mail and mail reports: /api/game/social.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client.js'
import type { Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import {
  blockAddSchema,
  characterRefSchema,
  friendAddBackSchema,
  friendAddSchema,
  mailDeleteReadSchema,
  mailDeleteSchema,
  mailListSchema,
  mailRefSchema,
  mailSendSchema,
} from '../../../../shared/src/schemas/social.js'
import {
  addFriend,
  block,
  blockedView,
  declineAddBack,
  friendsView,
  playerView,
  removeFriend,
  scenePlayersView,
  unblock,
} from './friends.js'
import {
  deleteMails,
  deleteReadMails,
  mailList,
  mailSummary,
  readMail,
  reportMail,
  sendPlayerMail,
} from './mail.js'
import {
  characterById,
  characterByName,
  deliver,
  lockPair,
  type CharacterRow,
  type Outbox,
} from './players.js'

export { isBlocked } from './players.js'
export { MAIL_PURGE_INTERVAL_MS, purgeExpiredMail } from './mail.js'

// Per route and IP (@fastify/rate-limit); the per-ninja mail limits live in sendPlayerMail.
const perMinute = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } })
const READ = perMinute(120)
const WRITE = perMinute(30)

export async function socialRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const me = (request: FastifyRequest) => characterOf(db, requireUser(request).id)

  /** Runs `fn` with both characters locked in id order, then pushes its notices. */
  const withPair = async (
    request: FastifyRequest,
    find: (tx: Tx) => Promise<CharacterRow>,
    fn: (tx: Tx, me: CharacterRow, them: CharacterRow) => Promise<Outbox | void>,
  ) => {
    const userId = requireUser(request).id
    const outbox = await db.transaction(async (tx) => {
      const self = await characterOf(tx, userId)
      const target = await find(tx)
      if (target.id === self.id) return (await fn(tx, self, self)) ?? []
      const [locked, them] = await lockPair(tx, self.id, target.id)
      return (await fn(tx, locked, them)) ?? []
    })
    deliver(outbox)
    return characterOf(db, userId)
  }

  app.get('/friends', { config: READ }, async (request) => friendsView(db, (await me(request)).id))

  app.post('/friends/add', { config: WRITE }, async (request) => {
    const { name } = friendAddSchema.parse(request.body)
    const self = await withPair(request, (tx) => characterByName(tx, name), addFriend)
    return friendsView(db, self.id)
  })

  app.post('/friends/add-back', { config: WRITE }, async (request) => {
    const { characterId, accept } = friendAddBackSchema.parse(request.body)
    const self = await withPair(
      request,
      (tx) => characterById(tx, characterId),
      accept ? addFriend : declineAddBack,
    )
    return friendsView(db, self.id)
  })

  app.post('/friends/remove', { config: WRITE }, async (request) => {
    const { characterId } = characterRefSchema.parse(request.body)
    const self = await withPair(request, (tx) => characterById(tx, characterId), removeFriend)
    return friendsView(db, self.id)
  })

  app.get('/scene-players', { config: READ }, async (request) =>
    scenePlayersView(db, await me(request)),
  )

  app.get('/players/:characterId', { config: READ }, async (request) => {
    const { characterId } = characterRefSchema.parse(request.params)
    return playerView(db, characterId, (await me(request)).id)
  })

  app.get('/blocks', { config: READ }, async (request) => blockedView(db, (await me(request)).id))

  app.post('/blocks/add', { config: WRITE }, async (request) => {
    const input = blockAddSchema.parse(request.body)
    const self = await withPair(
      request,
      (tx) =>
        'name' in input ? characterByName(tx, input.name) : characterById(tx, input.characterId),
      block,
    )
    return blockedView(db, self.id)
  })

  app.post('/blocks/remove', { config: WRITE }, async (request) => {
    const { characterId } = characterRefSchema.parse(request.body)
    const self = await me(request)
    await db.transaction((tx) => unblock(tx, self.id, characterId))
    return blockedView(db, self.id)
  })

  app.get('/mail/summary', { config: READ }, async (request) =>
    mailSummary(db, (await me(request)).id),
  )

  app.get('/mail', { config: READ }, async (request) => {
    const { category } = mailListSchema.parse(request.query)
    return mailList(db, (await me(request)).id, category)
  })

  app.post('/mail/send', { config: WRITE }, async (request) => {
    const { to, subject, body } = mailSendSchema.parse(request.body)
    await withPair(
      request,
      (tx) => characterByName(tx, to),
      (tx, self, them) => sendPlayerMail(tx, self, them, subject, body),
    )
    return { ok: true }
  })

  app.post('/mail/read', { config: READ }, async (request) => {
    const { id } = mailRefSchema.parse(request.body)
    await readMail(db, (await me(request)).id, id)
    return { ok: true }
  })

  app.post('/mail/delete', { config: WRITE }, async (request) => {
    const { ids } = mailDeleteSchema.parse(request.body)
    return deleteMails(db, (await me(request)).id, ids)
  })

  app.post('/mail/delete-read', { config: WRITE }, async (request) => {
    const { category } = mailDeleteReadSchema.parse(request.body)
    return deleteReadMails(db, (await me(request)).id, category)
  })

  app.post('/mail/report', { config: WRITE }, async (request) => {
    const { id } = mailRefSchema.parse(request.body)
    await reportMail(db, (await me(request)).id, id)
    return { ok: true }
  })
}
