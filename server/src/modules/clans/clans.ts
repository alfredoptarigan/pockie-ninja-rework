// Clan rules: Reborn's Clan Browser, Create Clan, Manage (roles), Applications, Quit and the clan
// storage's currency donations and Withdraw Currency (shared/src/schemas/clans.ts).
//
// Lock order of every clan transaction: the characters it debits or credits (id ascending, the
// caller among them), then the clan row. Every membership or role change holds the clan row, so the
// roster read after taking it is stable; no transaction takes a character lock after a clan lock,
// so they cannot deadlock each other.
import {
  CLAN_CREATE_COST,
  CLAN_BROWSER_PAGE_SIZE,
  CLAN_MAX_MEMBERS,
  CLAN_MIN_LEVEL,
  canClanAction,
  contributionPoints,
  isClanOfficer,
  type ClanApplicationsView,
  type ClanCreateInfo,
  type ClanCurrency,
  type ClanListView,
  type ClanMemberView,
  type ClanRole,
  type ClanView,
  type ClanWithdrawInput,
  type Notice,
} from '@pockie/shared'
import { and, asc, count, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { characters, clanApplications, clanMembers, clans, users } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'
import { isOnline, type Outbox } from '../social/players.js'

type CharacterRow = typeof characters.$inferSelect
type ClanRow = typeof clans.$inferSelect
type MemberRow = typeof clanMembers.$inferSelect

const DAY_MS = 86_400_000
const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, vice: 1, officer: 2, member: 3 }

const fail = (status: number, code: string, message: string) => new HttpError(status, code, message)
const noClan = () => fail(404, 'no_clan', 'You are not in a clan.')
const forbidden = () => fail(403, 'forbidden', 'Your clan position does not allow that.')
const notEnough = () => fail(400, 'not_enough', 'Not enough currency.')
const unknownMember = () => fail(404, 'unknown_member', 'That ninja is not in your clan.')

function requireLevel(character: CharacterRow) {
  if (character.level < CLAN_MIN_LEVEL)
    throw fail(403, 'level_too_low', `Clans open at level ${CLAN_MIN_LEVEL}.`)
}

const memberOf = async (db: Tx | Db, characterId: string) =>
  (await db.select().from(clanMembers).where(eq(clanMembers.characterId, characterId)))[0]

async function requireNoClan(db: Tx | Db, characterId: string) {
  if (await memberOf(db, characterId)) throw fail(400, 'in_clan', 'Leave your clan first.')
}

/** Locks the characters in id order and returns them by id. */
async function lockCharacters(tx: Tx, ids: string[]) {
  const rows = await tx
    .select()
    .from(characters)
    .where(inArray(characters.id, [...new Set(ids)]))
    .orderBy(characters.id)
    .for('update')
  return new Map(rows.map((row) => [row.id, row]))
}

const roster = (db: Tx | Db, clanId: string) =>
  db.select().from(clanMembers).where(eq(clanMembers.clanId, clanId))

export interface ClanContext {
  tx: Tx
  me: CharacterRow
  /** Every locked character (the caller and `others`). */
  chars: Map<string, CharacterRow>
  clan: ClanRow
  member: MemberRow
  members: MemberRow[]
  outbox: Outbox
}

/**
 * Locks the caller and the characters `others` names (id order), then the caller's clan, and reads
 * the roster under the clan lock.
 */
export async function lockClanOf(
  tx: Tx,
  callerId: string,
  others: (clanId: string) => Promise<string[]> | string[] = () => [],
): Promise<ClanContext> {
  const before = await memberOf(tx, callerId)
  if (!before) throw noClan()
  const chars = await lockCharacters(tx, [callerId, ...(await others(before.clanId))])
  const [clan] = await tx
    .select()
    .from(clans)
    .where(and(eq(clans.id, before.clanId), isNull(clans.disbandedAt)))
    .for('update')
  const members = clan ? await roster(tx, clan.id) : []
  const member = members.find((m) => m.characterId === callerId)
  if (!clan || !member) throw noClan()
  return { tx, me: chars.get(callerId)!, chars, clan, member, members, outbox: [] }
}

/** Tells these characters their clan changed (refetch), with an optional chat line. */
function tell(ctx: ClanContext, ids: string[], clanId: string | null, message?: string) {
  const notice: Notice = { kind: 'clanChanged', clanId, ...(message && { message }) }
  for (const id of ids) ctx.outbox.push([id, notice])
}
const everyone = (ctx: ClanContext) => ctx.members.map((m) => m.characterId)

// --- Views -------------------------------------------------------------------------------------

