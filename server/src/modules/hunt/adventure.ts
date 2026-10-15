// Adventure with Jiraiya (Reborn clan Events tile, `clanAdventureStart` / `clanAdventureReturn`):
// a clan member sends their ninja away for up to 24 hours (no battles meanwhile) and on return
// gets Character EXP, Bankai EXP and Clan EXP per full hour, with a chance at a special item
// from 12 hours on.
import { createRandom } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import {
  ADVENTURE_PLACEHOLDERS,
  ADVENTURE_RULES,
  JIRAIYA_LINES,
  type AdventureReturnResult,
  type AdventureRewards,
  type AdventureView,
} from '../../../../shared/src/schemas/hunt.js'
import type { Db } from '../../db/client.js'
import { clanMembers, jiraiyaAdventures } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { addBankai, addClanPoints } from '../clan-events/level.js'
import { lockClanOf } from '../clans/clans.js'
import {
  bad,
  characterView,
  grantItems,
  newSeed,
  requireBagRoom,
  saveCharacter,
  withExp,
  type CharacterRow,
} from '../gates/common.js'
import { requireBattleFree } from './guard.js'

type AdventureRow = typeof jiraiyaAdventures.$inferSelect

const HOUR_MS = 3_600_000
const BOUND = true

export const adventureHours = (startedAt: Date, now: Date) =>
  Math.floor(
    Math.min(now.getTime() - startedAt.getTime(), ADVENTURE_RULES.maxHours * HOUR_MS) / HOUR_MS,
  )

export const adventureRewards = (level: number, hours: number): AdventureRewards => ({
  charExp: hours * level * ADVENTURE_PLACEHOLDERS.charExpPerHourPerLevel,
  bankaiExp: hours * ADVENTURE_PLACEHOLDERS.bankaiExpPerHour,
  clanExp: hours * ADVENTURE_PLACEHOLDERS.clanExpPerHour,
})

/** Percent chance of the special item after `hours` (10% at 24h, 5% at 12h, none before). */
export const specialChance = (hours: number) =>
  ADVENTURE_RULES.specialChances.find((step) => hours >= step.hours)?.percent ?? 0

export function adventureView(row: AdventureRow | undefined, level: number, now = new Date()) {
  const hours = row ? adventureHours(row.startedAt, now) : 0
  const view: AdventureView = {
    active: Boolean(row),
    startedAt: row?.startedAt.toISOString() ?? null,
    hours,
    rewards: adventureRewards(level, hours),
  }
  return view
}

export async function adventureRow(db: Tx | Db, characterId: string, lock = false) {
  const query = db
    .select()
    .from(jiraiyaAdventures)
    .where(eq(jiraiyaAdventures.characterId, characterId))
  const [row] = lock ? await query.for('update') : await query
  return row
}

async function inClan(tx: Tx, characterId: string) {
  const [row] = await tx
    .select({ clanId: clanMembers.clanId })
    .from(clanMembers)
    .where(eq(clanMembers.characterId, characterId))
  return Boolean(row)
}

export async function startAdventure(tx: Tx, character: CharacterRow) {
  if (!(await inClan(tx, character.id)))
    throw bad('no_clan', 'Join a clan to go on an adventure with Jiraiya.')
  // Also refuses a second adventure (the guard's adventure message) and a running chain attack.
  await requireBattleFree(tx, character.id)
  const now = new Date()
  const [row] = await tx
    .insert(jiraiyaAdventures)
    .values({ characterId: character.id, startedAt: now })
    .returning()
  return { adventure: adventureView(row, character.level, now) }
}

export async function returnFromAdventure(
  tx: Tx,
  character: CharacterRow,
): Promise<AdventureReturnResult> {
  const row = await adventureRow(tx, character.id, true)
  if (!row) throw bad('not_away', 'You are not on an adventure.')
  const now = new Date()
  const hours = adventureHours(row.startedAt, now)
  const rewards = adventureRewards(character.level, hours)
  const chance = specialChance(hours)
  if (chance > 0)
    await requireBagRoom(tx, character.id, [
      { itemId: ADVENTURE_PLACEHOLDERS.specialItemId, bound: BOUND },
    ])
  const random = createRandom(newSeed())
  const special = random.next() * 100 < chance
  if (special)
    await grantItems(tx, character.id, [
      { itemId: ADVENTURE_PLACEHOLDERS.specialItemId, bound: BOUND },
    ])
  if (rewards.charExp > 0) {
    const { update } = withExp(character, {}, rewards.charExp)
    await saveCharacter(tx, character.id, update)
  }
  await addBankai(tx, character.id, 0, rewards.bankaiExp)
  // Clan EXP goes to the clan the ninja is in now (none if they left it while away).
  if (rewards.clanExp > 0 && (await inClan(tx, character.id)))
    await addClanPoints(await lockClanOf(tx, character.id), rewards.clanExp, now)
  await tx.delete(jiraiyaAdventures).where(eq(jiraiyaAdventures.characterId, character.id))
  return {
    story: JIRAIYA_LINES[random.int(JIRAIYA_LINES.length)]!,
    totalHours: hours,
    rewards,
    specialItem: special ? { itemId: ADVENTURE_PLACEHOLDERS.specialItemId } : null,
    adventure: adventureView(undefined, character.level, now),
    character: await characterView(tx, character.id),
  }
}
