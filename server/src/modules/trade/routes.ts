// Player-to-player Trade under /api/game/trade (Reborn's "Trade with", reborn-windows-M-Z-hud.md).
// Request from View Character, accept or decline, offer bag items and currencies, Ready for Trade
// (lock), Confirm Trade; any offer change takes back both players' ready and confirm. The swap is
// one transaction (settle.ts). Every change pushes a `trade` notice to both players.
import type { Notice } from '@pockie/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  canTradeAt,
  TRADE_CONFIG,
  TRADE_REFUSALS,
} from '../../../../game-core/src/economy/trade.js'
import {
  tradeConfirmSchema,
  tradeCurrencySchema,
  tradeItemSchema,
  tradeReadySchema,
  tradeRequestIdSchema,
  tradeRequestSchema,
  type TradePlayer,
} from '../../../../shared/src/schemas/trade.js'
import type { Db } from '../../db/client.js'
import { characters, inventoryItems } from '../../db/schema.js'
import { HttpError } from '../../http.js'
import { characterOf, requireUser, toCharacter } from '../game/characters.js'
import { itemView } from '../market/views.js'
import { notifyCharacter, onCharacterOffline } from '../realtime/events.js'
import { characterById, isBlocked, isOnline } from '../social/players.js'
import { createTradeBook, type Trade } from './book.js'
import { CURRENCY_NAMES, fingerprint, refusalOf, swap, TradeChanged } from './settle.js'

const LIMITS = {
  read: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  // Offering a full 6 x 6 grid alone takes 36 requests.
  write: { rateLimit: { max: 180, timeWindow: '1 minute' } },
}

const LEVEL_MESSAGE = `Both players must be at least level ${TRADE_CONFIG.minLevel} to trade.`
const bad = (code: string, message: string, status = 400) => new HttpError(status, code, message)

type CharacterRow = typeof characters.$inferSelect
const playerOf = (row: CharacterRow): TradePlayer => ({
  characterId: row.id,
  name: row.name,
  level: row.level,
})

function requireLevel(row: CharacterRow) {
  if (!canTradeAt(row.level)) throw bad('trade_level', LEVEL_MESSAGE, 403)
}

/** Pushes a trade notice; never throws into the request (the state is already changed). */
function tell(characterId: string, message?: string, done?: boolean) {
  const notice: Notice = { kind: 'trade', ...(message && { message }), ...(done && { done }) }
  notifyCharacter(characterId, notice)
}

