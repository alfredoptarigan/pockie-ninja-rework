import { describe, expect, it } from 'vitest'
import {
  CURRENCY_CAP,
  claimableWallet,
  listingFee,
  listingRefusal,
  priceRefusal,
  sellerPayout,
  type MarketItemState,
} from './market.js'

const sellable: MarketItemState = {
  canTrade: 3,
  bound: false,
  equipped: false,
  inBag: true,
  category: '1_0_2',
  equipment: false,
  propCount: 0,
}

describe('Market fee (MartSystem.GetCharge)', () => {
  it('matches the documented fees for levels 25, 50 and 90', () => {
    expect([8, 12, 24].map((h) => listingFee(25, h))).toEqual([150, 225, 450])
    expect([8, 12, 24].map((h) => listingFee(50, h))).toEqual([200, 300, 600])
    expect([8, 12, 24].map((h) => listingFee(90, h))).toEqual([280, 420, 840])
  })
  it('floors fractional fees', () => {
    expect(listingFee(26, 8)).toBe(152)
    expect(listingFee(27, 12)).toBe(231)
    expect(listingFee(25, 1)).toBe(18) // 18.75 floored
  })
})

describe('Market tax', () => {
  it('pays 90% rounded down', () => {
    expect(sellerPayout(100)).toBe(90)
    expect(sellerPayout(19)).toBe(17)
  })
  it('pays at least 1 for any charged currency and nothing for none', () => {
    expect(sellerPayout(1)).toBe(1)
    expect(sellerPayout(0)).toBe(0)
  })
  it('stays exact on large totals (no float tax, M9)', () => {
    expect(sellerPayout(1_000_000 * 9_999)).toBe(8_999_100_000)
    expect(sellerPayout(16_777_219)).toBe(15_099_497)
  })
})

describe('listing eligibility', () => {
  it('accepts a tradable, unbound bag item with a category', () => {
    expect(listingRefusal(sellable)).toBeNull()
  })
  it.each([
    [{ canTrade: 1 }, 'not_tradable'],
    [{ canTrade: 0 }, 'not_tradable'],
    [{ bound: true }, 'bound'],
    [{ equipped: true }, 'equipped'],
    [{ inBag: false }, 'not_in_bag'],
    [{ category: undefined }, 'no_category'],
    [{ equipment: true, propCount: 1, category: '0_0_0_0' }, 'needs_properties'],
    [{ equipment: true, propCount: 0 }, 'needs_properties'],
  ] as const)('refuses %o with %s', (change, code) => {
    expect(listingRefusal({ ...sellable, ...change })).toBe(code)
  })
  it('accepts equipment with 2 to 4 properties', () => {
    for (const propCount of [2, 3, 4])
      expect(listingRefusal({ ...sellable, equipment: true, propCount })).toBeNull()
  })
  it('accepts players-only items (CanTrade 2)', () => {
    expect(listingRefusal({ ...sellable, canTrade: 2 })).toBeNull()
  })
})

describe('prices', () => {
  it('needs at least one price, each 1..1,000,000', () => {
    expect(priceRefusal(null, null)).toBe('invalid_price')
    expect(priceRefusal(0, null)).toBe('invalid_price')
    expect(priceRefusal(1_000_001, null)).toBe('invalid_price')
    expect(priceRefusal(null, -5)).toBe('invalid_price')
    expect(priceRefusal(1.5, null)).toBe('invalid_price')
    expect(priceRefusal(1_000_000, null)).toBeNull()
    expect(priceRefusal(null, 1)).toBeNull()
    expect(priceRefusal(5, 7)).toBeNull()
  })
})

describe('wallet claim', () => {
  it('moves the whole wallet when it fits', () => {
    expect(claimableWallet(10, 500)).toBe(500)
  })
  it('moves only up to the currency cap and keeps the rest (fixes M12)', () => {
    expect(claimableWallet(CURRENCY_CAP - 100, 500)).toBe(100)
    expect(claimableWallet(CURRENCY_CAP, 500)).toBe(0)
    expect(claimableWallet(CURRENCY_CAP + 5, 500)).toBe(0)
  })
})
