// Bankai (Reborn): weapons levelled from a shared EXP pool, and crystals slotted into each weapon's
// ring. Every table is Reborn's client bankai slice (re/2026-10-14/main.js @1281706, module 59853)
// and its window (@2972351); the guide's max levels (green..gold 10, black/orange 20) match the
// XP tables' lengths. Nothing here is invented: what the data lacks is left out (see WEAPON_MAX_LEVEL).

export const BANKAI_WEAPONS = ['zangetsu', 'senbonzakura', 'iceRing'] as const
export type BankaiWeapon = (typeof BANKAI_WEAPONS)[number]

export const CRYSTAL_QUALITIES = ['green', 'blue', 'purple', 'gold', 'black', 'orange'] as const
export type CrystalQuality = (typeof CRYSTAL_QUALITIES)[number]

export const CRYSTAL_STATS = [
  'strength',
  'agility',
  'stamina',
  'defense',
  'penetration',
  'evasion',
  'accuracy',
  'maxHp',
  'maxAttack',
  'speed',
  'maxChakra',
  'criticalHit',
  'toughness',
  'block',
  'blockBypass',
  'minAttack',
] as const
export type CrystalStat = (typeof CRYSTAL_STATS)[number]

/** CRYSTAL_STAT_LABELS. Speed is stored in tenths of a percent. */
export const CRYSTAL_STAT_LABELS: Record<CrystalStat, string> = {
  strength: 'Strength',
  agility: 'Agility',
  stamina: 'Stamina',
  defense: 'Defense',
  penetration: 'Defense Break',
  accuracy: 'Hit',
  evasion: 'Dodge',
  blockBypass: 'Pierce',
  speed: 'Speed %',
  maxHp: 'Max Health',
  maxChakra: 'Max Chakra',
  maxAttack: 'Max Attack',
  minAttack: 'Min Attack',
  criticalHit: 'Critical',
  block: 'Block',
  toughness: 'Const',
}

type StatRow = [name: string, stat: CrystalStat, base: number, inc: number]
const row = (name: string, stat: CrystalStat, base: number, inc: number): StatRow => [
  name,
  stat,
  base,
  inc,
]

