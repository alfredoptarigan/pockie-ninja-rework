// The clan Events tab's Training, Protection and Clan Missions and the Clan window's Logs tab
// (data/reborn-raw/audit-2026-10-14: reborn-windows-A-L.md "Clan Protection", "Confirm your
// donation?", "Clan window ... Logs tab"; reborn-windows-M-Z-hud.md "Training"; main.js @2815000
// Training / Protection, @2927000 Clan Missions, @2885700 Logs). Routes under
// /api/game/clan-events. Days reset at 00:00 UTC (Reborn: Training at UTC midnight too).
import { z } from 'zod'
import type { Character } from './game.js'
import type { ClanLevelView } from './home.js'

// --- Training (Reborn's numbers, locale ui__*_confirm) -------------------------------------------

export const TRAINING_COURSES = ['primary', 'advanced', 'final'] as const
export type TrainingCourse = (typeof TRAINING_COURSES)[number]

/**
 * Each course once per day: its cost, then character EXP, Bankai EXP and Clan Points ("Clan
 * Honor" in Reborn's text is the same Clan Points as Ninja Garden's).
 */
export const TRAINING_RULES: Record<
  TrainingCourse,
  {
    label: string
    medal: string
    currency: 'stone' | 'giftCoupon'
    cost: number
    exp: number
    bankaiExp: number
    clanPoints: number
    confirm: string
  }
> = {
  primary: {
    label: "Beginner's Course",
    medal: 'Primary',
    currency: 'stone',
    cost: 30_000,
    exp: 850,
    bankaiExp: 0,
    clanPoints: 100,
    confirm: 'Spend 30,000 Stones to gain 850 Experience and 100 Clan Points?',
  },
  advanced: {
    label: 'Advanced Course',
    medal: 'Advanced',
    currency: 'giftCoupon',
    cost: 200,
    exp: 0,
    bankaiExp: 3_500,
    clanPoints: 200,
    confirm:
      'Spend 200 Gift Certificates to gain 3,500 Bankai Experience and 200 Clan Honor Points?',
  },
  final: {
    label: 'Final Course',
    medal: 'Final',
    currency: 'giftCoupon',
    cost: 450,
    exp: 0,
    bankaiExp: 10_000,
    clanPoints: 1_000,
    confirm:
      'Spend 450 Gift Certificates to gain 10,000 Bankai Experience and 1,000 Clan Honor Points?',
  },
}

export const trainingDonateSchema = z.object({ course: z.enum(TRAINING_COURSES) }).strict()
export type TrainingDonateInput = z.input<typeof trainingDonateSchema>

export interface TrainingView {
  donated: Record<TrainingCourse, boolean>
  /** Next 00:00 UTC. */
  resetsAt: string
}

export interface TrainingResult {
  training: TrainingView
  course: TrainingCourse
  clan: ClanLevelView
  character: Character
}

// --- Protection ---------------------------------------------------------------------------------

/** Reborn: `clan.protection.fightsRemaining` defaults to 3 a day; the boss is avatar 10018. */
export const PROTECTION_RULES = { fightsPerDay: 3, bossName: 'Bloodboil Demon' } as const

/**
 * PLACEHOLDERS (Reborn keeps them on its server): what a Protection fight pays. The boss is our
 * Bloodboil Demon (TicketBossNpc n32057xx) at the ninja's level rounded down to 5 (5-100).
 */
export const PROTECTION_PLACEHOLDERS = {
  win: { clanPoints: 150, bankaiExp: 1_000 },
  loss: { clanPoints: 30, bankaiExp: 0 },
} as const

export interface ProtectionView {
  fightsRemaining: number
  fightsPerDay: number
  resetsAt: string
  boss: { npcId: string; name: string; level: number }
  rewards: typeof PROTECTION_PLACEHOLDERS
}

export interface ProtectionFightResult<R = unknown> {
  replay: R
  won: boolean
  npcId: string
  reward: { clanPoints: number; bankaiExp: number }
  protection: ProtectionView
  character: Character
}

// --- Logs ---------------------------------------------------------------------------------------

export interface ClanLogView {
  id: string
  at: string
  actor: string
  action: string
  details: string
}

export interface ClanLogsView {
  logs: ClanLogView[]
}

// --- Clan Missions (main.js `qh` @2927000) -------------------------------------------------------

