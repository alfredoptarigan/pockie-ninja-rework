// Clans (Reborn's Clan, Clan Browser, Create Clan, Manage, Applications and the clan storage's
// currency donations and Withdraw Currency; data/reborn-raw/audit-2026-10-14) under
// /api/game/clans. Clan Wars, Protection, Training and the other Events tiles are not built.
import { z } from 'zod'
import type { Character } from './game.js'

/** The bottom-bar Clan icon and every clan action need level 30. */
export const CLAN_MIN_LEVEL = 30
/** Members "n/15". */
export const CLAN_MAX_MEMBERS = 15
/** Manage footer "Officers: n/3". */
export const CLAN_MAX_OFFICERS = 3
/** Notice textarea "n/120". */
export const CLAN_NOTICE_MAX = 120
/** Create Clan: 4-10 letters and digits, spaces stripped. */
export const CLAN_NAME_PATTERN = /^[A-Za-z0-9]{4,10}$/
/**
 * Gift Certificates a second (or later) clan costs; the first is free. Reborn's server sends the
 * amount (`clanCreateInfo.cost`) and main.js does not hold it, so this number is ours.
 */
export const CLAN_CREATE_COST = 500
/** Clan Browser rows per page: floor((330 - 110) / 22). */
export const CLAN_BROWSER_PAGE_SIZE = 10
/** One donation or withdrawal moves at most this much. */
export const CLAN_AMOUNT_MAX = 2_000_000_000

export const CLAN_ROLES = ['leader', 'vice', 'officer', 'member'] as const
export type ClanRole = (typeof CLAN_ROLES)[number]
export const CLAN_ROLE_TITLES: Record<ClanRole, string> = {
  leader: 'Leader',
  vice: 'Vice-Leader',
  officer: 'Officer',
  member: 'Member',
}

/** Treasury currencies, named like the character's: Stones, Gold, Gift Certificates. */
export const CLAN_CURRENCIES = ['stone', 'gold', 'giftCoupon'] as const
export type ClanCurrency = (typeof CLAN_CURRENCIES)[number]

/**
 * Contribution points of a donation, at Reborn's Picnic rates (150,000 Stones = 10 points,
 * 20 Gift Certificates = 30 points). Gold uses Reborn's 1 Gold = 50 Gift Certificates (Level Up
 * Tree: 250 GC or 5 Gold), so 75 points.
 */
export function contributionPoints(currency: ClanCurrency, amount: number) {
  if (currency === 'stone') return Math.floor(amount / 15_000)
  if (currency === 'giftCoupon') return Math.floor((amount * 3) / 2)
  return amount * 75
}

/** Strips spaces like Reborn's input, then checks the pattern with its two messages. */
export const clanNameSchema = z
  .string()
  .transform((name) => name.replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .min(4, 'Minimum 4 characters.')
      .max(10, 'Maximum 10 characters.')
      .regex(CLAN_NAME_PATTERN, 'Invalid characters (A-Z 0-9).'),
  )

export const clanCreateSchema = z.object({ name: clanNameSchema }).strict()
export const clanListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    // Clan names are letters and digits, so the search is too (no LIKE wildcards reach SQL).
    q: z
      .string()
      .trim()
      .max(10)
      .regex(/^[A-Za-z0-9]*$/, 'Letters and digits only.')
      .optional(),
  })
  .strict()
export const clanRefSchema = z.object({ clanId: z.uuid() }).strict()
export const clanMemberRefSchema = z.object({ characterId: z.uuid() }).strict()
export const clanNoticeSchema = z
  .object({ notice: z.string().trim().max(CLAN_NOTICE_MAX, 'At most 120 characters.') })
  .strict()
export const clanSetRoleSchema = z
  .object({ characterId: z.uuid(), role: z.enum(['vice', 'officer', 'member']) })
  .strict()
const amountSchema = z.number().int().positive().max(CLAN_AMOUNT_MAX)
export const clanDonateSchema = z
  .object({ currency: z.enum(CLAN_CURRENCIES), amount: amountSchema })
  .strict()
export const clanWithdrawSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('self'), currency: z.enum(CLAN_CURRENCIES), amount: amountSchema }),
  z.object({
    mode: z.literal('member'),
    currency: z.enum(CLAN_CURRENCIES),
    amount: amountSchema,
    characterId: z.uuid(),
  }),
  z.object({ mode: z.literal('all'), currency: z.enum(CLAN_CURRENCIES), amount: amountSchema }),
])

export type ClanCreateInput = z.input<typeof clanCreateSchema>
export type ClanListQuery = z.input<typeof clanListQuerySchema>
export type ClanSetRoleInput = z.input<typeof clanSetRoleSchema>
export type ClanDonateInput = z.input<typeof clanDonateSchema>
export type ClanWithdrawInput = z.input<typeof clanWithdrawSchema>

/** One Clan Browser row. */
export interface ClanListRow {
  id: string
  name: string
  level: number
  members: number
  leader: string
  /** I have a pending application to it. */
  applied: boolean
}

export interface ClanListView {
  clans: ClanListRow[]
  total: number
  page: number
  pages: number
}

export interface ClanCreateInfo {
  /** The first clan a ninja founds is free. */
  free: boolean
  cost: number
  minLevel: number
  levelOk: boolean
}

export interface ClanMemberView {
  characterId: string
  name: string
  level: number
  role: ClanRole
  /** Contribution points this week (Monday 00:00 UTC). */
  weeklyPoints: number
  /** Contribution points since joining. */
  totalPoints: number
  online: boolean
  /** Whole days since the last login, 0 when online. */
  offlineDays: number
}

export interface ClanView {
  id: string
  name: string
  level: number
  notice: string
  /** Treasury (clan storage currencies). */
  stone: number
  gold: number
  giftCoupon: number
  myRole: ClanRole
  /** Leader first, then by role, then by join time. */
  members: ClanMemberView[]
}

export interface MyClanView {
  clan: ClanView | null
}

/** Every clan action answers with the fresh clan and character (currencies may have moved). */
export interface ClanActionResult extends MyClanView {
  character: Character
}

export interface ClanApplicationView {
  characterId: string
  name: string
  level: number
}

export interface ClanApplicationsView {
  applications: ClanApplicationView[]
}

/** Officer actions on a member row of the Manage window (Reborn's `Vh` rules). */
export type ClanRoleAction = 'vice' | 'officer' | 'member' | 'kick'

/**
 * Whether `actor` may do `action` to `target` (never to themselves or the leader):
 * Vice: leader on a non-vice. Officer: leader or vice on a member, below the officer limit.
 * Remove (to member): leader on a vice or officer, vice on an officer. Kick: leader on anyone,
 * vice on a member or officer. Shared so the Manage window shows the same buttons.
 */
export function canClanAction(
  actor: ClanRole,
  target: ClanRole,
  action: ClanRoleAction,
  officers: number,
) {
  if (target === 'leader') return false
  const lead = actor === 'leader'
  const vice = actor === 'vice'
  switch (action) {
    case 'vice':
      return lead && target !== 'vice'
    case 'officer':
      return (lead || vice) && target === 'member' && officers < CLAN_MAX_OFFICERS
    case 'member':
      return (lead && (target === 'vice' || target === 'officer')) || (vice && target === 'officer')
    case 'kick':
      return lead || (vice && (target === 'member' || target === 'officer'))
  }
}

/** Leader, Vice-Leader and Officers see Manage and Applications. */
export const isClanOfficer = (role: ClanRole) => role !== 'member'
