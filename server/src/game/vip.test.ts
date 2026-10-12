import { describe, expect, it } from 'vitest'
import { isVip, VIP_DAYS, VIP_DROP_MUL, VIP_EXP_MUL, vipDropMul, vipExp } from './vip.js'

const now = new Date('2026-10-12T12:00:00Z')
const member = { vipUntil: new Date('2026-10-20T00:00:00Z') }
const expired = { vipUntil: new Date('2026-10-12T11:59:59Z') }
const none = { vipUntil: null }

describe('VIP (decision 14)', () => {
  it('names one 30-day tier with +50% EXP and +25% drop chance', () => {
    expect({ VIP_DAYS, VIP_EXP_MUL, VIP_DROP_MUL }).toEqual({
      VIP_DAYS: 30,
      VIP_EXP_MUL: 1.5,
      VIP_DROP_MUL: 1.25,
    })
  })

  it('is VIP only before vip_until', () => {
    expect(isVip(member, now)).toBe(true)
    expect(isVip(expired, now)).toBe(false)
    expect(isVip({ vipUntil: now }, now)).toBe(false)
    expect(isVip(none, now)).toBe(false)
  })

  it('raises EXP by half (rounded down) for a VIP only', () => {
    expect(vipExp(101, member, now)).toBe(151)
    expect(vipExp(101, expired, now)).toBe(101)
    expect(vipExp(101, none, now)).toBe(101)
    expect(vipExp(0, member, now)).toBe(0)
  })

  it('raises drop chances by a quarter for a VIP only', () => {
    expect(vipDropMul(member, now)).toBe(1.25)
    expect(vipDropMul(expired, now)).toBe(1)
    expect(vipDropMul(none, now)).toBe(1)
  })
})
