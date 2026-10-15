// Open trade requests and trades, in memory. Every step here is synchronous, so two requests can
// never interleave inside one: callers do their awaits first, then call one of these.
// Offered items stay in their owner's bag; the swap (settle.ts) re-checks them under row locks.
// ponytail: process-local like realtime's presence; a restart cancels open trades (nothing is
// lost, nothing moved yet). Move to a shared store before running more than one server.
import { randomUUID } from 'node:crypto'
import {
  NO_AMOUNTS,
  TRADE_CONFIG,
  type TradeAmounts,
  type TradeCurrency,
} from '../../../../game-core/src/economy/trade.js'
import type {
  TradeItem,
  TradePlayer,
  TradeRequestView,
  TradeSideView,
  TradeState,
} from '../../../../shared/src/schemas/trade.js'
import { HttpError } from '../../http.js'

export interface Offer {
  item: TradeItem
  /** The row's instance state when offered (settle.ts fingerprint). */
  fingerprint: string
}

export interface Side extends TradePlayer {
  offers: Offer[]
  currency: TradeAmounts
  ready: boolean
  confirmed: boolean
}

export interface Trade {
  id: string
  version: number
  /** [initiator, partner]. */
  sides: [Side, Side]
  /** The swap transaction is running: no step may change the trade. */
  settling: boolean
}

interface Request {
  id: string
  from: TradePlayer
  to: TradePlayer
  expiresAt: number
}

const bad = (code: string, message: string, status = 400) => new HttpError(status, code, message)
const conflict = (code: string, message: string) => bad(code, message, 409)

const side = (player: TradePlayer): Side => ({
  ...player,
  offers: [],
  currency: { ...NO_AMOUNTS },
  ready: false,
  confirmed: false,
})

const sideView = ({ offers, currency, ready, confirmed, ...player }: Side): TradeSideView => ({
  ...player,
  items: offers.map((offer) => offer.item),
  currency: { ...currency },
  ready,
  confirmed,
})

