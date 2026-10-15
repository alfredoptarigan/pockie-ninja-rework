// Bankai (Reborn bottom menu, level 30): GET /api/game/bankai and its actions. Every action
// answers with the whole BankaiView. Values and rules live in game-core/src/bankai.
import { z } from 'zod'

export const bankaiWeaponSchema = z.enum(['zangetsu', 'senbonzakura', 'iceRing'])
export type BankaiWeaponName = z.infer<typeof bankaiWeaponSchema>

const ringSlot = z.number().int().min(0).max(7)
const inventorySlot = z.number().int().min(0).max(79)

export const bankaiWeaponBodySchema = z.object({ weapon: bankaiWeaponSchema }).strict()
export const bankaiFormBodySchema = z
  .object({ weapon: bankaiWeaponSchema, form: z.number().int().min(1).max(3) })
  .strict()
export const bankaiStatSwapBodySchema = z
  .object({
    stat: z.enum([
      'strength',
      'agility',
      'stamina',
      'defenseBreak',
      'dodge',
      'critical',
      'attackPct',
      'hpPct',
    ]),
  })
  .strict()

/** Where a crystal sits: a crystal inventory cell or a weapon ring slot. */
export const crystalPlaceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('inventory'), index: inventorySlot }).strict(),
  z.object({ type: z.literal('ring'), weapon: bankaiWeaponSchema, slot: ringSlot }).strict(),
])
export type CrystalPlace = z.infer<typeof crystalPlaceSchema>

export const crystalMoveBodySchema = z
  .object({ from: crystalPlaceSchema, to: crystalPlaceSchema })
  .strict()
export const crystalRingBodySchema = z
  .object({ weapon: bankaiWeaponSchema, slot: ringSlot })
  .strict()
export const crystalAbsorbBodySchema = z
  .object({ weapon: bankaiWeaponSchema, slot: ringSlot, foodId: z.string().uuid() })
  .strict()
export const crystalDevourBodySchema = z
  .object({
    targetId: z.string().uuid(),
    foodIds: z.array(z.string().uuid()).min(1).max(6),
  })
  .strict()
export const crystalIdBodySchema = z.object({ id: z.string().uuid() }).strict()
export const crystalSlotUnlockBodySchema = z
  .object({
    slot: inventorySlot,
    payWith: z.enum(['coupons', 'stones', 'gold']),
  })
  .strict()

export type CrystalQualityName = 'green' | 'blue' | 'purple' | 'gold' | 'black' | 'orange'

export interface BankaiCrystal {
  id: string
  quality: CrystalQualityName
  name: string
  /** English stat label, for example "Defense Break" or "Speed %". */
  label: string
  /** Display value (Speed in percent). */
  value: number
  level: number
  maxLevel: number
  exp: number
  /** XP for the next level; 0 at the max level. */
  xpNeeded: number
  /** XP it gives when devoured or absorbed. */
  foodXp: number
  /** Bankai Coins when sold. */
  price: number
}

export interface BankaiStatRow {
  stat: string
  /** The stat's label, or its counterpart's while swapped. */
  label: string
  /** The other label (the swap target). */
  counterpart: string
  value: number
  /** Percent (Ice Ring). */
  percent: boolean
  swappable: boolean
  swapped: boolean
}

export interface BankaiWeaponView {
  weapon: BankaiWeaponName
  name: string
  /** 0 while locked. */
  level: number
  maxLevel: number
  exp: number
  /** EXP for the next level; 0 at the max level or while locked. */
  required: number
  /** Chosen form (1-3); 0 while locked. */
  form: number
  /** Forms open at this level. */
  forms: number
  unlockable: boolean
  /** "Character Level 40" or "Zangetsu Level 10". */
  requirement: string
  stats: BankaiStatRow[]
  /** 8 ring slots: the crystal, null when empty. */
  ring: (BankaiCrystal | null)[]
  /** Level each ring slot opens at; a slot is locked while level < it. */
  ringSlotLevels: number[]
  /** This weapon's ringed crystals summed by stat label ("Soul Crystal"). */
  soulCrystal: { label: string; value: number }[]
}

export interface BankaiView {
  expPool: number
  coins: number
  activeWeapon: BankaiWeaponName | null
  weapons: BankaiWeaponView[]
  /** 80 crystal inventory cells: the crystal, or null when empty. */
  inventory: (BankaiCrystal | null)[]
  /** Cells that still need unlocking. */
  lockedSlots: number[]
  forgeNpcs: { name: string; cost: number }[]
}

export interface BankaiFeedResult extends BankaiView {
  xpGained: number
  targetLevel: number
}
