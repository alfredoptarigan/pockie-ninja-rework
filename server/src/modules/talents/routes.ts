// Reborn talents (M5 decisions 6-8): daily upgrade attempts, EXP and level-ups, 3 active slots.
// Every action locks the character row first, then the talent rows (plan ground rules).
import { createRandom } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  canActivate,
  rollUpgrade,
  talentCap,
  upgradeCost,
} from '../../../../game-core/src/reborn/talents.js'
import {
  talentActiveBodySchema,
  talentParamsSchema,
  talentUpgradeBodySchema,
  type TalentsView,
  type TalentUpgradeResult,
} from '../../../../shared/src/schemas/talents.js'
import type { Db } from '../../db/client.js'
import { characters, characterTalents } from '../../db/schema.js'
import { rebornTalents } from '../../game/data.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
export { talentFighterInput } from '../../game/talents.js'
import { characterOf, lockCharacter, requireUser, toCharacter } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'

type CharacterRow = typeof characters.$inferSelect
const bad = (code: string, message: string) => new HttpError(400, code, message)
const DAY_MS = 86_400_000
const SLOTS = [0, 1, 2] as const

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10)
/** Lazy daily reset: attempts count only on the stored UTC day. */
const attemptsUsed = (character: CharacterRow) =>
  character.talentDay === utcDay() ? character.talentAttemptsUsed : 0
/** Highest level a talent may reach: decision 6, and never past the last expNeeded row. */
const levelCap = (level: number) => Math.min(talentCap(level), rebornTalents().expNeeded.length)

const talentRows = (tx: Tx | Db, characterId: string) =>
  tx.select().from(characterTalents).where(eq(characterTalents.characterId, characterId))

async function view(tx: Tx | Db, character: CharacterRow): Promise<TalentsView> {
  const data = rebornTalents()
  const rows = await talentRows(tx, character.id)
  const used = attemptsUsed(character)
  return {
    unlockLevel: data.unlockLevel,
    cap: levelCap(character.level),
    attemptsUsed: used,
    attemptsPerDay: data.attemptsPerDay,
    nextCost: upgradeCost(used + 1),
    maxActive: data.maxActive,
    resetAt: new Date(Date.parse(`${utcDay()}T00:00:00Z`) + DAY_MS).toISOString(),
    talents: data.talents.map(({ id, nameKey }) => {
      const row = rows.find((r) => r.talentId === id)
      const level = row?.level ?? 0
      return {
        talentId: id,
        nameKey,
        level,
        exp: row?.exp ?? 0,
        expNeeded: data.expNeeded[level] ?? null,
        active: row?.activeSlot != null,
      }
    }),
  }
}

async function lockTalent(tx: Tx, characterId: string, talentId: number) {
  const [row] = await tx
    .select()
    .from(characterTalents)
    .where(
      and(eq(characterTalents.characterId, characterId), eq(characterTalents.talentId, talentId)),
    )
    .for('update')
  return row
}

/** Adds EXP and levels up while the next level's EXP is met and the cap allows. */
export function addTalentExp(level: number, exp: number, gained: number, cap: number) {
  const needed = rebornTalents().expNeeded
  let next = { level, exp: exp + gained }
  while (next.level < cap && next.exp >= needed[next.level]!)
    next = { level: next.level + 1, exp: next.exp - needed[next.level]! }
  return next
}

async function upgrade(tx: Tx, userId: string, talentId: number, useGold: boolean) {
  const character = await lockCharacter(tx, userId)
  const data = rebornTalents()
  if (character.level < data.unlockLevel)
    throw bad('too_low', `Talents unlock at level ${data.unlockLevel}.`)
  const used = attemptsUsed(character)
  const cost = upgradeCost(used + 1)
  if (!cost) throw bad('no_attempts', 'You have used all talent upgrades for today.')
  const row = await lockTalent(tx, character.id, talentId)
  const cap = levelCap(character.level)
  if ((row?.level ?? 0) >= cap)
    throw bad('talent_capped', 'This talent has reached the highest level for your level.')
  const price = useGold
    ? { field: 'gold' as const, amount: cost.gold, name: 'Gold' }
    : { field: 'stone' as const, amount: cost.stones, name: 'Stone' }
  if (character[price.field] < price.amount)
    throw bad('no_money', `You need ${price.amount} ${price.name}.`)

  const roll = rollUpgrade(createRandom(randomInt(2 ** 31)))
  const next = addTalentExp(row?.level ?? 0, row?.exp ?? 0, roll.exp, cap)
  await tx
    .insert(characterTalents)
    .values({ characterId: character.id, talentId, ...next })
    .onConflictDoUpdate({
      target: [characterTalents.characterId, characterTalents.talentId],
      set: next,
    })
  const [updated] = await tx
    .update(characters)
    .set({
      [price.field]: character[price.field] - price.amount,
      talentDay: utcDay(),
      talentAttemptsUsed: used + 1,
    })
    .where(eq(characters.id, character.id))
    .returning()
  const levelsGained = next.level - (row?.level ?? 0)
  if (levelsGained > 0 && row?.activeSlot != null) await refreshArenaSnapshot(tx, character.id)
  const result: TalentUpgradeResult = {
    ...(await view(tx, updated!)),
    upgrade: { talentId, exp: roll.exp, crit: roll.crit, levelsGained },
    character: toCharacter(updated!),
  }
  return result
}

async function setActive(tx: Tx, userId: string, talentId: number, active: boolean) {
  const character = await lockCharacter(tx, userId)
  const row = await lockTalent(tx, character.id, talentId)
  const isActive = row?.activeSlot != null
  if (active !== isActive) {
    const rows = await talentRows(tx, character.id)
    const taken = rows.flatMap((r) => (r.activeSlot == null ? [] : [r.activeSlot]))
    if (active) {
      if (!row || row.level < 1)
        throw bad('talent_untrained', 'Train this talent to level 1 first.')
      if (!canActivate(row.level, taken.length))
        throw bad('too_many_active', `Only ${rebornTalents().maxActive} talents can be active.`)
    }
    const activeSlot = active ? SLOTS.find((slot) => !taken.includes(slot))! : null
    await tx
      .update(characterTalents)
      .set({ activeSlot })
      .where(
        and(
          eq(characterTalents.characterId, character.id),
          eq(characterTalents.talentId, talentId),
        ),
      )
    await refreshArenaSnapshot(tx, character.id)
  }
  return view(tx, character)
}

/**
 * Active talents for `FighterInput.talents`, levels capped by the ninja's current level
 * (decision 6). Empty when none are active.
 */
export async function talentRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    view(db, await characterOf(db, requireUser(request).id)),
  )
  app.post('/:id/upgrade', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const userId = requireUser(request).id
    const { id } = talentParamsSchema.parse(request.params)
    const { useGold } = talentUpgradeBodySchema.parse(request.body ?? {})
    return db.transaction((tx) => upgrade(tx, userId, id, useGold))
  })
  app.post('/:id/active', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const userId = requireUser(request).id
    const { id } = talentParamsSchema.parse(request.params)
    const { active } = talentActiveBodySchema.parse(request.body)
    return db.transaction((tx) => setActive(tx, userId, id, active))
  })
}

export default talentRoutes
