// Loads a ninja's Bankai rows and turns them into the BankaiView every Bankai route answers with.
import { eq } from 'drizzle-orm'
import {
  BANKAI_WEAPONS,
  bankaiForms,
  canUnlockWeapon,
  CRYSTAL_INVENTORY_FREE,
  CRYSTAL_INVENTORY_SLOTS,
  CRYSTAL_QUALITY_INFO,
  CRYSTAL_STAT_LABELS,
  crystalFoodXp,
  crystalName,
  crystalStatValue,
  crystalXpNeeded,
  FORGE_NPCS,
  requiredWeaponExp,
  RING_SLOT_LEVELS,
  STAT_SWAPS,
  WEAPON_MAX_LEVEL,
  WEAPON_STATS,
  WEAPON_UNLOCK,
  weaponBonuses,
  type BankaiWeapon,
  type CrystalQuality,
  type CrystalStat,
} from '../../../../game-core/src/bankai/bankai.js'
import type {
  BankaiCrystal,
  BankaiStatRow,
  BankaiView,
  BankaiWeaponView,
} from '../../../../shared/src/schemas/bankai.js'
import type { Db } from '../../db/client.js'
import { bankaiCrystals, bankaiWeapons, characterBankai } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'

export type CrystalRow = typeof bankaiCrystals.$inferSelect
export type WeaponRow = typeof bankaiWeapons.$inferSelect

export interface BankaiState {
  expPool: number
  coins: number
  activeWeapon: string | null
  statSwaps: string[]
  unlockedSlots: number[]
  weapons: WeaponRow[]
  crystals: CrystalRow[]
}

export const WEAPON_NAMES: Record<BankaiWeapon, string> = {
  zangetsu: 'Zangetsu',
  senbonzakura: 'Senbonzakura',
  iceRing: 'Ice Ring',
}

const round = (value: number) => Math.round(value * 100) / 100

export async function loadBankai(tx: Tx | Db, characterId: string): Promise<BankaiState> {
  const [bankai] = await tx
    .select()
    .from(characterBankai)
    .where(eq(characterBankai.characterId, characterId))
  return {
    expPool: bankai?.expPool ?? 0,
    coins: bankai?.coins ?? 0,
    activeWeapon: bankai?.activeWeapon ?? null,
    statSwaps: bankai?.statSwaps ?? [],
    unlockedSlots: bankai?.unlockedSlots ?? [],
    weapons: await tx
      .select()
      .from(bankaiWeapons)
      .where(eq(bankaiWeapons.characterId, characterId)),
    crystals: await tx
      .select()
      .from(bankaiCrystals)
      .where(eq(bankaiCrystals.characterId, characterId)),
  }
}

export const weaponLevel = (state: BankaiState, weapon: BankaiWeapon) =>
  state.weapons.find((w) => w.weapon === weapon)?.level ?? 0

export const inventorySlotOpen = (state: BankaiState, slot: number) =>
  slot < CRYSTAL_INVENTORY_FREE || state.unlockedSlots.includes(slot)

/** Stat display value: Speed is stored in tenths of a percent. */
function displayValue(quality: CrystalQuality, stat: CrystalStat, level: number) {
  const value = crystalStatValue(quality, stat, level)
  return stat === 'speed' ? value / 10 : value
}

export function crystalView(row: CrystalRow): BankaiCrystal {
  const quality = row.quality as CrystalQuality
  const stat = row.stat as CrystalStat
  return {
    id: row.id,
    quality,
    name: crystalName(quality, stat),
    label: CRYSTAL_STAT_LABELS[stat],
    value: displayValue(quality, stat, row.level),
    level: row.level,
    maxLevel: CRYSTAL_QUALITY_INFO[quality].maxLevel,
    exp: row.exp,
    xpNeeded: crystalXpNeeded(quality, row.level),
    foodXp: crystalFoodXp(quality, row.level),
    price: CRYSTAL_QUALITY_INFO[quality].price,
  }
}

function requirementOf(weapon: BankaiWeapon) {
  const rule = WEAPON_UNLOCK[weapon]
  return rule.characterLevel !== undefined
    ? `Character Level ${rule.characterLevel}`
    : `${WEAPON_NAMES[rule.weapon!]} Level ${rule.weaponLevel}`
}

function statRows(state: BankaiState, weapon: BankaiWeapon, level: number): BankaiStatRow[] {
  const values = new Map(weaponBonuses(weapon, level).map((b) => [b.stat as string, b.value]))
  return WEAPON_STATS[weapon].map((stat) => {
    const swap = stat in STAT_SWAPS ? STAT_SWAPS[stat as keyof typeof STAT_SWAPS] : undefined
    const swapped = swap !== undefined && state.statSwaps.includes(stat)
    return {
      stat,
      label: swap ? (swapped ? swap.counterpart : swap.label) : 'Speed',
      counterpart: swap ? (swapped ? swap.label : swap.counterpart) : '',
      value: values.get(stat) ?? 0,
      percent: weapon === 'iceRing',
      swappable: swap !== undefined,
      swapped,
    }
  })
}

function weaponView(state: BankaiState, weapon: BankaiWeapon, characterLevel: number) {
  const row = state.weapons.find((w) => w.weapon === weapon)
  const level = row?.level ?? 0
  const ring = RING_SLOT_LEVELS.map((_, slot) => {
    const found = state.crystals.find((c) => c.weapon === weapon && c.ringSlot === slot)
    return found ? crystalView(found) : null
  })
  const sums = new Map<string, number>()
  for (const crystal of ring)
    if (crystal) sums.set(crystal.label, (sums.get(crystal.label) ?? 0) + crystal.value)
  const levels = Object.fromEntries(BANKAI_WEAPONS.map((w) => [w, weaponLevel(state, w)]))
  return {
    weapon,
    name: WEAPON_NAMES[weapon],
    level,
    maxLevel: WEAPON_MAX_LEVEL,
    exp: row?.exp ?? 0,
    required: requiredWeaponExp(level),
    form: row?.form ?? 0,
    forms: bankaiForms(level),
    unlockable: level === 0 && canUnlockWeapon(weapon, characterLevel, levels),
    requirement: requirementOf(weapon),
    stats: statRows(state, weapon, level),
    ring,
    ringSlotLevels: [...RING_SLOT_LEVELS],
    soulCrystal: [...sums].map(([label, value]) => ({ label, value: round(value) })),
  } satisfies BankaiWeaponView
}

export function bankaiView(state: BankaiState, characterLevel: number): BankaiView {
  const inventory = Array.from({ length: CRYSTAL_INVENTORY_SLOTS }, (_, slot) => {
    const found = state.crystals.find((c) => c.inventorySlot === slot)
    return found ? crystalView(found) : null
  })
  return {
    expPool: state.expPool,
    coins: state.coins,
    activeWeapon: (state.activeWeapon as BankaiWeapon | null) ?? null,
    weapons: BANKAI_WEAPONS.map((weapon) => weaponView(state, weapon, characterLevel)),
    inventory,
    lockedSlots: inventory.flatMap((_, slot) => (inventorySlotOpen(state, slot) ? [] : [slot])),
    forgeNpcs: FORGE_NPCS.map(({ name, cost }) => ({ name, cost })),
  }
}