/** Per quality: the crystal name, its stat, the level-1 base and the per-level increment. */
const STAT_TABLE: Record<CrystalQuality, StatRow[]> = {
  green: [
    row('Sky Rift', 'strength', 8, 4),
    row('Dark Shadow', 'agility', 8, 4),
    row('Demon', 'stamina', 8, 4),
    row('Frozen', 'defense', 8, 4),
    row('Phantom Wound', 'maxAttack', 2, 1),
    row('Chaos', 'minAttack', 2, 1),
  ],
  blue: [
    row('Abyss', 'strength', 12, 6),
    row('Judgement', 'agility', 12, 6),
    row('Dragon Bone', 'stamina', 12, 6),
    row('Evil', 'defense', 12, 6),
    row('Time', 'penetration', 12, 6),
    row('Shadow', 'evasion', 8, 4),
    row('Icy Moon', 'accuracy', 12, 6),
    row('Phoenix', 'maxHp', 12, 6),
    row('Icy Soul', 'maxAttack', 4, 2),
    row('Soft Wind', 'speed', 10, 5),
    row('Flowing Dust', 'maxChakra', 12, 6),
    row('Dragon Song', 'criticalHit', 8, 4),
    row('Dragon Scale', 'toughness', 10, 5),
    row('Quill', 'block', 8, 4),
    row('Wind', 'blockBypass', 12, 6),
    row('Pure', 'minAttack', 4, 2),
  ],
  purple: [
    row('Crazy', 'strength', 20, 10),
    row('Rainbow', 'agility', 20, 10),
    row('Blood Feather', 'stamina', 20, 10),
    row('Golden', 'defense', 22, 11),
    row('Broken Spirit', 'penetration', 20, 10),
    row('Flying', 'evasion', 12, 6),
    row('Exorcise', 'accuracy', 20, 10),
    row('Kirin', 'maxHp', 22, 11),
    row('Demon', 'maxAttack', 6, 3),
    row('Sirius', 'speed', 20, 10),
    row('Sacred Feather', 'maxChakra', 22, 11),
    row('Nature Sound', 'criticalHit', 12, 6),
    row('Iron Mountain', 'toughness', 18, 9),
    row('Devil', 'block', 12, 6),
    row('Soul', 'blockBypass', 20, 10),
    row('Solution', 'minAttack', 6, 3),
  ],
  gold: [
    row('Void', 'strength', 30, 15),
    row('Star', 'agility', 30, 15),
    row('Jade', 'stamina', 30, 15),
    row('Vajra', 'defense', 34, 17),
    row('Sky', 'penetration', 30, 15),
    row('Mist', 'evasion', 20, 10),
    row('Hope', 'accuracy', 30, 15),
    row('Eden', 'maxHp', 34, 17),
    row('Aim', 'maxAttack', 10, 5),
    row('Haze', 'speed', 30, 15),
    row('Omen', 'maxChakra', 34, 17),
    row('Fade', 'criticalHit', 20, 10),
    row('Fall', 'toughness', 28, 14),
    row('Bane', 'block', 20, 10),
    row('Ruin', 'blockBypass', 30, 15),
    row('Aeon', 'minAttack', 10, 5),
  ],
  black: [
    row('Black Void', 'strength', 40, 30),
    row('Black Star', 'agility', 40, 30),
    row('Black Jade', 'stamina', 40, 30),
    row('Black Vajra', 'defense', 44, 34),
    row('Black Sky', 'penetration', 40, 30),
    row('Black Mist', 'evasion', 26, 20),
    row('Black Hope', 'accuracy', 40, 30),
    row('Black Eden', 'maxHp', 44, 34),
    row('Black Aim', 'maxAttack', 14, 12),
    row('Black Haze', 'speed', 40, 30),
    row('Black Omen', 'maxChakra', 44, 34),
    row('Black Fade', 'criticalHit', 26, 20),
    row('Black Fall', 'toughness', 38, 28),
    row('Black Bane', 'block', 26, 20),
    row('Black Ruin', 'blockBypass', 40, 30),
    row('Black Aeon', 'minAttack', 14, 12),
  ],
  orange: [
    row('Orange Void', 'strength', 48, 60),
    row('Orange Star', 'agility', 48, 60),
    row('Orange Jade', 'stamina', 48, 60),
    row('Orange Vajra', 'defense', 53, 68),
    row('Orange Sky', 'penetration', 48, 60),
    row('Orange Mist', 'evasion', 31, 40),
    row('Orange Hope', 'accuracy', 48, 60),
    row('Orange Eden', 'maxHp', 53, 68),
    row('Orange Aim', 'maxAttack', 17, 20),
    row('Orange Haze', 'speed', 50, 60),
    row('Orange Omen', 'maxChakra', 53, 68),
    row('Orange Fade', 'criticalHit', 31, 40),
    row('Orange Fall', 'toughness', 46, 56),
    row('Orange Bane', 'block', 31, 40),
    row('Orange Ruin', 'blockBypass', 48, 60),
    row('Orange Aeon', 'minAttack', 17, 20),
  ],
}

/** XP to climb from level n to n + 1 is XP_TABLE[q][n]; index 0 is unused (0). */
const XP_TABLE: Record<CrystalQuality, readonly number[]> = {
  green: [0, 300, 450, 600, 1200, 2400, 4800, 9600, 19200, 38400],
  blue: [0, 600, 900, 1200, 2400, 4800, 9600, 19200, 38400, 76800],
  purple: [0, 1200, 1800, 2400, 4800, 9600, 19200, 38400, 76800, 154560],
  gold: [0, 2400, 3600, 4800, 9600, 19200, 38400, 76800, 154560, 307200],
  black: [
    0, 2400, 4800, 9375, 18750, 37500, 75e3, 15e4, 3e5, 6e5, 9e5, 12e5, 15e5, 18e5, 21e5, 24e5,
    27e5, 2999997, 2999997, 2999997,
  ],
  orange: [
    0, 4800, 9375, 18750, 37500, 75e3, 15e4, 3e5, 6e5, 9e5, 12e5, 15e5, 18e5, 21e5, 24e5, 27e5,
    2999997, 2999997, 2999997, 2999997,
  ],
}

/** Crystal System Guide table: max level, base XP when devoured, and sell price in Bankai Coins. */
export const CRYSTAL_QUALITY_INFO: Record<
  CrystalQuality,
  { maxLevel: number; baseXp: number; price: number }
