// Picnic in Garden (Reborn's `Ph`, reborn-windows-M-Z-hud.md): opens at clan level 4. Members fill
// the clan's weekly warehouse (Monday 00:00 UTC) with outfits (1-7 points), 150,000 Stones (+10)
// or 20 Gift Certificates (+30); the Contribution Leaderboard ranks this week's points. When last
// week's warehouse was full, every member claims its Picnic Boxes once, on Monday only. The
// caller holds the clan lock (lockClanOf), then this takes the progress and member rows.
import { and, desc, eq, gt } from 'drizzle-orm'
import {
  HOME_PLACEHOLDERS,
  PICNIC_RULES,
  type PicnicView,
} from '../../../../shared/src/schemas/home.js'
import type { Db } from '../../db/client.js'
import { characters, clanPicnicMembers, clanProgress, inventoryItems } from '../../db/schema.js'
import { requireBagRoom, bagItemsWhere } from '../../game/bag.js'
import { outfitOf } from '../../game/outfit.js'
import { consumeOne, grantItems, type Tx } from '../../game/progress.js'
import type { ClanContext } from '../clans/clans.js'
import { bad } from '../gates/common.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'
import { addBankai, lockProgress, pay, readProgress, type ProgressRow } from './level.js'

type MemberRow = typeof clanPicnicMembers.$inferSelect

const DAY_MS = 86_400_000
const MONDAY = 1
const REFINE_TALISMAN = 'i161004'
const { picnicRequirement: requirement, picnicBoxesPerClaim } = HOME_PLACEHOLDERS

const lastWeek = (now: Date) => weekStart(new Date(now.getTime() - 7 * DAY_MS))

/** The warehouse as of `now`: a new week starts empty and remembers the week before. */
function warehouse(row: ProgressRow | undefined, now: Date) {
  const week = weekStart(now)
  if (row?.picnicWeek === week)
    return {
      picnicWeek: week,
      picnicPoints: row.picnicPoints,
      picnicLastPoints: row.picnicLastPoints,
    }
  return {
    picnicWeek: week,
    picnicPoints: 0,
    picnicLastPoints: row?.picnicWeek === lastWeek(now) ? row.picnicPoints : 0,
  }
}

/** This week's points of a member in this clan. */
const memberPoints = (row: MemberRow | undefined, clanId: string, now: Date) =>
  row && row.clanId === clanId && row.week === weekStart(now) ? row.points : 0

const readMember = async (db: Tx | Db, characterId: string) =>
  (
    await db.select().from(clanPicnicMembers).where(eq(clanPicnicMembers.characterId, characterId))
  )[0]

function untilMonday(now: Date) {
  const next = Date.parse(`${weekStart(now)}T00:00:00Z`) + 7 * DAY_MS
  return next - now.getTime()
}

export async function picnicView(
  db: Tx | Db,
  ctx: { characterId: string; clanId: string; clanLevel: number },
  now = new Date(),
): Promise<PicnicView> {
  const store = warehouse(await readProgress(db, ctx.clanId), now)
  const member = await readMember(db, ctx.characterId)
  const claimed = member?.claimedWeek === weekStart(now)
  const lastWeekFull = store.picnicLastPoints >= requirement
  const contributions = await db
    .select({
      characterId: clanPicnicMembers.characterId,
      name: characters.name,
      points: clanPicnicMembers.points,
    })
    .from(clanPicnicMembers)
    .innerJoin(characters, eq(characters.id, clanPicnicMembers.characterId))
    .where(
      and(
        eq(clanPicnicMembers.clanId, ctx.clanId),
        eq(clanPicnicMembers.week, weekStart(now)),
        gt(clanPicnicMembers.points, 0),
      ),
    )
    .orderBy(desc(clanPicnicMembers.points), characters.name)
  return {
    unlocked: ctx.clanLevel >= PICNIC_RULES.unlockLevel,
    unlockLevel: PICNIC_RULES.unlockLevel,
    clanLevel: ctx.clanLevel,
    warehousePoints: store.picnicPoints,
    requirement,
    isFull: store.picnicPoints >= requirement,
    lastWeekFull,
    canClaim: now.getUTCDay() === MONDAY && lastWeekFull && !claimed,
    alreadyClaimedThisWeek: claimed,
    rewardAmount: picnicBoxesPerClaim,
    boxLevel: ctx.clanLevel,
    timeUntilMonday: untilMonday(now),
    stoneCost: PICNIC_RULES.stone.cost,
    stonePoints: PICNIC_RULES.stone.points,
    goldCost: PICNIC_RULES.giftCoupon.cost,
    goldPoints: PICNIC_RULES.giftCoupon.points,
    contributions,
  }
}

