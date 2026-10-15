// Clan Training (Reborn's `Mh`: three courses, each once per UTC day) and Clan Protection (`Oh`:
// 3 fights a day against the Bloodboil Demon). The caller holds the character and clan locks
// (lockClanOf); this then takes the ninja's clan_member_daily row.
import { simulateFight } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import {
  PROTECTION_PLACEHOLDERS,
  PROTECTION_RULES,
  TRAINING_COURSES,
  TRAINING_RULES,
  type ProtectionView,
  type TrainingCourse,
  type TrainingView,
} from '../../../../shared/src/schemas/clan-activities.js'
import type { Db } from '../../db/client.js'
import { characters, clanMemberDaily } from '../../db/schema.js'
import { monsterFighter, playerFighter } from '../../game/combat.js'
import { expUpdate, saveCharacterProgress, type Tx } from '../../game/progress.js'
import type { ClanContext } from '../clans/clans.js'
import { bad, newSeed, utcDay } from '../gates/common.js'
import { addBankai, addClanPoints, pay } from './level.js'
import { logClan } from './logs.js'

type DailyRow = typeof clanMemberDaily.$inferSelect

const DAY_MS = 86_400_000
const COURSE_BIT: Record<TrainingCourse, number> = { primary: 1, advanced: 2, final: 4 }

export const nextUtcMidnight = (now: Date) =>
  new Date((Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS).toISOString()

const readDaily = async (db: Db | Tx, characterId: string) =>
  (await db.select().from(clanMemberDaily).where(eq(clanMemberDaily.characterId, characterId)))[0]

async function lockDaily(tx: Tx, characterId: string) {
  await tx.insert(clanMemberDaily).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(clanMemberDaily)
    .where(eq(clanMemberDaily.characterId, characterId))
    .for('update')
  return row!
}

const doneToday = (row: DailyRow | undefined, now: Date) =>
  row?.trainingDay === utcDay(now) ? row.trainingDone : 0
const foughtToday = (row: DailyRow | undefined, now: Date) =>
  row?.protectionDay === utcDay(now) ? row.protectionFights : 0

// --- Training ------------------------------------------------------------------------------------

export async function trainingView(
  db: Db | Tx,
  characterId: string,
  now = new Date(),
): Promise<TrainingView> {
  const done = doneToday(await readDaily(db, characterId), now)
  return {
    donated: Object.fromEntries(
      TRAINING_COURSES.map((course) => [course, (done & COURSE_BIT[course]) !== 0]),
    ) as TrainingView['donated'],
    resetsAt: nextUtcMidnight(now),
  }
}

/** Confirm your donation: pays the course, then EXP, Bankai EXP and Clan Points. */
export async function donateTraining(ctx: ClanContext, course: TrainingCourse, now: Date) {
  const rule = TRAINING_RULES[course]
  const row = await lockDaily(ctx.tx, ctx.me.id)
  const done = doneToday(row, now)
  if (done & COURSE_BIT[course]) throw bad('donated', 'Each course can be donated once per day')
  await pay(ctx, rule.currency, rule.cost)
  await ctx.tx
    .update(clanMemberDaily)
    .set({ trainingDay: utcDay(now), trainingDone: done | COURSE_BIT[course] })
    .where(eq(clanMemberDaily.characterId, ctx.me.id))
  if (rule.exp > 0) await saveCharacterProgress(ctx.tx, ctx.me.id, expUpdate(ctx.me, rule.exp))
  await addBankai(ctx.tx, ctx.me.id, 0, rule.bankaiExp)
  await logClan(ctx.tx, ctx.clan.id, ctx.me.name, 'Training', rule.label)
  return addClanPoints(ctx, rule.clanPoints, now)
}

// --- Protection ----------------------------------------------------------------------------------

/** Our Bloodboil Demon rows (TicketBossNpc n32057xx) by level: n3205700 + level / 5 (100 -> 00). */
const BOSS_STEP = 5
const BOSS_MAX_LEVEL = 100
export function protectionBoss(level: number) {
  const bossLevel = Math.min(
    BOSS_MAX_LEVEL,
    Math.max(BOSS_STEP, Math.floor(level / BOSS_STEP) * BOSS_STEP),
  )
  const step = (bossLevel / BOSS_STEP) % 20
  return { npcId: `n32057${String(step).padStart(2, '0')}`, level: bossLevel }
}

export async function protectionView(
  db: Db | Tx,
  character: Pick<typeof characters.$inferSelect, 'id' | 'level'>,
  now = new Date(),
): Promise<ProtectionView> {
  const fought = foughtToday(await readDaily(db, character.id), now)
  const boss = protectionBoss(character.level)
  return {
    fightsRemaining: Math.max(0, PROTECTION_RULES.fightsPerDay - fought),
    fightsPerDay: PROTECTION_RULES.fightsPerDay,
    resetsAt: nextUtcMidnight(now),
    boss: { ...boss, name: PROTECTION_RULES.bossName },
    rewards: PROTECTION_PLACEHOLDERS,
  }
}

/** Battle: one of today's fights, the ninja at full HP and MP against the boss. */
export async function fightProtection(ctx: ClanContext, now: Date) {
  const { tx, me } = ctx
  const row = await lockDaily(tx, me.id)
  const fought = foughtToday(row, now)
  if (fought >= PROTECTION_RULES.fightsPerDay) throw bad('no_fights', 'No fights remaining')
  await tx
    .update(clanMemberDaily)
    .set({ protectionDay: utcDay(now), protectionFights: fought + 1 })
    .where(eq(clanMemberDaily.characterId, me.id))
  const player = await playerFighter(tx, me)
  const { npcId } = protectionBoss(me.level)
  const replay = simulateFight({
    attackers: [{ ...player, hp: player.maxHp, mp: player.maxMp }],
    defenders: [{ ...monsterFighter(npcId), name: PROTECTION_RULES.bossName }],
    seed: newSeed(),
  })
  const won = replay.winner === 'attackers'
  const reward = won ? PROTECTION_PLACEHOLDERS.win : PROTECTION_PLACEHOLDERS.loss
  await addBankai(tx, me.id, 0, reward.bankaiExp)
  if (reward.clanPoints > 0) await addClanPoints(ctx, reward.clanPoints, now)
  await logClan(tx, ctx.clan.id, me.name, 'Protection', won ? 'Victory' : 'Defeat')
  return { replay, won, npcId, reward: { ...reward } }
}
