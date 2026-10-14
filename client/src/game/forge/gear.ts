// How forge state reads on screen: the bag border colour by property count
// (GameUI/ImageGrid.as:554-571) and English names for the `<Name>Equip` properties
// (docs/original-data/equipment-sets.md "Property names").
import type { GearView } from '@pockie/shared'

/** 0 white, 1-2 blue, 3 orange, 4 gold. */
const BORDER_COLORS = ['#ffffff', '#00aeff', '#00aeff', '#ff8a00', '#ffc600'] as const

/** Border colour of an equipment cell; undefined for other items. */
export function borderColor(gear: Pick<GearView, 'identifyCount'> | undefined) {
  if (!gear) return undefined
  return BORDER_COLORS[Math.min(Math.max(gear.identifyCount, 0), 4)]
}

/** stat: x100 base stats; permille: 43 = +4.3%; percent; flat. */
type Unit = 'stat' | 'permille' | 'percent' | 'flat'

const PROPS: Record<string, [label: string, unit: Unit]> = {
  StrengthEquip: ['Strength', 'stat'],
  AgilityEquip: ['Agility', 'stat'],
  StaminaEquip: ['Stamina', 'stat'],
  MaxHPEquip: ['Max HP', 'flat'],
  MaxMPEquip: ['Max Chakra', 'flat'],
  MaxHPMulEquip: ['Max HP', 'permille'],
  MaxMPMulEquip: ['Max Chakra', 'permille'],
  MinAtkEquip: ['Min Attack', 'flat'],
  MaxAtkEquip: ['Max Attack', 'flat'],
  AbsAddAtkEquip: ['Attack', 'flat'],
  MinAtkMulEquip: ['Min Attack', 'permille'],
  MaxAtkMulEquip: ['Max Attack', 'permille'],
  AbsAddAtkMulEquip: ['Attack', 'permille'],
  AtkTimeMulEquip: ['Attack Speed', 'permille'],
  DodgeMulEquip: ['Dodge', 'flat'],
  DodgeMulMulEquip: ['Dodge', 'percent'],
  HitMulEquip: ['Hit', 'flat'],
  HitMulMulEquip: ['Hit', 'percent'],
  CritMulEquip: ['Critical', 'flat'],
  CritMulMulEquip: ['Critical', 'percent'],
  CritAttachEquip: ['Critical Damage', 'flat'],
  NeglectDefAttachEquip: ['Ignore Defense', 'flat'],
  NeglectDefMulEquip: ['Ignore Defense', 'percent'],
  ParryMulEquip: ['Parry', 'flat'],
  ParryMulMulEquip: ['Parry', 'percent'],
  PierceEquip: ['Pierce', 'flat'],
  PierceMulEquip: ['Pierce', 'percent'],
  ToughEquip: ['Toughness', 'flat'],
  ToughMulEquip: ['Toughness', 'percent'],
  DefenseEquip: ['Defense', 'flat'],
  DefenseMulEquip: ['Defense', 'percent'],
  CounterBombMulEquip: ['Counter Blast', 'flat'],
  VampiricHPEquip: ['Life Steal', 'flat'],
  DecDamageEquip: ['Damage Reduction', 'flat'],
  AbsorptionDamageEquip: ['Damage Absorption', 'flat'],
  ReboundAttachEquip: ['Damage Reflection', 'flat'],
  PriorityMulEquip: ['Initiative', 'flat'],
  CounterMulEquip: ['Counterattack', 'flat'],
  LuckEquip: ['Luck', 'flat'],
  ExpMulEquip: ['EXP Bonus', 'flat'],
  CapMulEquip: ['Stone Bonus', 'flat'],
  DropMulEquip: ['Drop Bonus', 'flat'],
  SkillAddAllEquip: ['All Skill Levels', 'flat'],
  IsDecHardEquip: ['No durability loss', 'flat'],
}

/** "+28 Stamina", "+4.3% Max HP"; unknown names keep a readable form of their key. */
export function propText(name: string, value: number) {
  if (name === 'IsDecHardEquip') return 'No durability loss'
  const skill = /^SkillAdd(\d)Equip$/.exec(name)
  const [label, unit] = PROPS[name] ?? [
    skill ? `Skill Tree ${Number(skill[1]) + 1} Level` : name.replace(/Equip$/, ''),
    'flat',
  ]
  const shown =
    unit === 'stat'
      ? value / 100
      : unit === 'permille'
        ? `${(value / 10).toFixed(1).replace(/\.0$/, '')}%`
        : unit === 'percent'
          ? `${value}%`
          : value
  return `${value < 0 ? '' : '+'}${shown} ${label}`
}

/**
 * Reborn's names for the refinement families (its stat ids 1-20 and 105) and how it prints them:
 * base stats at /100, the "%" families at /10 with one decimal.
 */
const REBORN_STATS: Record<string, [label: string, scale: 1 | 10 | 100]> = {
  StrengthEquip: ['Strength', 100],
  AgilityEquip: ['Agility', 100],
  StaminaEquip: ['Stamina', 100],
  DefenseEquip: ['Defense', 1],
  NeglectDefAttachEquip: ['Defense Break', 1],
  DodgeMulEquip: ['Dodge', 1],
  HitMulEquip: ['Hit', 1],
  MaxHPEquip: ['Max Health', 1],
  MaxHPMulEquip: ['Max Health %', 10],
  MaxAtkEquip: ['Max Attack', 1],
  AbsAddAtkMulEquip: ['Attack %', 10],
  AtkTimeMulEquip: ['Speed %', 10],
  MaxMPEquip: ['Max Chakra', 1],
  MaxMPMulEquip: ['Max Chakra %', 10],
  CritMulEquip: ['Critical', 1],
  CritAttachEquip: ['Critical Damage', 1],
  ToughEquip: ['Constitution', 1],
  PierceEquip: ['Pierce', 1],
  MinAtkEquip: ['Min Attack', 1],
  ParryMulEquip: ['Block', 1],
}

/** A number as Reborn prints a stat of that family ("2.4" for Max Health % 24). */
export function statNumber(name: string, value: number) {
  const scale = REBORN_STATS[name]?.[1] ?? 1
  return scale === 10 ? (value / 10).toFixed(1) : String(value / scale)
}

/** A tooltip row: Reborn's label and the signed value ("Dodge", "+37"). */
export function statLine(name: string, value: number) {
  const label = REBORN_STATS[name]?.[0]
  if (!label) {
    // Families Reborn does not show: fall back to our English line, value first.
    const text = propText(name, value)
    const space = text.indexOf(' ')
    return { label: text.slice(space + 1), value: text.slice(0, space) }
  }
  return { label, value: `${value < 0 ? '' : '+'}${statNumber(name, value)}` }
}

/** Reborn's item name colours by refinement line count (0-4+): white, green, blue, purple, orange. */
export const TIER_COLORS = [
  '#ffffff',
  'rgb(30, 255, 0)',
  'rgb(0, 112, 221)',
  'rgb(163, 53, 238)',
  'rgb(255, 128, 0)',
] as const
