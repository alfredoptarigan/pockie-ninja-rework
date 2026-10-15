// Loads a ninja's Zanpakuto rows, turns them into the ZanpakutoView every route answers with, and
// grants crystals (grantZanpakutoCrystal: Impel Down's drops).
import type { Random } from '@pockie/game-core'
import { eq, sql } from 'drizzle-orm'
import {
  crystalInfo,
  FREE_REFINES_PER_DAY,
  FREE_SPIRIT_SLOTS,
  rollStats,
  SPIRIT_SLOTS,
  WEAPON_SLOTS,
  weaponSlotOpen,
  ZANPAKUTO_TABS,
  type ZanpakutoTab,
} from '../../../../game-core/src/zanpakuto/zanpakuto.js'
import type { ZanpakutoCrystal, ZanpakutoView } from '../../../../shared/src/schemas/zanpakuto.js'
import type { Db } from '../../db/client.js'
import { characterZanpakuto, impelDownPlayers, zanpakutoCrystals } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { utcDay } from '../gates/common.js'

export type CrystalRow = typeof zanpakutoCrystals.$inferSelect

export interface ZanpakutoState {
  coins: number
  refineDay: string | null
  refinesUsed: number
  unlockedSlots: number[]
  crystals: CrystalRow[]
  /** Best Impel Down floors cleared; weapon slot idx opens at 25 * idx floors. */
  impelDownMaxFloor: number
}

/** Outfit weapon class (1 Blunt, 2 Sharp, 4 Fists) to its tab; anything else is Sharp. */
export const tabOfWeaponClass = (weaponClass: number): ZanpakutoTab =>
  weaponClass === 1 ? 'blunt' : weaponClass === 4 ? 'fist' : 'sharp'

export async function loadZanpakuto(tx: Tx | Db, characterId: string): Promise<ZanpakutoState> {
  const [row] = await tx
    .select()
    .from(characterZanpakuto)
    .where(eq(characterZanpakuto.characterId, characterId))
  const [impelDown] = await tx
    .select({ maxFloor: impelDownPlayers.maxFloor })
    .from(impelDownPlayers)
    .where(eq(impelDownPlayers.characterId, characterId))
  return {
    coins: row?.coins ?? 0,
    refineDay: row?.refineDay ?? null,
    refinesUsed: row?.refinesUsed ?? 0,
    unlockedSlots: row?.unlockedSlots ?? [],
    crystals: await tx
      .select()
      .from(zanpakutoCrystals)
      .where(eq(zanpakutoCrystals.characterId, characterId)),
    impelDownMaxFloor: impelDown?.maxFloor ?? 0,
  }
}

export const spiritSlotOpen = (state: ZanpakutoState, slot: number) =>
  slot < FREE_SPIRIT_SLOTS || state.unlockedSlots.includes(slot)

export const refinesUsedToday = (state: ZanpakutoState, now = new Date()) =>
  state.refineDay === utcDay(now) ? state.refinesUsed : 0

/** First open, empty spirit slot, or undefined when the spirit inventory is full. */
export function freeSpiritSlot(state: ZanpakutoState) {
  const taken = new Set(state.crystals.map((c) => c.spiritSlot))
  return Array.from({ length: SPIRIT_SLOTS }, (_, i) => i).find(
    (slot) => spiritSlotOpen(state, slot) && !taken.has(slot),
  )
}

export function crystalView(row: CrystalRow): ZanpakutoCrystal {
  const info = crystalInfo(row.itemId)!
  return {
    id: row.id,
    iid: row.itemId,
    name: info.name,
    icon: info.icon,
    category: info.category,
    tab: info.tab,
    position: info.position,
    coins: info.coins,
    stats: row.stats,
    bulkOptions: row.bulkOptions,
  }
}

export function zanpakutoView(
  state: ZanpakutoState,
  weaponClass: number,
  now = new Date(),
): ZanpakutoView {
  const spirit = Array.from({ length: SPIRIT_SLOTS }, (_, slot) => {
    const found = state.crystals.find((c) => c.spiritSlot === slot)
    return found ? crystalView(found) : null
  })
  const tabSlots = (tab: ZanpakutoTab) =>
    Array.from({ length: WEAPON_SLOTS }, (_, slot) => {
      const found = state.crystals.find((c) => c.tab === tab && c.tabSlot === slot)
      return found ? crystalView(found) : null
    })
  return {
    coins: state.coins,
    freeRefines: Math.max(0, FREE_REFINES_PER_DAY - refinesUsedToday(state, now)),
    spirit,
    lockedSlots: spirit.flatMap((_, slot) => (spiritSlotOpen(state, slot) ? [] : [slot])),
    tabs: Object.fromEntries(
      ZANPAKUTO_TABS.map((tab) => [tab, tabSlots(tab)]),
    ) as ZanpakutoView['tabs'],
    lockedWeaponSlots: Array.from({ length: WEAPON_SLOTS }, (_, i) => i).filter(
      (i) => !weaponSlotOpen(i, state.impelDownMaxFloor),
    ),
    activeTab: tabOfWeaponClass(weaponClass),
  }
}

/**
 * Puts a new crystal (item 480001-480086, one rolled stat) in the first free spirit slot. The
 * caller holds the character lock. Returns the row, or undefined when the spirit inventory is
 * full (Impel Down then sells it with addSpiritCoins).
 */
export async function grantZanpakutoCrystal(
  tx: Tx,
  characterId: string,
  iid: number,
  random: Random,
): Promise<CrystalRow | undefined> {
  const info = crystalInfo(iid)
  if (!info) throw new Error(`Not a Zanpakuto crystal: ${iid}`)
  const slot = freeSpiritSlot(await loadZanpakuto(tx, characterId))
  if (slot === undefined) return undefined
  const [row] = await tx
    .insert(zanpakutoCrystals)
    .values({
      characterId,
      itemId: iid,
      stats: rollStats(info.category, 1, random),
      spiritSlot: slot,
    })
    .returning()
  return row
}

/** Adds Spirit Coins (a sold crystal), creating the ninja's Zanpakuto row if needed. */
export async function addSpiritCoins(tx: Tx, characterId: string, coins: number) {
  await tx
    .insert(characterZanpakuto)
    .values({ characterId, coins })
    .onConflictDoUpdate({
      target: characterZanpakuto.characterId,
      set: { coins: sql`${characterZanpakuto.coins} + ${coins}` },
    })
}
