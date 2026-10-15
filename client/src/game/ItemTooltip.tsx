// Reborn's item tooltip (docs/audit/reborn-ui-audit.md §1): a 250px dark panel with the item name
// in its refinement-tier colour, a gold rule, the overview (BOUND / UNBOUND, Synthesis Value, Item
// Type, icon) and the sections of the item's kind: REQUIREMENTS, CORE ATTRIBUTES, INSCRIPTION,
// SPECIAL ATTRIBUTES, REFINEMENT, ENHANCEMENTS, SOCKETED GEMS, SET BONUSES, ENCHANTMENTS (in
// Reborn's order per kind). Gems and Enchanting Stones list their stats; outfits show STAR BONUSES,
// ISV, BMV and SKILL IMPRINTS (Reborn's formula and lines); pets their nature and Aura / Aid /
// Passive skills, a pet item from the Kennel its level and skills too. Hovering a bag item whose
// slot holds a different worn item shows both panels side by side (EQUIPPED ITEM, then INVENTORY
// ITEM), each marked ▲ / ▼ / ● against the other.
import {
  OUTFIT_STARS,
  isStarredImprint,
  outfitStat,
  starIsv,
  starTier,
  type GearView,
} from '@pockie/shared'
import type { ReactNode } from 'react'
import { statLine, TIER_COLORS } from './forge/gear'
import { itemIcon } from './ItemIcon'
import { itemName, outfitIcon } from './inventory/outfits'
import { NATURES, petSkillIcon } from './pets/nature'
import { plainText } from './text'
import type { InventoryItem, ItemInfo } from './types'

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
  MagicItem: 'Enchantment',
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
/** Reborn's item-info__stat-value--positive. */
const GREEN = '#7ef6a9'
const signed = (n: number) => (n < 0 ? String(n) : `+${n}`)

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
  /** A kennel pet's level and slotted skills (a pet item in the bag has none). */
  pet?: { level: number; skills: { skillId: number; kind: number }[] }
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
  entry: { item, gear, pet },
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
  const nature = item.info?.pet?.nature
  const petLevel = pet?.level ?? item.info?.pet?.level ?? 0
  const petSkills = pet?.skills ?? item.info?.pet?.skills ?? []
  const icon = outfit ? outfitIcon(outfit.clothing) : itemIcon(item.itemId)?.file
  const synthesis = gear ? SYNTHESIS[Math.min(lines, 4)] : item.info?.value
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
      {!!outfit?.stars && (
        <p
          className="text-center text-[#ffdf85]"
          aria-label={`${outfit.stars} of ${OUTFIT_STARS.maxStars} stars`}
        >
          {'★'.repeat(outfit.stars)}
        </p>
      )}
      <p
        className="text-center text-sm font-bold"
        style={{ color: TIER_COLORS[Math.min(lines, 4)] }}
      >
        {itemName(item)}
      </p>
      {nature !== undefined && (
        <p style={{ color: 'teal' }}>
          {itemName(item)} + {petLevel}
        </p>
      )}
      <Rule />
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <span
            className={`inline-block rounded-full border px-1.5 text-[10px] font-bold uppercase ${
              item.bound ? 'border-[#d8b060] text-[#ffdf85]' : 'border-[#9fb0c1] text-[#9fb0c1]'
            }`}
          >
            {item.bound ? 'Bound' : 'Unbound'}
          </span>
          {outfit && <Row label="Weapon Type:" value={outfit.weaponType} />}
          {nature !== undefined && (
            <Row
              label="Nature:"
              value={<span style={{ color: '#4caf50' }}>{NATURES[nature] ?? 'Unknown'}</span>}
              color="#888888"
            />
          )}
          {synthesis !== undefined && <Row label="Synthesis Value:" value={synthesis} />}
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
      ) : outfit ? (
        <OutfitSections outfit={outfit} required={item.info!.level} level={level} />
      ) : nature !== undefined ? (
        <PetSkills skills={petSkills} />
      ) : item.info?.gem || item.info?.enchant ? (
        <StoneSections info={item.info} level={level} />
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
  /** A refinement or enchant line against the other item's: the same stat, or one it lacks. */
  const mark = (
    name: string,
    value: number,
    theirLines: readonly { name: string; value: number }[] = other?.props ?? [],
  ): Mark | undefined => {
    if (!side || !other) return undefined
    const theirs = theirLines.find((line) => line.name === name)
    if (theirs) return compare(value, theirs.value)
    return side === 'worn' ? 'up' : 'new'
  }
  const enchantments = gear.enchant && gear.enchant.lines.length > 0 && (
    <Section title="Enchantments">
      {gear.enchant.lines.map((row) => {
        const line = statLine(row.name, row.value)
        return (
          <Row
            key={row.name}
            label={line.label}
            value={line.value}
            mark={mark(row.name, row.value, other?.enchant?.lines ?? [])}
            color="#388ee9"
          />
        )
      })}
    </Section>
  )
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
            value={
              weapon
                ? `${gear.attack.min - gear.enhanceAttack.min} - ${gear.attack.max - gear.enhanceAttack.max}`
                : gear.defense
            }
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
      {gear.enhanceLevel > 0 && (
        <Section title="Enhancements">
          <Row label="Enhanced Level:" value={`${gear.enhanceLevel} / ${ENHANCE_CAP}`} />
          {weapon ? (
            <>
              <Row label="Min Attack" value={signed(gear.enhanceAttack.min)} color={GREEN} />
              <Row label="Max Attack" value={signed(gear.enhanceAttack.max)} color={GREEN} />
            </>
          ) : (
            gear.maxHp > 0 && <Row label="Max HP" value={signed(gear.maxHp)} color={GREEN} />
          )}
        </Section>
      )}
      {weapon && enchantments}
      {gear.sockets.length > 0 && (
        <Section title="Socketed Gems">
          <ul aria-label="Socketed Gems" className="flex flex-col gap-1.5">
            {gear.sockets.map((gem, index) => (
              <Socket key={`${gem?.itemId ?? 'open'}-${index}`} gem={gem} />
            ))}
          </ul>
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
      {!weapon && enchantments}
      <p className="mt-1 text-[#5df9ff]">
        Durability {gear.durability} / {gear.maxDurability}
        {gear.durability <= 0 && ' (broken: no stats)'}
      </p>
    </>
  )
}

/** One gem socket: Reborn's ring with the gem's icon and stat, or "Open Socket". */
function Socket({ gem }: { gem: GearView['sockets'][number] }) {
  const icon = gem && itemIcon(gem.itemId)?.file
  const line = gem && statLine(gem.name, gem.value)
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid size-[26px] shrink-0 place-items-center rounded-full border-2 border-[#8a7a5a] bg-black/40"
      >
        {icon && <img src={icon} alt="" className="size-[20px] object-contain" />}
      </span>
      {line ? (
        <span className="flex flex-col">
          <span className="text-[#a4bfd4]">{line.label}</span>
          <span style={{ color: GREEN }}>{line.value}</span>
        </span>
      ) : (
        <span className="text-[#9fb0c1]">Open Socket</span>
      )}
    </li>
  )
}

/** A gem's or Enchanting Stone's tooltip body: REQUIREMENTS, then its stat lines in blue. */
function StoneSections({ info, level }: { info: ItemInfo; level?: number }) {
  const lines = info.gem ? [info.gem] : (info.enchant?.lines ?? [])
  const required = info.gem?.level ?? info.enchant?.level ?? 1
  return (
    <>
      <Section title="Requirements">
        <Row label="Required Level:" value={required} warn={!!level && level < required} />
        {info.enchant && (
          <Row
            label="Fits:"
            value={info.enchant.slots.map((slot) => EQUIP_TYPES[slot] ?? slot).join(' / ')}
          />
        )}
      </Section>
      <Rule />
      {lines.map((row) => {
        const line = statLine(row.name, row.value)
        return <Row key={row.name} label={line.label} value={line.value} color="#388ee9" />
      })}
    </>
  )
}

const STATS = ['Strength', 'Agility', 'Stamina'] as const
/** Reborn's BMV lines (tooltip__outfit--str-description, ui__bmv_agility_desc, _stamina_desc). */
const BMV = [
  (n: number) => `Every ${n} points of Strength increases attack by 1% and block by 1 point`,
  (n: number) => `Every ${n} points of Agility increases dodge by 1 and speed by 1%`,
  (n: number) => `Every ${n} points of Stamina increases HP by 1% and chakra by 1%`,
]
/** Reborn's ISV colour: yellow at the recast cap, green within 90% of it, else whitesmoke. */
const isvColor = (isv: number, max: number) =>
  isv >= max ? '#ffff00' : isv >= 0.9 * max ? '#00ff00' : 'whitesmoke'
/** Reborn's ISV number: at most two decimals. */
const isvText = (isv: number) => (Number.isFinite(isv) ? String(Math.round(100 * isv) / 100) : '0')

/** Reborn's ui__star_1_bonus .. ui__star_5_bonus with its avatarStars values. */
const STAR_BONUSES = [
  `ISV +${OUTFIT_STARS.oneStarIsvBonusPercent}%`,
  `+${OUTFIT_STARS.twoStarSkillSlots} skill slot`,
  `Outfit +${OUTFIT_STARS.threeStarBonusEnhancements}`,
  `Skill Imprint +${OUTFIT_STARS.fourStarImprintBonusPercent} percentage points`,
  `Secret Technique at ${OUTFIT_STARS.fiveStarSecretTechniqueThresholdPercent}% HP and +${OUTFIT_STARS.fiveStarSkillSlots} skill slot`,
]

/** Reborn's imprint elements (skill__20e0..20e2--name, tooltip__damage--*), element e = 0-9. */
const IMPRINT_ELEMENTS = [
  ['Fire', 'Fire Damage'],
  ['Water', 'Water Damage'],
  ['Earth', 'Earth Damage'],
  ['Lightning', 'Lightning Damage'],
  ['Wind', 'Wind Damage'],
  ['Body', 'Body Damage'],
  ['Sealing', 'Sealing Effects'],
  ['Tool', 'Tool Damage'],
  ['Illusion', 'Illusion Damage'],
  ['Healing', 'Healing'],
] as const
const IMPRINT_TIERS = [
  ['Basic', 5],
  ['Expert', 10],
  ['Master', 15],
] as const
/** Reborn's Secret Technique (outfit_skill__10000) and its 15% HP threshold. */
const SECRET_TECHNIQUE = 10000
const SECRET_THRESHOLD = 15
const SECRET_CHANCE = 10

/**
 * Reborn's outfit_skill__<id> lines: "<name>:" then its effect, the fourth star adding 5 points
 * to an element imprint and the fifth raising the Secret Technique threshold.
 */
export function imprintLines(skillId: number, stars = 0) {
  if (skillId === SECRET_TECHNIQUE) {
    const below =
      stars >= 5 ? OUTFIT_STARS.fiveStarSecretTechniqueThresholdPercent : SECRET_THRESHOLD
    return [
      'Secret Technique:',
      `${SECRET_CHANCE}% chance to unleash a powerful move when enemy below ${below}% health.`,
    ]
  }
  const element = IMPRINT_ELEMENTS[Math.floor((skillId - 2000) / 10)]
  const tier = IMPRINT_TIERS[skillId % 10]
  if (skillId < 2000 || !element || !tier) return [`Skill ${skillId}:`]
  const bonus =
    stars >= 4 && isStarredImprint(skillId) ? OUTFIT_STARS.fourStarImprintBonusPercent : 0
  return [`${element[0]} ${tier[0]}:`, `* Increase ${element[1]} by ${tier[1] + bonus}%.`]
}

/**
 * Reborn's outfit body: REQUIREMENTS, STAR BONUSES n/max, ISV (each stat at the viewer's level
 * with the star bonuses, its ISV and the recast cap), BMV and SKILL IMPRINTS.
 */
function OutfitSections({
  outfit,
  required,
  level,
}: {
  outfit: NonNullable<ItemInfo['outfit']>
  required: number
  level?: number
}) {
  const at = Math.max(1, level ?? 1)
  const { stars } = outfit
  const tier = starTier(outfit.plus, stars)
  return (
    <>
      <Section title="Requirements">
        <Row label="Required Level:" value={required} warn={!!level && level < required} />
      </Section>
      {stars > 0 && (
        <Section title="Star Bonuses" subtitle={`${stars}/${OUTFIT_STARS.maxStars}`}>
          {STAR_BONUSES.slice(0, stars).map((bonus, i) => (
            <p key={bonus} className="flex gap-2 text-[#ffdf85]">
              <span>★ {i + 1}</span>
              <span>{bonus}</span>
            </p>
          ))}
        </Section>
      )}
      <Section title="ISV">
        {STATS.map((name, i) => {
          const isv = starIsv(outfit.isv[i]! / 100, stars)
          const max = starIsv(outfit.maxIsv[i]! / 100, stars)
          return (
            <Row
              key={name}
              label={name}
              value={
                <span style={{ color: isvColor(isv, max) }}>
                  {Math.floor(outfitStat(isv, tier, at))} ({isvText(isv)}) | Max ({isvText(max)})
                </span>
              }
            />
          )
        })}
      </Section>
      {outfit.bmv.some((n) => n > 0) && (
        <Section title="BMV">
          <Lines lines={outfit.bmv.flatMap((n, i) => (n > 0 ? [BMV[i]!(n / 100)] : []))} />
        </Section>
      )}
      {outfit.skills.length > 0 && (
        <Section title="Skill Imprints">
          {outfit.skills.map((id) => (
            <Lines key={id} lines={imprintLines(id, stars)} />
          ))}
        </Section>
      )}
    </>
  )
}

/** Reborn's item-info__skill-line: light-blue italic lines. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <div className="mb-1 flex flex-col text-[11px] text-[#7ed7ff] italic">
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  )
}

const PET_ROWS = [
  { kind: 1, label: 'Aura' },
  { kind: 2, label: 'Aid' },
  { kind: 3, label: 'Passive' },
] as const

/** Reborn's pet body: a rule, then Aura, Aid and Passive with the skill icons of each. */
function PetSkills({ skills }: { skills: { skillId: number; kind: number }[] }) {
  return (
    <>
      <Rule />
      {PET_ROWS.map(({ kind, label }) => (
        <p
          key={kind}
          aria-label={`${label} skills`}
          className="flex min-h-[26px] items-center gap-1"
        >
          {label}:
          {skills
            .filter((skill) => skill.kind === kind)
            .map(({ skillId }) => (
              <img
                key={skillId}
                src={petSkillIcon(skillId)}
                alt={plainText(`lg_Skill_${skillId}`, `Skill ${skillId}`)}
                className="mr-1 size-[24px]"
              />
            ))}
        </p>
      ))}
    </>
  )
}

function Rule() {
  return <div className="my-1 h-px bg-linear-to-r from-transparent via-[#d8b060] to-transparent" />
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="mt-1.5">
      <h4 className="flex justify-between text-[11px] font-bold text-[#ffdf85] uppercase">
        {title}
        {subtitle && <span>{subtitle}</span>}
      </h4>
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