export default async function tradeRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const book = createTradeBook()
  const now = () => Date.now()
  const me = (request: FastifyRequest) => characterOf(db, requireUser(request).id)
  const state = (characterId: string) => book.state(characterId, now())
  /** Tells both players of a trade (the partner with `message`) and answers the caller. */
  const changed = (trade: Trade, actorId: string, message?: string) => {
    tell(actorId)
    tell(book.partnerOf(trade, actorId).characterId, message)
    return state(actorId)
  }

  const offOffline = onCharacterOffline((characterId) => {
    const { others, partner } = book.leave(characterId)
    for (const other of others) tell(other)
    if (partner) tell(partner.characterId, 'Your trade partner went offline. The trade ended.')
  })
  app.addHook('onClose', async () => offOffline())

  app.get('/', { config: LIMITS.read }, async (request) => state((await me(request)).id))

  app.post('/request', { config: LIMITS.write }, async (request) => {
    const { characterId } = tradeRequestSchema.parse(request.body)
    const from = await me(request)
    if (characterId === from.id) throw bad('self', 'You cannot trade with yourself.')
    requireLevel(from)
    const to = await characterById(db, characterId)
    if (!canTradeAt(to.level)) throw bad('trade_level', LEVEL_MESSAGE)
    if (!isOnline(to.id)) throw bad('target_offline', 'That ninja is offline.')
    if (await isBlocked(db, from.id, to.id))
      throw bad('blocked', 'You cannot trade with this player.')
    book.request(playerOf(from), playerOf(to), now())
    tell(from.id)
    tell(to.id, `${from.name} wants to trade.`)
    return state(from.id)
  })

  app.post('/accept', { config: LIMITS.write }, async (request) => {
    const { requestId } = tradeRequestIdSchema.parse(request.body)
    const self = await me(request)
    requireLevel(self)
    const fromId = book.incoming(requestId, self.id, now()).from.characterId
    if (!isOnline(fromId)) {
      book.decline(requestId, self.id, now())
      throw bad('target_offline', 'That ninja is offline.')
    }
    const from = await characterById(db, fromId)
    if (!canTradeAt(from.level)) throw bad('trade_level', LEVEL_MESSAGE)
    const { trade, dropped } = book.accept(requestId, playerOf(self), now())
    for (const other of dropped) tell(other)
    return changed(trade, self.id, `${self.name} accepted your trade request.`)
  })

  app.post('/decline', { config: LIMITS.write }, async (request) => {
    const { requestId } = tradeRequestIdSchema.parse(request.body)
    const self = await me(request)
    const from = book.decline(requestId, self.id, now())
    tell(self.id)
    tell(from.characterId, `${self.name} declined your trade request.`)
    return state(self.id)
  })

  app.post('/cancel-request', { config: LIMITS.write }, async (request) => {
    const self = await me(request)
    const to = book.cancelRequest(self.id, now())
    tell(self.id)
    tell(to.characterId)
    return state(self.id)
  })

  app.post('/items/add', { config: LIMITS.write }, async (request) => {
    const { inventoryId } = tradeItemSchema.parse(request.body)
    const self = await me(request)
    const tradeId = book.tradeOf(self.id)?.id
    if (!tradeId) throw bad('no_trade', 'You are not trading.', 409)
    const [row] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, inventoryId), eq(inventoryItems.characterId, self.id)))
    if (!row) throw bad('no_item', 'You do not have that item.', 404)
    const refusal = refusalOf(row)
    if (refusal) throw bad(refusal, TRADE_REFUSALS[refusal])
    const trade = book.addItem(self.id, tradeId, {
      item: itemView(row),
      fingerprint: fingerprint(row),
    })
    return changed(trade, self.id)
  })

  app.post('/items/remove', { config: LIMITS.write }, async (request) => {
    const { inventoryId } = tradeItemSchema.parse(request.body)
    const self = await me(request)
    return changed(book.removeItem(self.id, inventoryId), self.id)
  })

  app.post('/currency', { config: LIMITS.write }, async (request) => {
    const { currency, amount } = tradeCurrencySchema.parse(request.body)
    const self = await me(request)
    const tradeId = book.tradeOf(self.id)?.id
    if (!tradeId) throw bad('no_trade', 'You are not trading.', 409)
    if (amount > self[currency])
      throw bad('no_currency', `You do not have that much ${CURRENCY_NAMES[currency]}.`)
    return changed(book.setCurrency(self.id, tradeId, currency, amount), self.id)
  })

  app.post('/ready', { config: LIMITS.write }, async (request) => {
    const { ready, version } = tradeReadySchema.parse(request.body)
    const self = await me(request)
    return changed(book.ready(self.id, ready, version), self.id)
  })

  app.post('/confirm', { config: LIMITS.write }, async (request) => {
    const { version } = tradeConfirmSchema.parse(request.body)
    const self = await me(request)
    const complete = book.confirm(self.id, version)
    const trade = book.tradeOf(self.id)!
    if (!complete) return changed(trade, self.id)
    const partner = book.partnerOf(trade, self.id)
    try {
      await db.transaction((tx) => swap(tx, trade))
    } catch (error) {
      book.reopen(trade, error instanceof TradeChanged ? error.inventoryIds : [])
      const reason = error instanceof HttpError ? error.message : 'The trade failed.'
      tell(self.id)
      tell(partner.characterId, reason)
      throw error
    }
    book.close(trade)
    tell(self.id, 'Trade completed.', true)
    tell(partner.characterId, 'Trade completed.', true)
    const [row] = await db.select().from(characters).where(eq(characters.id, self.id))
    return { ...state(self.id), completed: true, character: toCharacter(row!) }
  })

  app.post('/cancel', { config: LIMITS.write }, async (request) => {
    const self = await me(request)
    const trade = book.tradeOf(self.id)
    if (!trade) throw bad('no_trade', 'You are not trading.', 409)
    if (trade.settling) throw bad('trade_busy', 'The trade is being completed.', 409)
    book.close(trade)
    tell(self.id)
    tell(book.partnerOf(trade, self.id).characterId, `${self.name} cancelled the trade.`)
    return state(self.id)
  })
}