export function createTradeBook() {
  const requests = new Map<string, Request>()
  /** Character id -> the trade it is in. */
  const trades = new Map<string, Trade>()

  function purge(now: number) {
    for (const [id, request] of requests) if (request.expiresAt <= now) requests.delete(id)
  }

  const requestView = (request: Request): TradeRequestView => ({
    id: request.id,
    from: request.from,
    to: request.to,
    expiresAt: new Date(request.expiresAt).toISOString(),
  })

  const outgoingOf = (characterId: string) =>
    [...requests.values()].find((request) => request.from.characterId === characterId)

  /** My side and my partner's of my trade. */
  function sidesOf(trade: Trade, characterId: string) {
    const [a, b] = trade.sides
    return a.characterId === characterId ? ([a, b] as const) : ([b, a] as const)
  }

  /** My open trade, ready for a change: not being settled. */
  function mine(characterId: string) {
    const trade = trades.get(characterId)
    if (!trade) throw conflict('no_trade', 'You are not trading.')
    if (trade.settling) throw conflict('trade_busy', 'The trade is being completed.')
    return trade
  }

  /** An offer changed: both players must check it again (fixes 2011's bait and switch, T1). */
  function changed(trade: Trade) {
    trade.version++
    for (const s of trade.sides) {
      s.ready = false
      s.confirmed = false
    }
  }

  /** Every request to or from these characters; returns the other players to tell. */
  function dropRequestsOf(...characterIds: string[]) {
    const others = new Set<string>()
    for (const [id, { from, to }] of requests) {
      const involved = characterIds.find((c) => c === from.characterId || c === to.characterId)
      if (!involved) continue
      requests.delete(id)
      for (const player of [from, to])
        if (!characterIds.includes(player.characterId)) others.add(player.characterId)
    }
    return [...others]
  }

  /** A request addressed to `characterId` that is still open (for checks before accepting). */
  function incoming(requestId: string, characterId: string, now: number) {
    purge(now)
    const request = requests.get(requestId)
    if (!request || request.to.characterId !== characterId)
      throw bad('request_gone', 'The trade request is no longer available.', 404)
    return request
  }

  /** Ends a trade (done or cancelled). */
  function close(trade: Trade) {
    for (const s of trade.sides)
      if (trades.get(s.characterId) === trade) trades.delete(s.characterId)
  }

  return {
    state(characterId: string, now: number): TradeState {
      purge(now)
      const trade = trades.get(characterId)
      let view: TradeState['trade'] = null
      if (trade) {
        const [me, partner] = sidesOf(trade, characterId)
        view = {
          id: trade.id,
          version: trade.version,
          me: sideView(me),
          partner: sideView(partner),
        }
      }
      const outgoing = outgoingOf(characterId)
      return {
        trade: view,
        incoming: [...requests.values()]
          .filter((request) => request.to.characterId === characterId)
          .map(requestView),
        outgoing: outgoing ? requestView(outgoing) : null,
      }
    },

    tradeOf: (characterId: string) => trades.get(characterId),

    /** Reborn's View Character Trade: one waiting request per player, neither already trading. */
    request(from: TradePlayer, to: TradePlayer, now: number) {
      purge(now)
      if (trades.has(from.characterId)) throw conflict('busy', 'You are already trading.')
      if (trades.has(to.characterId)) throw conflict('busy', `${to.name} is busy trading.`)
      if (outgoingOf(from.characterId))
        throw conflict('pending', 'You already have a trade request waiting.')
      const request: Request = {
        id: randomUUID(),
        from,
        to,
        expiresAt: now + TRADE_CONFIG.requestTtlMs,
      }
      requests.set(request.id, request)
      return requestView(request)
    },

    incoming,

    /**
     * Opens the trade of a request addressed to `me`; drops every other request of both players.
     * Returns the trade and the other players whose requests were dropped.
     */
    accept(requestId: string, me: TradePlayer, now: number) {
      const request = incoming(requestId, me.characterId, now)
      if (trades.has(me.characterId)) throw conflict('busy', 'You are already trading.')
      if (trades.has(request.from.characterId))
        throw conflict('busy', `${request.from.name} is busy trading.`)
      const dropped = dropRequestsOf(me.characterId, request.from.characterId)
      const trade: Trade = {
        id: randomUUID(),
        version: 0,
        sides: [side(request.from), side(me)],
        settling: false,
      }
      for (const s of trade.sides) trades.set(s.characterId, trade)
      return { trade, dropped }
    },

    /** Declines a request to me; returns the requester. */
    decline(requestId: string, characterId: string, now: number) {
      const request = incoming(requestId, characterId, now)
      requests.delete(request.id)
      return request.from
    },

    /** Withdraws my waiting request; returns who it was for. */
    cancelRequest(characterId: string, now: number) {
      purge(now)
      const request = outgoingOf(characterId)
      if (!request) throw bad('request_gone', 'You have no trade request waiting.', 404)
      requests.delete(request.id)
      return request.to
    },

    addItem(characterId: string, tradeId: string, offer: Offer) {
      const trade = mine(characterId)
      if (trade.id !== tradeId) throw conflict('no_trade', 'That trade has ended.')
      const [me] = sidesOf(trade, characterId)
      const id = offer.item.inventoryId
      if (me.offers.some((o) => o.item.inventoryId === id))
        throw bad('offered', 'That item is already in the trade.')
      if (me.offers.length >= TRADE_CONFIG.maxItems)
        throw bad('trade_full', `You can offer at most ${TRADE_CONFIG.maxItems} items.`)
      me.offers = [...me.offers, offer]
      changed(trade)
      return trade
    },

    removeItem(characterId: string, inventoryId: string) {
      const trade = mine(characterId)
      const [me] = sidesOf(trade, characterId)
      if (!me.offers.some((o) => o.item.inventoryId === inventoryId))
        throw bad('not_offered', 'That item is not in the trade.')
      me.offers = me.offers.filter((o) => o.item.inventoryId !== inventoryId)
      changed(trade)
      return trade
    },

    setCurrency(characterId: string, tradeId: string, currency: TradeCurrency, amount: number) {
      const trade = mine(characterId)
      if (trade.id !== tradeId) throw conflict('no_trade', 'That trade has ended.')
      const [me] = sidesOf(trade, characterId)
      if (me.currency[currency] === amount) return trade
      me.currency = { ...me.currency, [currency]: amount }
      changed(trade)
      return trade
    },

    /** Reborn's Ready for Trade (lock). Un-readying also takes back both confirmations. */
    ready(characterId: string, ready: boolean, version: number) {
      const trade = mine(characterId)
      if (version !== trade.version)
        throw conflict('trade_changed', 'The trade changed. Check the offers again.')
      const [me, partner] = sidesOf(trade, characterId)
      me.ready = ready
      if (!ready) {
        me.confirmed = false
        partner.confirmed = false
      }
      return trade
    },

    /**
     * Reborn's Confirm Trade, once both are ready. Returns true when this confirmation completes
     * the pair: the trade is then marked settling and the caller must run the swap.
     */
    confirm(characterId: string, version: number) {
      const trade = mine(characterId)
      if (version !== trade.version)
        throw conflict('trade_changed', 'The trade changed. Check the offers again.')
      const [me, partner] = sidesOf(trade, characterId)
      if (!me.ready || !partner.ready)
        throw conflict('not_ready', 'Both players must be ready first.')
      me.confirmed = true
      trade.settling = partner.confirmed
      return trade.settling
    },

    /** The swap failed: drop the offers that changed and ask both players to check again. */
    reopen(trade: Trade, changedIds: readonly string[] = []) {
      trade.settling = false
      for (const s of trade.sides)
        s.offers = s.offers.filter((o) => !changedIds.includes(o.item.inventoryId))
      changed(trade)
    },

    close,

    /** The character went offline: its requests and its trade end. Returns who to tell. */
    leave(characterId: string) {
      const others = dropRequestsOf(characterId)
      const trade = trades.get(characterId)
      if (!trade || trade.settling) return { others, partner: null }
      close(trade)
      return { others, partner: sidesOf(trade, characterId)[1] }
    },

    partnerOf: (trade: Trade, characterId: string) => sidesOf(trade, characterId)[1],
  }
}

export type TradeBook = ReturnType<typeof createTradeBook>