function requireUnlocked(ctx: ClanContext) {
  if (ctx.clan.level < PICNIC_RULES.unlockLevel)
    throw bad('picnic_locked', `Picnic unlocks at clan level ${PICNIC_RULES.unlockLevel}.`)
}

/** Adds warehouse points for the clan and the member (this week). */
async function contribute(ctx: ClanContext, points: number, now: Date) {
  const { tx, clan, me } = ctx
  const store = warehouse(await lockProgress(tx, clan.id), now)
  await tx
    .update(clanProgress)
    .set({ ...store, picnicPoints: store.picnicPoints + points })
    .where(eq(clanProgress.clanId, clan.id))
  const member = await readMember(tx, me.id)
  const values = {
    clanId: clan.id,
    week: weekStart(now),
    points: memberPoints(member, clan.id, now) + points,
  }
  await tx
    .insert(clanPicnicMembers)
    .values({ characterId: me.id, ...values })
    .onConflictDoUpdate({ target: clanPicnicMembers.characterId, set: values })
}

export async function contributeStones(ctx: ClanContext, now: Date) {
  requireUnlocked(ctx)
  await pay(ctx, 'stone', PICNIC_RULES.stone.cost)
  await contribute(ctx, PICNIC_RULES.stone.points, now)
  return PICNIC_RULES.stone.points
}

export async function contributeGiftCertificates(ctx: ClanContext, now: Date) {
  requireUnlocked(ctx)
  await pay(ctx, 'giftCoupon', PICNIC_RULES.giftCoupon.cost)
  await contribute(ctx, PICNIC_RULES.giftCoupon.points, now)
  return PICNIC_RULES.giftCoupon.points
}

/** Select Outfit: one unequipped, unlocked outfit from the bag is given up for 1-7 points. */
export async function contributeOutfit(ctx: ClanContext, uid: string, now: Date) {
  requireUnlocked(ctx)
  const [row] = await ctx.tx
    .select()
    .from(inventoryItems)
    .where(and(bagItemsWhere(ctx.me.id), eq(inventoryItems.id, uid)))
  const outfit = row && outfitOf(row.itemId)
  if (!row || !outfit || row.equippedSlot)
    throw bad('not_outfit', 'Choose an outfit from your bag that you are not wearing.')
  if (row.locked) throw bad('item_locked', 'Unlock this outfit first.')
  await consumeOne(ctx.tx, row)
  const points = HOME_PLACEHOLDERS.outfitPoints(outfit.plus)
  await contribute(ctx, points, now)
  return points
}

/** Claim Reward: Monday only, last week's warehouse full, once a week per member. */
export async function claimReward(ctx: ClanContext, now: Date) {
  requireUnlocked(ctx)
  const { tx, clan, me } = ctx
  const store = warehouse(await lockProgress(tx, clan.id), now)
  const member = await readMember(tx, me.id)
  if (member?.claimedWeek === weekStart(now)) throw bad('claimed', 'Already claimed this week')
  if (store.picnicLastPoints < requirement) throw bad('not_full', 'Warehouse must be full')
  if (now.getUTCDay() !== MONDAY) throw bad('not_monday', 'Rewards available on Monday only')
  const box = HOME_PLACEHOLDERS.picnicBox(clan.level)
  const refineTalismans = box.refineTalismans * picnicBoxesPerClaim
  const bankaiCoins = box.bankaiCoins * picnicBoxesPerClaim
  const talismans = Array.from({ length: refineTalismans }, () => ({
    itemId: REFINE_TALISMAN,
    bound: true,
  }))
  await requireBagRoom(tx, me.id, talismans)
  await grantItems(tx, me.id, talismans)
  await addBankai(tx, me.id, bankaiCoins, 0)
  const values = {
    clanId: clan.id,
    week: weekStart(now),
    points: memberPoints(member, clan.id, now),
    claimedWeek: weekStart(now),
  }
  await tx
    .insert(clanPicnicMembers)
    .values({ characterId: me.id, ...values })
    .onConflictDoUpdate({ target: clanPicnicMembers.characterId, set: values })
  return { boxes: picnicBoxesPerClaim, refineTalismans, bankaiCoins }
}