/** The 15 bosses on the map, in order; x / y are percents of the map. */
export const CLAN_MISSION_BOSSES = [
  { name: 'Shadow Grunt', iconId: 10001, x: 10, y: 78 },
  { name: 'Rogue Scout', iconId: 10006, x: 30, y: 78 },
  { name: 'Dark Blade', iconId: 10011, x: 50, y: 78 },
  { name: 'Storm Fang', iconId: 10014, x: 70, y: 78 },
  { name: 'Venom Striker', iconId: 10018, x: 90, y: 78 },
  { name: 'Iron Golem', iconId: 10082, x: 90, y: 48 },
  { name: 'Cursed Ronin', iconId: 31021, x: 70, y: 48 },
  { name: 'Flame Warden', iconId: 31024, x: 50, y: 48 },
  { name: 'Frost Demon', iconId: 31025, x: 30, y: 48 },
  { name: 'Thunder Beast', iconId: 31044, x: 10, y: 48 },
  { name: 'Blood Reaper', iconId: 32052, x: 10, y: 18 },
  { name: 'Void Walker', iconId: 32053, x: 30, y: 18 },
  { name: 'Soul Devourer', iconId: 31051, x: 50, y: 18 },
  { name: 'Chaos Lord', iconId: 31050, x: 70, y: 18 },
  { name: 'Nine Tails', iconId: 9900075, x: 90, y: 18 },
] as const

/** Reborn's client defaults and Info text: 3 starts a day, 12 h schedule, 10 min, +20 s for 150 Gold. */
export const CLAN_MISSION_RULES = {
  maxDailyBattles: 3,
  maxScheduleHours: 12,
  bossActiveMinutes: 10,
  extendSeconds: 20,
  extendGold: 150,
} as const

/**
 * PLACEHOLDERS (Reborn keeps them on its server): each boss's start cost from clan storage, the
 * fighter it is (our TicketBossNpc art and stats, level 30-100), the per-attack damage cap, and
 * what a defeat pays into clan storage (Reborn drops items into clan storage; ours has currencies
 * only).
 */
export const CLAN_MISSION_PLACEHOLDERS = {
  costs: CLAN_MISSION_BOSSES.map((_, i) => ({
    stones: 1_000_000 * (i + 1),
    giftCertificates: i < 5 ? 0 : 1_000 * (i - 4),
  })),
  npcIds: [
    'n310511',
    'n510026',
    'n310730',
    'n310870',
    'n310980',
    'n311090',
    'n311200',
    'n311310',
    'n3102113',
    'n3102134',
    'n3102155',
    'n3102216',
    'n320157',
    'n3201819',
    'n331940',
  ],
  /** One attack removes at most this percent of the boss's HP (Reborn's "perAttack" mode). */
  damagePercentPerAttack: 10,
  rewards: CLAN_MISSION_BOSSES.map((_, i) => ({
    stone: 400_000 * (i + 1),
    giftCoupon: 400 * (i + 1),
    clanExp: 2_000 * (i + 1),
  })),
}

export const clanMissionStartSchema = z
  .object({
    bossIndex: z
      .number()
      .int()
      .min(0)
      .max(CLAN_MISSION_BOSSES.length - 1),
    delayHours: z.number().int().min(0).max(CLAN_MISSION_RULES.maxScheduleHours),
  })
  .strict()
export type ClanMissionStartInput = z.input<typeof clanMissionStartSchema>

export interface ClanMissionsView {
  /** Bosses 0..unlockedBoss can be started. */
  unlockedBoss: number
  activeBoss: {
    bossIndex: number
    currentHp: number
    maxHp: number
    endsAt: string
    myAttacks: number
    minimumAttacks: number
  } | null
  scheduledBoss: { bossIndex: number; startAt: string } | null
  battlesUsedToday: number
  maxDailyBattles: number
  freeBattleEntries: number
  costs: { stones: number; giftCertificates: number }[]
  canStart: boolean
  damagePercentPerAttack: number
  bossActiveMinutes: number
  maxScheduleHours: number
  /** The last boss that fell or escaped, for the notice. */
  lastOutcome: { bossIndex: number; defeated: boolean; at: string } | null
}

export interface ClanMissionsResult {
  missions: ClanMissionsView
  character: Character
}

export interface ClanMissionAttackResult<R = unknown> extends ClanMissionsResult {
  replay: R
  npcId: string
  damage: number
  defeated: boolean
}
