// Clan Missions (Reborn's `Qh` @2927000; shared/src/schemas/clan-activities.ts): 15 bosses in a
// row. The leader starts (or schedules up to 12 h ahead) the next unlocked boss or an earlier one,
// paying from clan storage (3 starts a day) or with a Clan Boss Free Entry; for 10 minutes every
// member attacks it, each fight removing at most 10% of its shared HP. A defeat pays clan storage
// and unlocks the next boss; a boss nobody attacked that escapes refunds its start.
//
// Locks: the caller's character, then the clan row (lockClanOf), then the clan_missions row. The
// escape settle (the job and every request) takes the clan row, then clan_missions, in its own
// transaction.
import { simulateFight } from '@pockie/game-core'
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm'
import {
  CLAN_MISSION_BOSSES,
  CLAN_MISSION_PLACEHOLDERS as P,
  CLAN_MISSION_RULES as RULES,
  type ClanMissionsView,
} from '../../../../shared/src/schemas/clan-activities.js'
import type { Db } from '../../db/client.js'
import { clanMissions, clans } from '../../db/schema.js'
import { monsterFighter, playerFighter } from '../../game/combat.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { addClanExp, pay } from '../clan-events/level.js'
import { logClan, SYSTEM_ACTOR } from '../clan-events/logs.js'
import type { ClanContext } from '../clans/clans.js'
import { bad, newSeed, utcDay } from '../gates/common.js'

type MissionRow = typeof clanMissions.$inferSelect
type ClanRow = typeof clans.$inferSelect

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
/** The job looks every 30 s. */
export const CLAN_MISSIONS_SETTLE_INTERVAL_MS = 30_000

const NO_BOSS = {
  bossIndex: null,
  startAt: null,
  endsAt: null,
  hp: null,
  maxHp: null,
  paid: null,
  attacks: {},
} satisfies Partial<MissionRow>

/** The boss as a fighter: our TicketBossNpc with Reborn's name. One fight is one slice of HP. */
const bossFighter = (bossIndex: number) => ({
  ...monsterFighter(P.npcIds[bossIndex]!),
  name: CLAN_MISSION_BOSSES[bossIndex]!.name,
})
const sliceHp = (bossIndex: number) => bossFighter(bossIndex).maxHp
const bossMaxHp = (bossIndex: number) =>
  Math.ceil((sliceHp(bossIndex) * 100) / P.damagePercentPerAttack)

const startsToday = (row: MissionRow | undefined, now: Date) =>
  row?.battlesDay === utcDay(now) ? row.battlesUsed : 0

const isActive = (row: MissionRow, now: Date) =>
  row.bossIndex !== null && row.startAt! <= now && row.endsAt! > now && row.hp! > 0

export async function readMissions(db: Db | Tx, clanId: string) {
  const [row] = await db.select().from(clanMissions).where(eq(clanMissions.clanId, clanId))
  return row
}

