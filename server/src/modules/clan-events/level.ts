// Clan level (Reborn's Events tab bar: "Clan Level: N", EXP "cur / next", MAX at 20) and the
// shared pieces of the clan Events: the progress row, Bankai rewards and currency payments.
// Clan Points (Ninja Garden harvests) count as the member's contribution and as clan EXP.
import { eq, sql } from 'drizzle-orm'
import {
  CLAN_MAX_LEVEL,
  clanLevelExp,
  type ClanLevelView,
} from '../../../../shared/src/schemas/home.js'
import type { Db } from '../../db/client.js'
import { characterBankai, characters, clanMembers, clanProgress, clans } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { bad } from '../gates/common.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'
import { weeklyOf, type ClanContext } from '../clans/clans.js'

export type ProgressRow = typeof clanProgress.$inferSelect

export const clanLevelView = (level: number, exp: number): ClanLevelView => ({
  level,
  exp: level >= CLAN_MAX_LEVEL ? 0 : exp,
  next: clanLevelExp(level),
})

export async function readProgress(db: Tx | Db, clanId: string) {
  const [row] = await db.select().from(clanProgress).where(eq(clanProgress.clanId, clanId))
  return row
}

/** The clan's progress row, created on first use; the caller already holds the clan row lock. */
export async function lockProgress(tx: Tx, clanId: string) {
  await tx.insert(clanProgress).values({ clanId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(clanProgress)
    .where(eq(clanProgress.clanId, clanId))
    .for('update')
  return row!
}

/** Adds clan EXP, levelling up while the bar is full; returns the new level and EXP. */
export function gainClanExp(level: number, exp: number, gained: number) {
  let next = clanLevelExp(level)
  let total = exp + gained
  while (next !== null && total >= next) {
    total -= next
    level += 1
    next = clanLevelExp(level)
  }
  return { level, exp: next === null ? 0 : total }
}

/** Clan Points: the member's weekly and overall contribution, and the clan's EXP. */
export async function addClanPoints(ctx: ClanContext, points: number, now: Date) {
  const { tx, clan, member } = ctx
  await tx
    .update(clanMembers)
    .set({
      week: weekStart(now),
      weeklyPoints: weeklyOf(member, now) + points,
      totalPoints: member.totalPoints + points,
    })
    .where(eq(clanMembers.characterId, member.characterId))
  const progress = await lockProgress(tx, clan.id)
  const after = gainClanExp(clan.level, progress.exp, points)
  await tx.update(clanProgress).set({ exp: after.exp }).where(eq(clanProgress.clanId, clan.id))
  if (after.level !== clan.level)
    await tx.update(clans).set({ level: after.level }).where(eq(clans.id, clan.id))
  return clanLevelView(after.level, after.exp)
}

/** Adds Bankai Coins and Bankai EXP (the Bankai window's pool). */
export async function addBankai(tx: Tx, characterId: string, coins: number, exp: number) {
  if (coins <= 0 && exp <= 0) return
  await tx
    .insert(characterBankai)
    .values({ characterId, coins, expPool: exp })
    .onConflictDoUpdate({
      target: characterBankai.characterId,
      set: {
        coins: sql`${characterBankai.coins} + ${coins}`,
        expPool: sql`${characterBankai.expPool} + ${exp}`,
      },
    })
}

const CURRENCY_NAMES = { stone: 'Stones', gold: 'Gold', giftCoupon: 'Gift Certificates' } as const
export type Currency = keyof typeof CURRENCY_NAMES

/** Takes `amount` of a currency from the locked caller. */
export async function pay(ctx: ClanContext, currency: Currency, amount: number) {
  if (ctx.me[currency] < amount) throw bad('not_enough', `Not enough ${CURRENCY_NAMES[currency]}.`)
  await ctx.tx
    .update(characters)
    .set({ [currency]: sql`${characters[currency]} - ${amount}` })
    .where(eq(characters.id, ctx.me.id))
}