export async function createInfo(db: Db, me: CharacterRow): Promise<ClanCreateInfo> {
  const [founded] = await db
    .select({ id: clans.id })
    .from(clans)
    .where(eq(clans.founderId, me.id))
    .limit(1)
  return {
    free: !founded,
    cost: CLAN_CREATE_COST,
    minLevel: CLAN_MIN_LEVEL,
    levelOk: me.level >= CLAN_MIN_LEVEL,
  }
}

const memberCount = sql<number>`(select count(*)::int from ${clanMembers} where ${clanMembers.clanId} = ${clans.id})`

/** Clan Browser: by level, then size, then age; `q` matches part of the name. */
export async function listClans(
  db: Db,
  meId: string,
  { page, q }: { page: number; q?: string },
): Promise<ClanListView> {
  // q is letters and digits only (clanListQuerySchema), so it holds no LIKE wildcards.
  const where = and(
    isNull(clans.disbandedAt),
    q ? like(clans.nameLower, `%${q.toLowerCase()}%`) : undefined,
  )
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(clans).where(where)
  const rows = await db
    .select({
      id: clans.id,
      name: clans.name,
      level: clans.level,
      members: memberCount,
      leader: characters.name,
      applied: sql<boolean>`exists (select 1 from ${clanApplications} where ${clanApplications.clanId} = ${clans.id} and ${clanApplications.characterId} = ${meId})`,
    })
    .from(clans)
    .leftJoin(clanMembers, and(eq(clanMembers.clanId, clans.id), eq(clanMembers.role, 'leader')))
    .leftJoin(characters, eq(characters.id, clanMembers.characterId))
    .where(where)
    .orderBy(desc(clans.level), desc(memberCount), asc(clans.createdAt), asc(clans.id))
    .limit(CLAN_BROWSER_PAGE_SIZE)
    .offset((page - 1) * CLAN_BROWSER_PAGE_SIZE)
  return {
    clans: rows.map((row) => ({ ...row, leader: row.leader ?? '' })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / CLAN_BROWSER_PAGE_SIZE)),
  }
}

const weeklyOf = (member: Pick<MemberRow, 'week' | 'weeklyPoints'>, now: Date) =>
  member.week === weekStart(now) ? member.weeklyPoints : 0

/** The caller's clan with its roster, or null. */
export async function clanView(db: Tx | Db, characterId: string): Promise<ClanView | null> {
  const mine = await memberOf(db, characterId)
  if (!mine) return null
  const [clan] = await db.select().from(clans).where(eq(clans.id, mine.clanId))
  if (!clan || clan.disbandedAt) return null
  const rows = await db
    .select({
      member: clanMembers,
      name: characters.name,
      level: characters.level,
      lastLoginAt: users.lastLoginAt,
    })
    .from(clanMembers)
    .innerJoin(characters, eq(characters.id, clanMembers.characterId))
    .innerJoin(users, eq(users.id, characters.userId))
    .where(eq(clanMembers.clanId, clan.id))
  const now = new Date()
  const members: ClanMemberView[] = rows
    .sort(
      (a, b) =>
        ROLE_ORDER[a.member.role] - ROLE_ORDER[b.member.role] ||
        a.member.joinedAt.getTime() - b.member.joinedAt.getTime(),
    )
    .map(({ member, name, level, lastLoginAt }) => {
      const online = isOnline(member.characterId)
      return {
        characterId: member.characterId,
        name,
        level,
        role: member.role,
        weeklyPoints: weeklyOf(member, now),
        totalPoints: member.totalPoints,
        online,
        // ponytail: last login, not last seen; sessions.last_seen_at if "Offline" must be exact.
        offlineDays:
          online || !lastLoginAt ? 0 : Math.floor((now.getTime() - lastLoginAt.getTime()) / DAY_MS),
      }
    })
  return {
    id: clan.id,
    name: clan.name,
    level: clan.level,
    notice: clan.notice,
    stone: clan.stone,
    gold: clan.gold,
    giftCoupon: clan.giftCoupon,
    myRole: mine.role,
    members,
  }
}

export async function applicationsView(db: Db, callerId: string): Promise<ClanApplicationsView> {
  const mine = await memberOf(db, callerId)
  if (!mine) throw noClan()
  if (!isClanOfficer(mine.role)) throw forbidden()
  const applications = await db
    .select({ characterId: characters.id, name: characters.name, level: characters.level })
    .from(clanApplications)
    .innerJoin(characters, eq(characters.id, clanApplications.characterId))
    .where(eq(clanApplications.clanId, mine.clanId))
    .orderBy(asc(clanApplications.createdAt))
  return { applications }
}

// --- Joining -----------------------------------------------------------------------------------

