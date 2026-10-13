// Non-fight buffs: BuffSystem.AddBuff and RefreshBuffProperty, FoodItem.js, RoleTitleSystem.
import { readFileSync } from 'node:fs'
import { equipBonuses, type Bonuses } from '@pockie/game-core'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client.js'
import { characterBuffs, characterTitles, characters } from '../db/schema.js'
import { HttpError } from '../http.js'
import { item, itemNameKey } from './data.js'
import type { Tx } from './progress.js'
import { isVip } from './vip.js'

type Buff = { buffadd: number; replace: number; deltype: number; type: number; validity: number }
type Title = { BuffID: number; EffectDuration: number; TitleName: string }
const data = JSON.parse(
  readFileSync(new URL('./nonfight-buff-data.json', import.meta.url), 'utf8'),
) as {
  buffs: Record<string, Buff>
  properties: Record<string, Record<string, number>>
  titles: Record<string, Title>
}
const live = (expiresAt: AnyPgColumn, now: Date) => or(isNull(expiresAt), gt(expiresAt, now))
const bad = (code: string, message: string) => new HttpError(400, code, message)
export const buffDefinition = (id: number) => data.buffs[String(id)]
export const titleDefinition = (id: number) => data.titles[String(id)]

export const activeBuffs = (tx: Tx | Db, characterId: string, now = new Date()) =>
  tx
    .select()
    .from(characterBuffs)
    .where(and(eq(characterBuffs.characterId, characterId), live(characterBuffs.expiresAt, now)))
export const activeTitles = (tx: Tx | Db, characterId: string, now = new Date()) =>
  tx
    .select()
    .from(characterTitles)
    .where(and(eq(characterTitles.characterId, characterId), live(characterTitles.expiresAt, now)))

/** The original sums properties, then uses the same RefreshSystem terms as equipment. */
export async function buffBonuses(
  tx: Tx | Db,
  characterId: string,
  now = new Date(),
): Promise<Partial<Bonuses>> {
  const totals: Record<string, number> = {}
  for (const row of await activeBuffs(tx, characterId, now)) {
    const def = buffDefinition(row.buffId)
    if (!def || (def.type & 1) === 0) continue
    for (const [name, value] of Object.entries(data.properties[String(def.buffadd)] ?? {})) {
      const term = name.replace(/Buff$/, 'Equip')
      totals[term] = (totals[term] ?? 0) + value
    }
  }
  return equipBonuses(totals)
}
export function sumBonuses(...parts: Partial<Bonuses>[]): Partial<Bonuses> {
  const result: Partial<Bonuses> = {}
  for (const part of parts)
    for (const [key, value] of Object.entries(part)) {
      const term = key as keyof Bonuses
      result[term] = (result[term] ?? 0) + value
    }
  return result
}
/** GetAddExpMul: VIP and buff percentages add before rounding, rather than multiplying. */
export const buffExp = (
  base: number,
  character: Pick<typeof characters.$inferSelect, 'vipUntil'>,
  expMul = 0,
  now = new Date(),
) => Math.trunc((base * (100 + expMul + (isVip(character, now) ? 50 : 0))) / 100)
export const buffStone = (base: number, capMul = 0) =>
  capMul > 0 && capMul <= 300 ? base + Math.trunc((base * capMul) / 100) : base
export async function rewardExp(
  tx: Tx | Db,
  character: typeof characters.$inferSelect,
  base: number,
) {
  return buffExp(base, character, (await buffBonuses(tx, character.id)).expMul)
}

async function addBuff(
  tx: Tx,
  characterId: string,
  buffId: number,
  source: 'food' | 'title',
  sourceId: string,
  expiresAt: Date | null,
) {
  const def = buffDefinition(buffId)
  if (!def) throw bad('unknown_buff', 'That item has no supported buff.')
  await tx
    .delete(characterBuffs)
    .where(and(eq(characterBuffs.characterId, characterId), eq(characterBuffs.group, def.replace)))
  await tx
    .insert(characterBuffs)
    .values({ characterId, buffId, group: def.replace, source, sourceId, expiresAt })
}

/** Called with the character locked, before consuming the item in the same transaction. */
export async function useBuffItem(
  tx: Tx,
  characterId: string,
  itemId: string,
  def: NonNullable<ReturnType<typeof item>>,
  now = new Date(),
) {
  if (def.JavaScript === 'item/FoodItem.js') {
    const duration = Number(def.BufferLastTime)
    await addBuff(
      tx,
      characterId,
      Number(def.BufferID),
      'food',
      itemId,
      duration === -1 ? null : new Date(now.getTime() + duration * 1000),
    )
    return true
  }
  if (def.JavaScript !== 'item/TitleItem.js') return false
  const titleId = Number(def.AddTitleID)
  const title = titleDefinition(titleId)
  if (!title || titleId === 0) throw bad('unknown_title', 'That item has no supported title.')
  if ((await activeTitles(tx, characterId, now)).some((row) => row.titleId === titleId))
    throw bad('title_owned', 'You already own that title.')
  const expiresAt =
    title.EffectDuration === -1
      ? null
      : new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + title.EffectDuration,
          ),
        )
  await tx
    .insert(characterTitles)
    .values({ characterId, titleId, expiresAt })
    .onConflictDoUpdate({
      target: [characterTitles.characterId, characterTitles.titleId],
      set: { expiresAt, active: false },
    })
  return true
}

export async function activateTitle(
  tx: Tx,
  characterId: string,
  titleId: number,
  now = new Date(),
) {
  const owned =
    titleId === 0
      ? undefined
      : (await activeTitles(tx, characterId, now)).find((row) => row.titleId === titleId)
  if (titleId !== 0 && !owned) throw bad('no_title', 'You do not own that active title.')
  await tx
    .update(characterTitles)
    .set({ active: false })
    .where(eq(characterTitles.characterId, characterId))
  await tx
    .delete(characterBuffs)
    .where(and(eq(characterBuffs.characterId, characterId), eq(characterBuffs.source, 'title')))
  if (!owned) return
  await tx
    .update(characterTitles)
    .set({ active: true })
    .where(and(eq(characterTitles.characterId, characterId), eq(characterTitles.titleId, titleId)))
  const def = titleDefinition(titleId)!
  if (def.BuffID > 0)
    await addBuff(tx, characterId, def.BuffID, 'title', String(titleId), owned.expiresAt)
}

export async function buffView(tx: Tx | Db, characterId: string) {
  return {
    buffs: (await activeBuffs(tx, characterId)).map((row) => ({
      buffId: row.buffId,
      nameKey:
        row.source === 'title'
          ? `lg_${titleDefinition(Number(row.sourceId))?.TitleName}`
          : itemNameKey(row.sourceId),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      removable: buffDefinition(row.buffId)?.deltype !== 0,
    })),
    titles: (await activeTitles(tx, characterId)).map((row) => ({
      titleId: row.titleId,
      nameKey: `lg_${titleDefinition(row.titleId)!.TitleName}`,
      active: row.active,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    })),
  }
}
