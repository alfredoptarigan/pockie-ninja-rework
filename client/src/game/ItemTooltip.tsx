// Reborn's item tooltip (docs/audit/reborn-ui-audit.md §1): a 250px dark panel with the item name
// in its refinement-tier colour, a gold rule, the overview (BOUND / UNBOUND, Synthesis Value, Item
// Type, icon) and the sections of the item's kind: REQUIREMENTS, CORE ATTRIBUTES, INSCRIPTION,
// SPECIAL ATTRIBUTES, REFINEMENT, ENHANCEMENTS, SET BONUSES. Hovering a bag item whose slot holds a
// different worn item shows both panels side by side (EQUIPPED ITEM, then INVENTORY ITEM), each
// marked ▲ / ▼ / ● against the other.
import type { GearView } from '@pockie/shared'
import type { ReactNode } from 'react'
import { statLine, TIER_COLORS } from './forge/gear'
import { itemIcon } from './ItemIcon'
import { itemName, outfitIcon } from './inventory/outfits'
import type { InventoryItem } from './types'

/** Reborn's Item Type names (item_type__*) for our EquipType values and item classes. */
const EQUIP_TYPES: Record<string, string> = {
  Weapon: 'Weapon',
  Glove: 'Gloves',
  Ring: 'Ring',
  Amulet: 'Amulet',
  Hat: 'Helmet',
  Cloth: 'Armor',
  Girdle: 'Belt',
  Shoes: 'Shoes',
  Wing: 'Wing',
}
const CLASS_TYPES: Record<string, string> = {
  FoodItem: 'Food',
  PharmacyItem: 'Aid',
  SustainItem: 'Aid',
  JewelItem: 'Gem',
  DebrisItem: 'Material',
  CropItem: 'Material',
  PetItem: 'Pet',
  AvatarItem: 'Outfit',
  SkillBook: 'Pet Skill',
  SkillScrollItem: 'Skill Scroll',
  TitleItem: 'Timed Title',
  CardBox: 'Card Pack',
  GiftBagItem: 'Bag',
  WingStone: 'Wing Material',
  ImpressItem: 'Impress',
  ImpressRateItem: 'Impress',
  TaskItem: 'Quest Item',
}
/** Synthesis Value of gear by refinement line count (0-4). */
const SYNTHESIS = [14, 22, 31, 39, 46]
/** Reborn shows the enhance level out of 16. */
const ENHANCE_CAP = 16

export const itemType = (item: InventoryItem) =>
  (item.info?.equipSlot && EQUIP_TYPES[item.info.equipSlot]) ||
  (item.info && CLASS_TYPES[item.info.class]) ||
  'Miscellaneous'

type Mark = 'up' | 'down' | 'same' | 'new'
const MARKS: Record<Mark, { glyph: string; color: string }> = {
  up: { glyph: '▲', color: '#22c55e' },
  down: { glyph: '▼', color: '#ef4444' },
  same: { glyph: '●', color: '#ffffff' },
  new: { glyph: '●', color: '#3b82f6' },
}
const compare = (mine: number, theirs: number): Mark =>
  mine > theirs ? 'up' : mine < theirs ? 'down' : 'same'

export interface TooltipEntry {
  item: InventoryItem
  gear?: GearView
}
type Side = 'worn' | 'bag'

/**
 * The tooltip of an item, or of a bag item against the worn one in its slot (`worn`), at a fixed
 * screen point (rendered inside the open window, so it stays in the dialog's top layer).
 */
export function ItemTooltip({
  entry,
  worn,
  at,
  characterLevel,
}: {
  entry: TooltipEntry
  worn?: TooltipEntry
  at: { x: number; y: number }
  characterLevel?: number
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[70] flex items-start gap-1 font-sans text-xs text-white"
      style={{ left: at.x, top: at.y }}
    >
      {worn && <ItemPanel entry={worn} side="worn" other={entry} level={characterLevel} />}
      <ItemPanel
        entry={entry}
        side={worn ? 'bag' : undefined}
        other={worn}
        level={characterLevel}
      />
    </div>
  )
}

/** One tooltip panel; `side` adds the compare label and marks against `other`. */
export function ItemPanel({
  entry: { item, gear },
  side,
  other,
  level,
}: {
  entry: TooltipEntry
  side?: Side
  other?: TooltipEntry
  level?: number
}) {
  const lines = gear?.appraised ? gear.props.length : 0
  const outfit = item.info?.outfit
  const icon = outfit ? outfitIcon(outfit.clothing) : itemIcon(item.itemId)?.file
  return (
    <div
      className="w-[250px] p-2"
      style={{
        borderStyle: 'solid',
        borderImage: 'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
      }}
    >
      {side && (
        <p
          className="text-[10px] font-bold uppercase"
          style={{ color: side === 'bag' ? '#ffdf85' : '#9fb0c1' }}
        >
          {side === 'bag' ? 'Inventory Item' : 'Equipped Item'}
        </p>
      )}
      <p
        className="text-center text-sm font-bold"
        style={{ color: TIER_COLORS[Math.min(lines, 4)] }}
      >
        {itemName(item)}
      </p>
      <div className="my-1 h-px bg-linear-to-r from-transparent via-[#d8b060] to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <span
            className={`inline-block rounded-full border px-1.5 text-[10px] font-bold uppercase ${
              item.bound ? 'border-[#d8b060] text-[#ffdf85]' : 'border-[#9fb0c1] text-[#9fb0c1]'
            }`}
          >
            {item.bound ? 'Bound' : 'Unbound'}
          </span>
          {gear && <Row label="Synthesis Value:" value={SYNTHESIS[Math.min(lines, 4)]} />}
          <Row label="Item Type:" value={itemType(item)} />
        </div>
        {icon && (
          <img
            src={icon}
            alt=""
            className="max-h-[51px] max-w-[51px] rounded-sm border border-white/20"
          />
        )}
      </div>
      {gear ? (
        <GearSections gear={gear} side={side} other={other?.gear} level={level} />
      ) : (
        item.info &&
        item.info.level > 1 && (
          <Section title="Requirements">
            <Row
              label="Required Level:"
              value={item.info.level}
              warn={!!level && level < item.info.level}
            />
          </Section>
        )
      )}
      {item.locked && <p className="mt-1 text-[#ffcc33]">🔒 Locked — cannot be sold or traded</p>}
    </div>
  )
}