function uniqueViolation(error: unknown) {
  const pg = (error as { cause?: { code?: string; constraint_name?: string } }).cause
  return pg?.code === '23505' ? pg.constraint_name : undefined
}

/** Create Clan: the founder leads; the first clan is free, later ones cost Gift Certificates. */
export async function createClan(tx: Tx, me: CharacterRow, name: string) {
  requireLevel(me)
  await requireNoClan(tx, me.id)
  const [founded] = await tx
    .select({ id: clans.id })
    .from(clans)
    .where(eq(clans.founderId, me.id))
    .limit(1)
  if (founded) {
    if (me.giftCoupon < CLAN_CREATE_COST) throw notEnough()
    await tx
      .update(characters)
      .set({ giftCoupon: me.giftCoupon - CLAN_CREATE_COST })
      .where(eq(characters.id, me.id))
  }
  // A taken name aborts the transaction, which also undoes the charge above.
  const [clan] = await tx
    .insert(clans)
    .values({ name, founderId: me.id })
    .returning()
    .catch((error: unknown) => {
      if (uniqueViolation(error) === 'clans_name_lower_key')
        throw fail(409, 'name_taken', 'That clan name is already taken.')
      throw error
    })
  await tx.insert(clanMembers).values({ characterId: me.id, clanId: clan!.id, role: 'leader' })
  await tx.delete(clanApplications).where(eq(clanApplications.characterId, me.id))
}

/** Clan Browser "Apply": one pending application per clan; fullness is checked again on accept. */
export async function applyToClan(tx: Tx, me: CharacterRow, clanId: string) {
  requireLevel(me)
  await requireNoClan(tx, me.id)
  const [clan] = await tx
    .select({ id: clans.id, members: memberCount })
    .from(clans)
    .where(and(eq(clans.id, clanId), isNull(clans.disbandedAt)))
  if (!clan) throw fail(404, 'unknown_clan', 'That clan no longer exists.')
  if (clan.members >= CLAN_MAX_MEMBERS) throw fail(400, 'clan_full', 'That clan is full.')
  await tx.insert(clanApplications).values({ clanId, characterId: me.id }).onConflictDoNothing()
}

async function takeApplication(ctx: ClanContext, applicantId: string) {
  if (!isClanOfficer(ctx.member.role)) throw forbidden()
  const [taken] = await ctx.tx
    .delete(clanApplications)
    .where(
      and(eq(clanApplications.clanId, ctx.clan.id), eq(clanApplications.characterId, applicantId)),
    )
    .returning()
  if (!taken) throw fail(404, 'no_application', 'That application is gone.')
}

/** Applications "Accept" (leader, vice or officer). The applicant is locked with the caller. */
export async function acceptApplication(ctx: ClanContext, applicantId: string) {
  await takeApplication(ctx, applicantId)
  if (!ctx.chars.has(applicantId)) throw fail(404, 'no_application', 'That application is gone.')
  if (await memberOf(ctx.tx, applicantId))
    throw fail(400, 'in_clan', 'That ninja already joined a clan.')
  if (ctx.members.length >= CLAN_MAX_MEMBERS) throw fail(400, 'clan_full', 'Your clan is full.')
  await ctx.tx.insert(clanMembers).values({ characterId: applicantId, clanId: ctx.clan.id })
  await ctx.tx.delete(clanApplications).where(eq(clanApplications.characterId, applicantId))
  tell(ctx, everyone(ctx), ctx.clan.id)
  tell(ctx, [applicantId], ctx.clan.id, `You joined the clan ${ctx.clan.name}.`)
}

export const rejectApplication = takeApplication

// --- Officer actions ---------------------------------------------------------------------------

export async function setNotice(ctx: ClanContext, notice: string) {
  if (ctx.member.role !== 'leader') throw forbidden()
  await ctx.tx.update(clans).set({ notice }).where(eq(clans.id, ctx.clan.id))
}

function target(ctx: ClanContext, characterId: string) {
  const row = ctx.members.find((m) => m.characterId === characterId)
  if (!row) throw unknownMember()
  if (row.characterId === ctx.me.id) throw forbidden()
  return row
}

const setRoleOf = (tx: Tx, characterId: string, role: ClanRole) =>
  tx.update(clanMembers).set({ role }).where(eq(clanMembers.characterId, characterId))

/** Manage "Vice" (replaces the current vice), "Officer" and "Remove" (back to member). */
export async function setRole(
  ctx: ClanContext,
  characterId: string,
  role: 'vice' | 'officer' | 'member',
) {
  const row = target(ctx, characterId)
  const officers = ctx.members.filter((m) => m.role === 'officer').length
  if (!canClanAction(ctx.member.role, row.role, role, officers)) throw forbidden()
  const vice = ctx.members.find((m) => m.role === 'vice')
  if (role === 'vice' && vice) await setRoleOf(ctx.tx, vice.characterId, 'member')
  await setRoleOf(ctx.tx, characterId, role)
  tell(ctx, everyone(ctx), ctx.clan.id)
}

