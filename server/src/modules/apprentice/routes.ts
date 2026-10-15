// Master and Apprentice under /api/game/apprentice (rules in game-core/src/social/apprentice.ts).
// A request goes to an online ninja by name and waits 60 s; accepting binds the two. Either side
// can end the bond, and once the apprentice reaches the graduation level either side graduates
// them: the bond ends and both get their reward. Bond changes lock both characters in id order.
import type { Notice } from '@pockie/shared'
import { and, eq, or } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { CURRENCY_CAP } from '../../../../game-core/src/economy/market.js'
import {
  APPRENTICE_CONFIG,
  canGraduate,
  LEVEL_RULE,
  senderRole,
} from '../../../../game-core/src/social/apprentice.js'
import {
  apprenticePartnerSchema,
  apprenticeRequestIdSchema,
  apprenticeRequestSchema,
  type ApprenticeMember,
  type ApprenticeState,
} from '../../../../shared/src/schemas/apprentice.js'
import type { Db } from '../../db/client.js'
import { apprenticeships, characters } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { reloadCharacter } from '../game/actions.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { notifyCharacter } from '../realtime/events.js'
import {
  characterByName,
  isBlocked,
  isOnline,
  lockPair,
  type CharacterRow,
} from '../social/players.js'
import { createRequestBook, type ApprenticeRequest } from './requests.js'

const bad = (code: string, message: string, status = 400) => new HttpError(status, code, message)
const LIMITS = {
  read: { config: { rateLimit: RATE_LIMITS.read } },
  write: { config: { rateLimit: RATE_LIMITS.item } },
}
const { graduateLevel, maxApprentices, rewards } = APPRENTICE_CONFIG

/** Pushes an apprentice notice; never throws into the request (the state is already changed). */
function tell(characterId: string, message?: string, rewarded?: boolean) {
  const notice: Notice = {
    kind: 'apprentice',
    ...(message && { message }),
    ...(rewarded && { rewarded }),
  }
  notifyCharacter(characterId, notice)
}

const member = (row: CharacterRow, graduates: boolean): ApprenticeMember => ({
  characterId: row.id,
  name: row.name,
  level: row.level,
  online: isOnline(row.id),
  canGraduate: graduates && canGraduate(row.level),
})

async function masterIdOf(db: Tx | Db, apprenticeId: string) {
  const [row] = await db
    .select({ masterId: apprenticeships.masterId })
    .from(apprenticeships)
    .where(eq(apprenticeships.apprenticeId, apprenticeId))
  return row?.masterId ?? null
}

/** Checks the bond `master` -> `apprentice` can start; fresh (locked) rows on accept. */
async function requireFree(db: Tx | Db, master: CharacterRow, apprentice: CharacterRow) {
  if (await masterIdOf(db, apprentice.id))
    throw bad('has_master', `${apprentice.name} already has a master.`)
  const taught = await db
    .select({ id: apprenticeships.apprenticeId })
    .from(apprenticeships)
    .where(eq(apprenticeships.masterId, master.id))
  if (taught.length >= maxApprentices)
    throw bad('master_full', `${master.name} already teaches ${maxApprentices} apprentices.`)
}

/** The bond between me and `otherId` (either way), or 404. */
async function bondOf(tx: Tx, meId: string, otherId: string) {
  const [bond] = await tx
    .select()
    .from(apprenticeships)
    .where(
      or(
        and(eq(apprenticeships.masterId, meId), eq(apprenticeships.apprenticeId, otherId)),
        and(eq(apprenticeships.masterId, otherId), eq(apprenticeships.apprenticeId, meId)),
      ),
    )
  if (!bond) throw bad('no_bond', 'You are not master and apprentice.', 404)
  return bond
}

const addStone = (tx: Tx, row: CharacterRow, stone: number) =>
  tx
    .update(characters)
    .set({ stone: Math.min(CURRENCY_CAP, row.stone + stone) })
    .where(eq(characters.id, row.id))