function GearSections({
  gear,
  side,
  other,
  level,
}: {
  gear: GearView
  side?: Side
  other?: GearView
  level?: number
}) {
  const weapon = gear.baseType === 1
  const core = (view: GearView) => (weapon ? view.attack.min + view.attack.max : view.defense)
  /** A refinement line against the other item: the same stat compared, or one it lacks. */
  const mark = (name: string, value: number): Mark | undefined => {
    if (!side || !other) return undefined
    const theirs = other.props.find((prop) => prop.name === name)
    if (theirs) return compare(value, theirs.value)
    return side === 'worn' ? 'up' : 'new'
  }
  const range = (name: string, min: number, max: number) =>
    `(${statLine(name, min).value.replace('+', '')} - ${statLine(name, max).value.replace('+', '')})`
  return (
    <>
      <Section title="Requirements">
        <Row label="Required Level:" value={gear.level} warn={!!level && level < gear.level} />
        {gear.weaponType && (
          <Row label="Weapon Type:" value={gear.weaponType === 'Any' ? 'All' : gear.weaponType} />
        )}
      </Section>
      {gear.baseType !== 3 && (
        <Section title="Core Attributes">
          <Row
            label={weapon ? 'Attack Power' : 'Defense'}
            value={weapon ? `${gear.attack.min} - ${gear.attack.max}` : gear.defense}
            mark={side && other ? compare(core(gear), core(other)) : undefined}
          />
        </Section>
      )}
      {gear.inscribeLevel > 0 && (
        <Section title="Inscription">
          <p className="text-[#ffdf85]">{'★'.repeat(gear.inscribeLevel)}</p>
          {gear.inscription.map((row) => {
            const line = statLine(row.name, row.value)
            return <Row key={row.name} label={line.label} value={line.value} />
          })}
        </Section>
      )}
      {gear.special.length > 0 && (
        <Section title="Special Attributes">
          {gear.special.map((row) => {
            const line = statLine(row.name, row.value)
            return <Row key={row.name} label={line.label} value={line.value} color="#f0c040" />
          })}
        </Section>
      )}
      <Section title="Refinement">
        {!gear.appraised ? (
          <p className="text-[#ff8a00]">Not appraised ({gear.identifyCount} hidden lines)</p>
        ) : gear.props.length === 0 ? (
          <p className="text-[#9fb0c1]">No refinements</p>
        ) : (
          gear.props.map((prop, index) => {
            const line = statLine(prop.name, prop.value)
            return (
              <Row
                key={`${prop.propId}-${index}`}
                label={line.label}
                value={`${line.value} ${range(prop.name, prop.min, prop.max)} T${prop.tier}`}
                mark={mark(prop.name, prop.value)}
                small
              />
            )
          })
        )}
      </Section>
      {gear.enhanceMax > 0 && (
        <Section title="Enhancements">
          <Row label="Enhanced Level:" value={`${gear.enhanceLevel} / ${ENHANCE_CAP}`} />
          {gear.maxHp > 0 && <Row label="Max Health:" value={`+${gear.maxHp}`} />}
        </Section>
      )}
      {gear.set && (
        <Section title="Set Bonuses">
          <p className="text-[#9fb0c1]">
            Set ({gear.set.worn}/{gear.set.pieces})
          </p>
          {gear.set.bonuses.map((bonus) => {
            const line = statLine(bonus.name, bonus.value)
            return (
              <Row
                key={`${bonus.pieces}-${bonus.name}`}
                label={`${bonus.pieces}-Piece: ${line.label}`}
                value={line.value}
                color={gear.set!.worn >= bonus.pieces ? '#7fcf6e' : '#8e8e8e'}
              />
            )
          })}
        </Section>
      )}
      <p className="mt-1 text-[#5df9ff]">
        Durability {gear.durability} / {gear.maxDurability}
        {gear.durability <= 0 && ' (broken: no stats)'}
      </p>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-1.5">
      <h4 className="text-[11px] font-bold text-[#ffdf85] uppercase">{title}</h4>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
  mark,
  warn = false,
  small = false,
  color,
}: {
  label: string
  value: ReactNode
  mark?: Mark
  warn?: boolean
  small?: boolean
  color?: string
}) {
  return (
    <p
      className={`flex justify-between gap-2 ${small ? 'text-[11px]' : ''}`}
      style={{ color: warn ? '#ef4444' : color }}
    >
      <span>{label}</span>
      <span className="whitespace-nowrap">
        {value}
        {mark && <span style={{ color: MARKS[mark].color }}>{MARKS[mark].glyph}</span>}
      </span>
    </p>
  )
}
