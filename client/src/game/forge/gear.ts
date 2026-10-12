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
