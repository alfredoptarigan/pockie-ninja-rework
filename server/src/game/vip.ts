// VIP membership (M3 decision 14): one tier bought in the item mall with Gold, running until
// `characters.vip_until`. Every EXP and drop reward goes through vipExp and vipDropMul; no other
// original VIP perk is ported (decision 10).
import type { characters } from '../db/schema.js'

/** Days one purchase adds (the mall purchase arrives with the mall milestone). */
export const VIP_DAYS = 30
export const VIP_EXP_MUL = 1.5
export const VIP_DROP_MUL = 1.25

type VipHolder = Pick<typeof characters.$inferSelect, 'vipUntil'>

export const isVip = (character: VipHolder, now = new Date()) =>
  character.vipUntil !== null && character.vipUntil.getTime() > now.getTime()

/** EXP a reward pays: +50% (rounded down) for a VIP. */
export const vipExp = (exp: number, character: VipHolder, now = new Date()) =>
  isVip(character, now) ? Math.floor(exp * VIP_EXP_MUL) : exp

/** Factor on every drop chance (passed to where the chance is rolled): 1.25 for a VIP. */
export const vipDropMul = (character: VipHolder, now = new Date()) =>
  isVip(character, now) ? VIP_DROP_MUL : 1