export async function kick(ctx: ClanContext, characterId: string) {
  const row = target(ctx, characterId)
  if (!canClanAction(ctx.member.role, row.role, 'kick', 0)) throw forbidden()
  await ctx.tx.delete(clanMembers).where(eq(clanMembers.characterId, characterId))
  tell(
    ctx,
    everyone(ctx).filter((id) => id !== characterId),
    ctx.clan.id,
  )
  tell(ctx, [characterId], null, `You were removed from the clan ${ctx.clan.name}.`)
}

/**
 * Quit. A leader alone disbands the clan; a leader with members hands the lead to the vice, else
 * the longest-standing officer, else the longest-standing member.
 */
export async function leave(ctx: ClanContext) {
  const { tx, clan, me } = ctx
  await tx.delete(clanMembers).where(eq(clanMembers.characterId, me.id))
  const rest = ctx.members
    .filter((m) => m.characterId !== me.id)
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime(),
    )
  if (ctx.member.role === 'leader') {
    const heir = rest[0]
    if (!heir) {
      await tx.update(clans).set({ disbandedAt: new Date() }).where(eq(clans.id, clan.id))
      await tx.delete(clanApplications).where(eq(clanApplications.clanId, clan.id))
      return
    }
    await setRoleOf(tx, heir.characterId, 'leader')
    tell(ctx, [heir.characterId], clan.id, `You now lead the clan ${clan.name}.`)
  }
  tell(
    ctx,
    rest.map((m) => m.characterId),
    clan.id,
  )
}

// --- Treasury ----------------------------------------------------------------------------------

const setCurrency = (currency: ClanCurrency, value: number) =>
  ({ [currency]: value }) as Partial<Record<ClanCurrency, number>>

/** Donate Stones / Gold / Gift Certificates: from the member to the clan, for contribution. */
export async function donate(ctx: ClanContext, currency: ClanCurrency, amount: number) {
  const { tx, me, clan, member } = ctx
  if (me[currency] < amount) throw notEnough()
  await tx
    .update(characters)
    .set(setCurrency(currency, me[currency] - amount))
    .where(eq(characters.id, me.id))
  await tx
    .update(clans)
    .set(setCurrency(currency, clan[currency] + amount))
    .where(eq(clans.id, clan.id))
  const points = contributionPoints(currency, amount)
  const now = new Date()
  await tx
    .update(clanMembers)
    .set({
      week: weekStart(now),
      weeklyPoints: weeklyOf(member, now) + points,
      totalPoints: member.totalPoints + points,
    })
    .where(eq(clanMembers.characterId, me.id))
}

/** The characters a withdrawal credits, to lock before the clan. */
export const withdrawTargets = (
  input: ClanWithdrawInput,
  callerId: string,
  clanId: string,
  db: Tx,
) =>
  input.mode === 'member'
    ? [input.characterId]
    : input.mode === 'all'
      ? roster(db, clanId).then((rows) => rows.map((m) => m.characterId))
      : [callerId]

/** Withdraw Currency (leader only): to self, to one member, or split equally among all. */
export async function withdraw(ctx: ClanContext, input: ClanWithdrawInput) {
  const { tx, clan, member, members, chars } = ctx
  if (member.role !== 'leader') throw forbidden()
  const { currency, amount } = input
  let payees: string[]
  let each = amount
  if (input.mode === 'self') payees = [ctx.me.id]
  else if (input.mode === 'member') {
    if (!members.some((m) => m.characterId === input.characterId)) throw unknownMember()
    payees = [input.characterId]
  } else {
    payees = members.map((m) => m.characterId)
    // Someone joined between the roster read and the locks: their row is not locked.
    if (payees.some((id) => !chars.has(id)))
      throw fail(409, 'conflict', 'The clan changed. Please try again.')
    each = Math.floor(amount / payees.length)
    if (each === 0) throw fail(400, 'too_small', 'The amount is too small to split.')
  }
  const total = each * payees.length
  if (clan[currency] < total) throw notEnough()
  await tx
    .update(clans)
    .set(setCurrency(currency, clan[currency] - total))
    .where(eq(clans.id, clan.id))
  for (const id of payees) {
    const row = chars.get(id)!
    await tx
      .update(characters)
      .set(setCurrency(currency, row[currency] + each))
      .where(eq(characters.id, id))
  }
}