export default async function apprenticeRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const book = createRequestBook()
  const now = () => Date.now()
  const me = (request: FastifyRequest) => characterOf(db, requireUser(request).id)

  async function stateOf(characterId: string): Promise<ApprenticeState> {
    const masterId = await masterIdOf(db, characterId)
    const [master] = masterId
      ? await db.select().from(characters).where(eq(characters.id, masterId))
      : []
    const [self] = await db.select().from(characters).where(eq(characters.id, characterId))
    const taught = await db
      .select({ row: characters })
      .from(apprenticeships)
      .innerJoin(characters, eq(characters.id, apprenticeships.apprenticeId))
      .where(eq(apprenticeships.masterId, characterId))
      .orderBy(apprenticeships.createdAt)
    return {
      // My master's row offers Graduate when I reached the level.
      master: master ? { ...member(master, false), canGraduate: canGraduate(self!.level) } : null,
      apprentices: taught.map(({ row }) => member(row, true)),
      ...book.state(characterId, now()),
    }
  }

  app.get('/', LIMITS.read, async (request) => stateOf((await me(request)).id))

  app.post('/request', LIMITS.write, async (request) => {
    const { name } = apprenticeRequestSchema.parse(request.body)
    const from = await me(request)
    const to = await characterByName(db, name)
    if (to.id === from.id) throw bad('self', 'You cannot be your own master.')
    if (!isOnline(to.id)) throw bad('target_offline', 'That ninja is offline.')
    if (await isBlocked(db, from.id, to.id))
      throw bad('blocked', 'You cannot send a request to this player.')
    const role = senderRole(from.level, to.level)
    if (!role) throw bad('apprentice_level', LEVEL_RULE)
    const [master, apprentice] = role === 'master' ? [from, to] : [to, from]
    await requireFree(db, master, apprentice)
    book.request(
      { characterId: from.id, name: from.name, level: from.level },
      { characterId: to.id, name: to.name, level: to.level },
      role,
      now(),
    )
    tell(from.id)
    tell(to.id, `${from.name} wants to be your ${role}.`)
    return stateOf(from.id)
  })

  app.post('/accept', LIMITS.write, async (request) => {
    const { requestId } = apprenticeRequestIdSchema.parse(request.body)
    const self = await me(request)
    const pending: ApprenticeRequest = book.incoming(requestId, self.id, now())
    const fromId = pending.from.characterId
    await db.transaction(async (tx) => {
      const [mine, theirs] = await lockPair(tx, self.id, fromId)
      // Levels may have changed since the request: the roles must still hold.
      if (senderRole(theirs.level, mine.level) !== pending.senderRole)
        throw bad('apprentice_level', LEVEL_RULE)
      const [master, apprentice] = pending.senderRole === 'master' ? [theirs, mine] : [mine, theirs]
      await requireFree(tx, master, apprentice)
      await tx.insert(apprenticeships).values({ masterId: master.id, apprenticeId: apprentice.id })
    })
    book.remove(requestId)
    const role = pending.senderRole === 'master' ? 'apprentice' : 'master'
    tell(self.id, `${pending.from.name} is now your ${pending.senderRole}.`)
    tell(fromId, `${self.name} is now your ${role}.`)
    return stateOf(self.id)
  })

  app.post('/decline', LIMITS.write, async (request) => {
    const { requestId } = apprenticeRequestIdSchema.parse(request.body)
    const self = await me(request)
    const pending = book.incoming(requestId, self.id, now())
    book.remove(requestId)
    tell(self.id)
    tell(pending.from.characterId, `${self.name} declined your request.`)
    return stateOf(self.id)
  })

  app.post('/cancel', LIMITS.write, async (request) => {
    const self = await me(request)
    const pending = book.outgoingOf(self.id, now())
    if (!pending) throw bad('no_request', 'You have no request waiting.', 404)
    book.remove(pending.id)
    tell(self.id)
    tell(pending.to.characterId)
    return stateOf(self.id)
  })

  // Dismiss (master) or Leave (apprentice): the bond ends without a reward.
  app.post('/dismiss', LIMITS.write, async (request) => {
    const { characterId } = apprenticePartnerSchema.parse(request.body)
    const self = await me(request)
    await db.transaction(async (tx) => {
      await lockPair(tx, self.id, characterId)
      const bond = await bondOf(tx, self.id, characterId)
      await tx.delete(apprenticeships).where(eq(apprenticeships.apprenticeId, bond.apprenticeId))
    })
    tell(self.id)
    tell(characterId, `${self.name} ended your apprenticeship.`)
    return stateOf(self.id)
  })

  app.post('/graduate', LIMITS.write, async (request) => {
    const { characterId } = apprenticePartnerSchema.parse(request.body)
    const self = await me(request)
    const { apprentice, character } = await db.transaction(async (tx) => {
      const [mine, theirs] = await lockPair(tx, self.id, characterId)
      const bond = await bondOf(tx, self.id, characterId)
      const [master, pupil] = bond.masterId === mine.id ? [mine, theirs] : [theirs, mine]
      if (!canGraduate(pupil.level))
        throw bad('too_low', `The apprentice must reach level ${graduateLevel} to graduate.`)
      await tx.delete(apprenticeships).where(eq(apprenticeships.apprenticeId, pupil.id))
      await addStone(tx, master, rewards.master.stone)
      await addStone(tx, pupil, rewards.apprentice.stone)
      return { apprentice: pupil, character: await reloadCharacter(tx, self.id) }
    })
    const line = (stone: number) =>
      `${apprentice.name} graduated! You receive ${stone.toLocaleString('en-US')} Stone.`
    const masterId = apprentice.id === self.id ? characterId : self.id
    tell(masterId, line(rewards.master.stone), true)
    tell(apprentice.id, line(rewards.apprentice.stone), true)
    return { ...(await stateOf(self.id)), character }
  })
}