async function lockMissions(tx: Tx, clanId: string) {
  await tx.insert(clanMissions).values({ clanId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(clanMissions)
    .where(eq(clanMissions.clanId, clanId))
    .for('update')
  return row!
}

const save = (tx: Tx, clanId: string, values: Partial<MissionRow>) =>
  tx.update(clanMissions).set(values).where(eq(clanMissions.clanId, clanId))

/** Gives back what a start took: Free Entry, or the clan storage cost and that day's start. */
async function refund(tx: Tx, clanId: string, row: MissionRow) {
  const paid = row.paid
  if (!paid) return {}
  if (paid.free) return { freeEntries: row.freeEntries + 1 }
  await tx
    .update(clans)
    .set({
      stone: sql`${clans.stone} + ${paid.stones}`,
      giftCoupon: sql`${clans.giftCoupon} + ${paid.giftCertificates}`,
    })
    .where(eq(clans.id, clanId))
  return { battlesUsed: Math.max(0, row.battlesUsed - 1) }
}

/** An active boss whose time ran out escapes; the clan row and missions row are locked. */
async function settleLocked(tx: Tx, clanId: string, row: MissionRow, now: Date) {
  if (row.bossIndex === null || row.endsAt! > now) return row
  const attacked = Object.keys(row.attacks).length > 0
  const values: Partial<MissionRow> = {
    ...NO_BOSS,
    ...(attacked ? {} : await refund(tx, clanId, row)),
    lastOutcome: { bossIndex: row.bossIndex, defeated: false, at: now.toISOString() },
  }
  await save(tx, clanId, values)
  await logClan(
    tx,
    clanId,
    SYSTEM_ACTOR,
    'Clan Mission',
    `${CLAN_MISSION_BOSSES[row.bossIndex]!.name} escaped${attacked ? '' : ' (start refunded)'}`,
  )
  return { ...row, ...values }
}

/** The job and every request: settles one clan's escaped boss, in its own transaction. */
export async function settleClan(db: Db, clanId: string, now = new Date()) {
  await db.transaction(async (tx) => {
    const [clan] = await tx.select().from(clans).where(eq(clans.id, clanId)).for('update')
    if (!clan) return
    const row = await readMissions(tx, clanId)
    if (row?.bossIndex === null || !row || row.endsAt! > now) return
    await settleLocked(tx, clanId, await lockMissions(tx, clanId), now)
  })
}

export async function settleMissions(db: Db, now = new Date()) {
  const due = await db
    .select({ clanId: clanMissions.clanId })
    .from(clanMissions)
    .where(and(isNotNull(clanMissions.bossIndex), lte(clanMissions.endsAt, now)))
  for (const { clanId } of due) await settleClan(db, clanId, now)
}

const canStartRole = (ctx: { role: string }) => ctx.role === 'leader'

export function missionsView(
  row: MissionRow | undefined,
  characterId: string,
  role: string,
  now = new Date(),
): ClanMissionsView {
  const boss = row && row.bossIndex !== null ? row : null
  const scheduled = boss && boss.startAt! > now
  return {
    unlockedBoss: row?.unlockedBoss ?? 0,
    activeBoss:
      boss && !scheduled
        ? {
            bossIndex: boss.bossIndex!,
            currentHp: Math.max(0, boss.hp!),
            maxHp: boss.maxHp!,
            endsAt: boss.endsAt!.toISOString(),
            myAttacks: boss.attacks[characterId] ?? 0,
            minimumAttacks: Math.ceil(100 / P.damagePercentPerAttack),
          }
        : null,
    scheduledBoss: scheduled
      ? { bossIndex: boss.bossIndex!, startAt: boss.startAt!.toISOString() }
      : null,
    battlesUsedToday: startsToday(row, now),
    maxDailyBattles: RULES.maxDailyBattles,
    freeBattleEntries: row?.freeEntries ?? 0,
    costs: P.costs,
    canStart: canStartRole({ role }),
    damagePercentPerAttack: P.damagePercentPerAttack,
    bossActiveMinutes: RULES.bossActiveMinutes,
    maxScheduleHours: RULES.maxScheduleHours,
    lastOutcome: row?.lastOutcome ?? null,
  }
}

/** Start Battle / Free Battle / Schedule (leader). */
export async function startBoss(
  ctx: ClanContext,
  bossIndex: number,
  delayHours: number,
  now: Date,
) {
  const { tx, clan } = ctx
  if (!canStartRole(ctx.member)) throw new HttpError(403, 'forbidden', 'Leader Only')
  const row = await settleLocked(tx, clan.id, await lockMissions(tx, clan.id), now)
  if (row.bossIndex !== null) throw bad('boss_running', 'A boss is already summoned.')
  if (bossIndex > row.unlockedBoss) throw bad('boss_locked', 'Defeat the previous boss first.')
  const used = startsToday(row, now)
  let paid = { stones: 0, giftCertificates: 0, free: true }
  let counters: Partial<MissionRow> = { freeEntries: row.freeEntries - 1 }
  if (row.freeEntries <= 0) {
    if (used >= RULES.maxDailyBattles) throw bad('no_battles', 'No battles left today.')
    const cost = P.costs[bossIndex]!
    // Relative, so a refund the settle above just made is kept.
    const [taken] = await tx
      .update(clans)
      .set({
        stone: sql`${clans.stone} - ${cost.stones}`,
        giftCoupon: sql`${clans.giftCoupon} - ${cost.giftCertificates}`,
      })
      .where(
        and(
          eq(clans.id, clan.id),
          gte(clans.stone, cost.stones),
          gte(clans.giftCoupon, cost.giftCertificates),
        ),
      )
      .returning({ id: clans.id })
    if (!taken) throw bad('not_enough', 'Not enough Stones or Gift Certificates in clan storage.')
    paid = { ...cost, free: false }
    counters = { battlesDay: utcDay(now), battlesUsed: used + 1 }
  }
  const startAt = new Date(now.getTime() + delayHours * HOUR_MS)
  const maxHp = bossMaxHp(bossIndex)
  await save(tx, clan.id, {
    ...counters,
    bossIndex,
    startAt,
    endsAt: new Date(startAt.getTime() + RULES.bossActiveMinutes * MINUTE_MS),
    hp: maxHp,
    maxHp,
    paid,
    attacks: {},
  })
  await logClan(
    tx,
    clan.id,
    ctx.me.name,
    'Clan Mission',
    `${delayHours > 0 ? 'Scheduled' : 'Started'} ${CLAN_MISSION_BOSSES[bossIndex]!.name}${
      paid.free ? ' (Free Entry)' : ''
    }${delayHours > 0 ? ` in ${delayHours} h` : ''}`,
  )
}

/** Cancel the scheduled boss: its start is refunded. */
export async function cancelScheduled(ctx: ClanContext, now: Date) {
  if (!canStartRole(ctx.member)) throw new HttpError(403, 'forbidden', 'Leader Only')
  const row = await lockMissions(ctx.tx, ctx.clan.id)
  if (row.bossIndex === null || row.startAt! <= now)
    throw bad('not_scheduled', 'No boss is scheduled.')
  await save(ctx.tx, ctx.clan.id, { ...NO_BOSS, ...(await refund(ctx.tx, ctx.clan.id, row)) })
  await logClan(ctx.tx, ctx.clan.id, ctx.me.name, 'Clan Mission', 'Cancelled the scheduled boss')
}

async function requireActive(ctx: ClanContext, now: Date) {
  const row = await settleLocked(ctx.tx, ctx.clan.id, await lockMissions(ctx.tx, ctx.clan.id), now)
  if (!isActive(row, now)) throw bad('no_boss', 'No boss to attack right now.')
  return row
}

/** Click the boss: one fight at full HP and MP against one slice of its HP. */
export async function attackBoss(ctx: ClanContext, now: Date) {
  const { tx, me, clan } = ctx
  const row = await requireActive(ctx, now)
  const bossIndex = row.bossIndex!
  const boss = bossFighter(bossIndex)
  const startHp = Math.min(row.hp!, boss.maxHp)
  const player = await playerFighter(tx, me)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [{ ...boss, hp: startHp }],
    seed: newSeed(),
  })
  const damage = Math.max(0, startHp - Math.max(0, replay.fighters[1]!.hp))
  const hp = row.hp! - damage
  const attacks = { ...row.attacks, [me.id]: (row.attacks[me.id] ?? 0) + 1 }
  const defeated = hp <= 0
  if (!defeated) await save(tx, clan.id, { hp, attacks })
  else await defeat(tx, clan, row, now)
  await logClan(
    tx,
    clan.id,
    me.name,
    'Clan Mission',
    `${defeated ? 'Defeated' : 'Hit'} ${boss.name} for ${damage.toLocaleString('en-US')}`,
  )
  return { replay, npcId: P.npcIds[bossIndex]!, damage, defeated }
}

async function defeat(tx: Tx, clan: ClanRow, row: MissionRow, now: Date) {
  const bossIndex = row.bossIndex!
  const reward = P.rewards[bossIndex]!
  await tx
    .update(clans)
    .set({
      stone: sql`${clans.stone} + ${reward.stone}`,
      giftCoupon: sql`${clans.giftCoupon} + ${reward.giftCoupon}`,
    })
    .where(eq(clans.id, clan.id))
  await addClanExp(tx, clan, reward.clanExp)
  await save(tx, clan.id, {
    ...NO_BOSS,
    unlockedBoss: Math.min(
      CLAN_MISSION_BOSSES.length - 1,
      Math.max(row.unlockedBoss, bossIndex + 1),
    ),
    lastOutcome: { bossIndex, defeated: true, at: now.toISOString() },
  })
}

/** The + button: 20 more seconds for 150 Gold of the caller's own. */
export async function extendBoss(ctx: ClanContext, now: Date) {
  const row = await requireActive(ctx, now)
  await pay(ctx, 'gold', RULES.extendGold)
  await save(ctx.tx, ctx.clan.id, {
    endsAt: new Date(row.endsAt!.getTime() + RULES.extendSeconds * 1000),
  })
}