> = {
  green: { maxLevel: 10, baseXp: 25, price: 1 },
  blue: { maxLevel: 10, baseXp: 50, price: 2 },
  purple: { maxLevel: 10, baseXp: 150, price: 4 },
  gold: { maxLevel: 10, baseXp: 600, price: 6 },
  black: { maxLevel: 20, baseXp: 800, price: 10 },
  orange: { maxLevel: 20, baseXp: 1600, price: 10 },
}

/** BANKAI_CRYSTAL_STAT_MULTIPLIER. */
const STAT_MULTIPLIER = 0.5

const statRow = (quality: CrystalQuality, stat: CrystalStat) =>
  STAT_TABLE[quality].find(([, s]) => s === stat)

/** Whether a crystal of that quality can carry that stat (green has 6, blue and up all 16). */
export const crystalHasStat = (quality: CrystalQuality, stat: CrystalStat) =>
  statRow(quality, stat) !== undefined

export const crystalName = (quality: CrystalQuality, stat: CrystalStat) =>
  statRow(quality, stat)?.[0] ?? 'Crystal'

/** getCrystalStatValue: (base + (level - 1) * inc) * 0.5, level clamped to the max. */
export function crystalStatValue(quality: CrystalQuality, stat: CrystalStat, level: number) {
  const found = statRow(quality, stat)
  if (!found) return 0
  const clamped = Math.max(1, Math.min(CRYSTAL_QUALITY_INFO[quality].maxLevel, level))
  return (found[2] + (clamped - 1) * found[3]) * STAT_MULTIPLIER
}

/** XP still needed for the next level as a whole step; 0 at the max level. */
export function crystalXpNeeded(quality: CrystalQuality, level: number) {
  if (level >= CRYSTAL_QUALITY_INFO[quality].maxLevel) return 0
  return XP_TABLE[quality][level] ?? 0
}

/** getCrystalBaseExp: what devouring the crystal gives, base XP plus the steps it climbed. */
export function crystalFoodXp(quality: CrystalQuality, level: number) {
  const steps = XP_TABLE[quality].slice(0, level).reduce((sum, xp) => sum + xp, 0)
  return CRYSTAL_QUALITY_INFO[quality].baseXp + steps
}

/** Adds XP and levels the crystal up; XP past the max level is lost. */
export function feedCrystal(
  crystal: { quality: CrystalQuality; level: number; exp: number },
  xp: number,
) {
  let { level } = crystal
  let exp = crystal.exp + xp
  for (let needed = crystalXpNeeded(crystal.quality, level); needed > 0 && exp >= needed;) {
    exp -= needed
    level += 1
    needed = crystalXpNeeded(crystal.quality, level)
  }
  return { level, exp: crystalXpNeeded(crystal.quality, level) === 0 ? 0 : exp }
}

/**
 * requiredExpForLevel is 3000 + 1500 * (level - 1) for levels 1-14 and 0 from 15. The window says
 * max level 25, but no EXP or bonus data exists past 15, so 15 is the cap here.
 */
export const WEAPON_MAX_LEVEL = 15

export const requiredWeaponExp = (level: number) =>
  level <= 0 || level >= WEAPON_MAX_LEVEL ? 0 : 3000 + 1500 * (level - 1)

/**
 * Upgrade: moves pool EXP into the weapon until the next level, one level per press.
 * ponytail: Reborn's server rule is not in the bundle; one level per press is the safe reading.
 */
export function upgradeWeapon(weapon: { level: number; exp: number }, pool: number) {
  const required = requiredWeaponExp(weapon.level)
  if (required === 0) return { ...weapon, spent: 0 }
  const spent = Math.max(0, Math.min(pool, required - weapon.exp))
  const exp = weapon.exp + spent
  return exp >= required
    ? { level: weapon.level + 1, exp: 0, spent }
    : { level: weapon.level, exp, spent }
}

/** Window unlock rules (`ue`): Zangetsu at character level 40, the others at the previous Lv10. */
export const WEAPON_UNLOCK: Record<
  BankaiWeapon,
  { characterLevel?: number; weapon?: BankaiWeapon; weaponLevel?: number }
