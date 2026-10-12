import { describe, expect, it } from 'vitest'
import { cardPeekSchema, enterGateSchema, lasNochesStartSchema } from './gates.js'

describe('gate schemas', () => {
  it('defaults the card currency to Gold and limits the index to the five cards', () => {
    expect(cardPeekSchema.parse({ index: 4 })).toEqual({ index: 4, currency: 'gold' })
    expect(cardPeekSchema.safeParse({ index: 5 }).success).toBe(false)
    expect(cardPeekSchema.safeParse({ index: 0, currency: 'stone' }).success).toBe(false)
  })
  it('refuses unknown fields and bad ids', () => {
    expect(enterGateSchema.safeParse({ gateId: 100001, team: true }).success).toBe(false)
    expect(enterGateSchema.safeParse({ gateId: -1 }).success).toBe(false)
    expect(lasNochesStartSchema.safeParse({ mode: 'vip' }).success).toBe(false)
  })
})
