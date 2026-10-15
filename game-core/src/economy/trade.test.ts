import { describe, expect, it } from 'vitest'
import { canTradeAt, netAmounts, tradeFee, tradeRefusal, type TradeItemState } from './trade.js'

const tradable: TradeItemState = {
  canTrade: 3,
  questItem: false,
  bound: false,
  locked: false,
  equipped: false,
  inBag: true,
}

describe('Trade level gate', () => {
  it('opens at level 30', () => {
    expect(canTradeAt(29)).toBe(false)
    expect(canTradeAt(30)).toBe(true)
  })
})

describe('Trade fee', () => {
  it('keeps a floored 10% of Stone and Gift Certificates and none of Gold', () => {
    expect(tradeFee('stone', 1_005)).toEqual({ fee: 100, net: 905 })
    expect(tradeFee('giftCoupon', 9)).toEqual({ fee: 0, net: 9 })
    expect(tradeFee('gold', 500)).toEqual({ fee: 0, net: 500 })
    expect(netAmounts({ stone: 100, gold: 7, giftCoupon: 50 })).toEqual({
      stone: 90,
      gold: 7,
      giftCoupon: 45,
    })
  })
})

describe('Trade item refusals', () => {
  it('accepts a plain tradable bag item', () => {
    expect(tradeRefusal(tradable)).toBeNull()
  })
  it.each([
    [{ inBag: false }, 'not_in_bag'],
    [{ equipped: true }, 'equipped'],
    [{ bound: true }, 'bound'],
    [{ canTrade: 1 }, 'not_tradable'],
    [{ questItem: true }, 'not_tradable'],
    [{ locked: true }, 'locked'],
  ] as const)('refuses %o', (change, refusal) => {
    expect(tradeRefusal({ ...tradable, ...change })).toBe(refusal)
  })
})