> = {
  zangetsu: { characterLevel: 40 },
  senbonzakura: { weapon: 'zangetsu', weaponLevel: 10 },
  iceRing: { weapon: 'senbonzakura', weaponLevel: 10 },
}

export function canUnlockWeapon(
  weapon: BankaiWeapon,
  characterLevel: number,
  levels: Partial<Record<BankaiWeapon, number>>,
) {
  const rule = WEAPON_UNLOCK[weapon]
  if (rule.characterLevel !== undefined) return characterLevel >= rule.characterLevel
  return (levels[rule.weapon!] ?? 0) >= rule.weaponLevel!
}

/** bankaiForm: forms 1, 2 and 3 open at levels 1, 5 and 10. */
export const bankaiForms = (level: number) =>
  level >= 10 ? 3 : level >= 5 ? 2 : level >= 1 ? 1 : 0

/** `Lp`: the Bankai level each of the 8 ring slots opens at. */
export const RING_SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 8, 10] as const
export const ringSlotUnlocked = (slot: number, weaponLevel: number) =>
  weaponLevel >= (RING_SLOT_LEVELS[slot] ?? Infinity)

export const WEAPON_STATS = {
  zangetsu: ['strength', 'agility', 'stamina'],
  senbonzakura: ['defenseBreak', 'dodge', 'critical'],
  iceRing: ['attackPct', 'hpPct', 'speedPct'],
} as const satisfies Record<BankaiWeapon, readonly string[]>
export type WeaponStat = (typeof WEAPON_STATS)[BankaiWeapon][number]

const STR_AGI_STA = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 300, 350, 400, 450, 500]
const PIERCE = [48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 240, 280, 320, 360, 400]
const DODGE_CRIT = [36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 180, 210, 240, 270, 300]
/** Tenths of a percent. */
const ICE_RING = [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 325, 350, 375, 400]

const BONUS_TABLES: Record<WeaponStat, readonly number[]> = {
  strength: STR_AGI_STA,
  agility: STR_AGI_STA,
  stamina: STR_AGI_STA,
  defenseBreak: PIERCE,
  dodge: DODGE_CRIT,
  critical: DODGE_CRIT,
  attackPct: ICE_RING,
  hpPct: ICE_RING,
  speedPct: ICE_RING,
}

/** computeBonuses for one weapon: Ice Ring values are percents (table / 10). */
export function weaponBonuses(weapon: BankaiWeapon, level: number) {
  if (level <= 0) return []
  return WEAPON_STATS[weapon].map((stat) => {
    const table = BONUS_TABLES[stat]
    const value = table[Math.min(level, table.length) - 1]!
    return { stat, value: weapon === 'iceRing' ? value / 10 : value }
  })
}

/** BANKAI_SWAPPABLE_STATS and the window's counterpart labels (same value, other stat). */
export const STAT_SWAPS = {
  strength: { label: 'Strength', counterpart: 'Stamina' },
  agility: { label: 'Agility', counterpart: 'Hit (from Agility)' },
  stamina: { label: 'Stamina', counterpart: 'Strength' },
  defenseBreak: { label: 'Defense Break', counterpart: 'Defense' },
  dodge: { label: 'Dodge', counterpart: 'Hit' },
  critical: { label: 'Critical', counterpart: 'Constitution' },
  attackPct: { label: 'Attack', counterpart: 'Max HP' },
  hpPct: { label: 'Max HP', counterpart: 'Attack' },
} as const
export type SwappableStat = keyof typeof STAT_SWAPS

/** Crystal inventory: 80 slots, 8 open; slot s costs 50s coupons, 10 gold or 5000s stones. */
export const CRYSTAL_INVENTORY_SLOTS = 80
export const CRYSTAL_INVENTORY_FREE = 8
export const inventorySlotCost = (slot: number) => ({
  coupons: 50 * slot,
  gold: 10,
  stones: 5000 * slot,
})

/** Get Crystal forge NPCs and their Bankai Coin cost (the odds are not in the data). */
export const FORGE_NPCS = [
  { name: 'Konan', cost: 50 },
  { name: 'Kakuzu', cost: 100 },
  { name: 'Sasori', cost: 200 },
  { name: 'Deidara', cost: 300 },
  { name: 'Hidan', cost: 500 },
] as const
