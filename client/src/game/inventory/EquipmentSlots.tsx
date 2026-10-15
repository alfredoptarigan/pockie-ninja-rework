// The upper half of Reborn's Inventory: the equipment-set bar, the equipment columns around the
// character pose (Talent, Blood Limit, Hide), the title plate and the slots with what the active
// equipment set wears.
// Positions are the measured ones, relative to the window content (Reborn's x - 5, y - 31).
import { starTier, type Character, type GearView } from '@pockie/shared'
import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { useCharacterStats } from '../api'
import { useOutfitStand } from '../art'
import { useBloodlines } from '../bloodlines/ninja-house'
import { number, shortNumber } from '../Hud'
import { PetSlot } from '../pets'
import { GameButton } from '../skin'
import { GameText, plainText } from '../text'
import type { InventoryItem } from '../types'
import { useOpenWindow } from '../windows'
import { ItemPicture, OutfitPlus, pointOf, ROMAN, type Point } from './BagGrid'
import { itemName, lookOf, wornOutfit } from './outfits'
import { HideStats } from './HideStats'
import { TitleSelect } from './TitleSelect'

/**
 * Equipment slots: `slot` is the item's EquipType (server equippedSlot). The Pet slot shows the
 * active pet (not an item). `art` is drawn at half its exported size. The Wing slot (M6
 * decision 22) has no 2011 picture: a plain cell, at 70% like Reborn's.
 */
const SLOTS = [
  { slot: 'Outfit', label: 'Outfit', art: 'outfit', size: 61, at: [4, 50, 55, 55] },
  { slot: 'Weapon', label: 'Weapon', art: 'weapon', size: '71px 98.5px', at: [4, 107, 55, 83] },
  { slot: 'Glove', label: 'Gloves', art: 'glove', size: 73, at: [4, 192, 55, 55] },
  { slot: 'Pet', label: 'Pet', art: 'pet', size: 71, at: [4, 249, 55, 55] },
  { slot: 'Ring', label: 'Ring', art: 'ring', size: 34, at: [309, 49, 28, 28] },
  { slot: 'Amulet', label: 'Amulet', art: 'amulet', size: 34, at: [338, 49, 28, 28] },
  { slot: 'Hat', label: 'Hat', art: 'hat', size: 73, at: [310, 78, 55, 55] },
  { slot: 'Cloth', label: 'Armour', art: 'cloth', size: 73, at: [310, 135, 55, 55] },
  { slot: 'Girdle', label: 'Belt', art: 'belt', size: 73, at: [310, 192, 55, 55] },
  { slot: 'Shoes', label: 'Shoes', art: 'shoes', size: 73, at: [310, 249, 55, 55] },
  { slot: 'Wing', label: 'Wing', art: null, size: 51, at: [242, 220, 55, 55] },
] as const

/** Weapon slot picture by the outfit's weapon class (1 Blunt, 2 Sharp, else Fists / any). */
const WEAPON_ART: Record<number, string> = { 1: 'weapon-blunt', 2: 'weapon-sharp' }
/** Reborn's drop-target tints. */
const FIT_TINT = { good: 'rgba(0, 128, 0, 0.5)', bad: 'rgba(255, 0, 0, 0.3)' }
type Fit = keyof typeof FIT_TINT

const box = ([left, top, width, height]: readonly number[]): CSSProperties => ({
  left,
  top,
  width,
  height,
})

/** Reborn's equipment sets I-V; IV and V need VIP. */
const SET_COUNT = 5
const FIRST_VIP_SET = 4
const VIP_REQUIRED = 'VIP required for equipment sets'
/** Reborn's set button looks: worn set brighter, empty sets and locked VIP sets greyed. */
const SET_LOOK = {
  active: { filter: 'brightness(1.2)' },
  filled: {},
  empty: { filter: 'grayscale(0.65)', opacity: 0.65 },
  vip: { filter: 'grayscale(1)', opacity: 0.4 },
} satisfies Record<string, CSSProperties>
type SetState = keyof typeof SET_LOOK

/** Whether the item is worn in the active equipment set (a worn row without a set is set I). */
export const isWorn = (item: InventoryItem, activeSet = 1) =>
  !!item.equippedSlot && (item.equippedSet ?? 1) === activeSet

const isVip = (character: Character | null | undefined, now: number) =>
  !!character?.vipUntil && Date.parse(character.vipUntil) > now

/** The equipment-set bar: a click wears that set (nothing for the worn one or a locked VIP set). */
export function SetBar({
  items,
  character,
  onSelect,
}: {
  items: InventoryItem[]
  character?: Character | null
  onSelect: (set: number) => void
}) {
  const [now] = useState(Date.now)
  const [tip, setTip] = useState<number | null>(null)
  const activeSet = character?.activeSet ?? 1
  const vip = isVip(character, now)
  const filled = (set: number) => items.some((item) => isWorn(item, set))
  const stateOf = (set: number): SetState => {
    if (set >= FIRST_VIP_SET && !vip) return 'vip'
    if (set === activeSet) return 'active'
    return filled(set) ? 'filled' : 'empty'
  }
  return (
    <div
      role="group"
      aria-label="Equipment sets"
      className="game-panel-small absolute top-[6px] left-[32px] z-[1] flex h-[32px] w-[305px] gap-[4px] pt-[3px] pl-[4px]"
    >
      {ROMAN.slice(0, SET_COUNT).map((label, index) => {
        const set = index + 1
        const state = stateOf(set)
        return (
          <GameButton
            key={label}
            small
            data-state={state}
            aria-pressed={set === activeSet}
            aria-disabled={state === 'vip' || undefined}
            onClick={() => state !== 'vip' && set !== activeSet && onSelect(set)}
            onPointerEnter={() => setTip(set)}
            onPointerLeave={() => setTip(null)}
            onFocus={() => setTip(set)}
            onBlur={() => setTip(null)}
            className="h-[24px] w-[56px] text-[11px] font-bold uppercase"
            style={SET_LOOK[state]}
          >
            {label}
          </GameButton>
        )
      })}
      {tip !== null && (
        <SetTooltip set={tip} locked={stateOf(tip) === 'vip'} filled={filled(tip)} />
      )}
    </div>
  )
}

function SetTooltip({ set, locked, filled }: { set: number; locked: boolean; filled: boolean }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-[30px] w-[170px] p-2 font-sans text-xs text-white"
      style={{
        left: 4 + 60 * (set - 1),
        borderStyle: 'solid',
        borderImage: 'var(--ui-tooltip) var(--ui-tooltip-slice) fill / var(--ui-tooltip-border)',
      }}
    >
      {locked ? (
        <p>{VIP_REQUIRED}</p>
      ) : (
        <>
          <p className="text-center font-bold">Set Status</p>
          <p className="text-center">{filled ? 'Has Equipment' : 'Empty'}</p>
        </>
      )}
    </div>
  )
}

/** Whether the held bag item may go in `slot` (undefined: the slot is not its slot). */
function fitOf(slot: string, held: InventoryItem | null, level: number): Fit | undefined {
  if (!held || held.equippedSlot || held.info?.equipSlot !== slot) return undefined
  return held.info.level > level || held.fitsOutfit === false ? 'bad' : 'good'
}

export function Equipment({
  items,
  character,
  gear,
  held,
  outfitMenuOpen,
  onEffects,
  onSlot,
  onOutfitMenu,
  onTip,
}: {
  items: InventoryItem[]
  character?: Character | null
  gear: Record<string, GearView>
  held: InventoryItem | null
  outfitMenuOpen: boolean
  /** Opens the active effects panel. */
  onEffects: () => void
  /** A click on a slot, with what it wears. */
  onSlot: (slot: string, worn?: InventoryItem) => void
  onOutfitMenu: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  /** Tooltip of a worn item id, or "outfit". */
  onTip: (id: string | null, at?: Point) => void
}) {
  const openWindow = useOpenWindow()
  const level = character?.level ?? 1
  const weaponArt = WEAPON_ART[character?.weaponClass ?? 0] ?? 'weapon'
  return (
    <>
      <div className="game-equip-column absolute top-[46px] left-0 h-[262px] w-[63px]" />
      <div className="game-equip-column absolute top-[46px] left-[306px] h-[262px] w-[63px]" />
      <div className="game-equip-backdrop absolute top-[48px] left-[65px] h-[256px] w-[239px]">
        {character && (
          <>
            <BloodlineBackground />
            <Pose clothing={lookOf(character)} />
          </>
        )}
        <BattlePower />
        <GameButton
          onClick={onEffects}
          className="absolute top-[115px] left-[4px] h-[42px] w-[45px] min-w-0! px-0!"
        >
          Effects
        </GameButton>
        <GameButton
          onClick={() => openWindow('talents')}
          className="absolute top-[160px] left-[4px] h-[42px] w-[45px] min-w-0! px-0!"
        >
          Talent
        </GameButton>
        <GameButton
          onClick={() => openWindow('bloodlines')}
          className="absolute top-[205px] left-[4px] h-[42px] w-[45px] min-w-0! px-0! leading-tight whitespace-normal"
        >
          Blood Limit
        </GameButton>
        <HideStats character={character} />
      </div>
      <TitleSelect />
      <ul aria-label="Equipment">
        {SLOTS.map(({ slot, label, art, size, at }) => {
          // The Outfit slot falls back to set I's outfit (Reborn).
          const worn =
            slot === 'Outfit'
              ? wornOutfit(items, character?.activeSet)
              : items.find(
                  (item) => isWorn(item, character?.activeSet) && item.equippedSlot === slot,
                )
          const fit = fitOf(slot, held, level)
          const picture = art === 'weapon' ? weaponArt : art
          return (
            <li
              key={slot}
              data-fit={fit}
              className={`absolute grid place-items-center ${art ? '' : 'opacity-70'}`}
              style={{
                ...box(at),
                background: `var(--ui-slot${picture ? `-${picture}` : ''}) center / ${typeof size === 'number' ? `${size}px` : size} no-repeat`,
              }}
            >
              {worn && (
                <span className={`size-full p-[2px] ${worn.id === held?.id ? 'opacity-0' : ''}`}>
                  <ItemPicture item={worn} gear={gear[worn.id]} decorative />
                </span>
              )}
              {fit && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{ background: FIT_TINT[fit] }}
                />
              )}
              {slot === 'Outfit' ? (
                <OutfitSlot
                  item={worn}
                  level={level}
                  holding={!!held}
                  open={outfitMenuOpen}
                  onClick={() => onSlot(slot, worn)}
                  onMenu={onOutfitMenu}
                  onTip={onTip}
                />
              ) : worn ? (
                <WornButton item={worn} onClick={() => onSlot(slot, worn)} onTip={onTip} />
              ) : (
                held && (
                  <button
                    type="button"
                    aria-label={`${label} slot`}
                    onClick={() => onSlot(slot)}
                    className="absolute inset-0 cursor-pointer"
                  />
                )
              )}
              {slot === 'Pet' ? (
                <PetSlot />
              ) : (
                slot !== 'Outfit' && (
                  <span className="sr-only">
                    {label}:{' '}
                    {worn ? (
                      <>
                        <GameText k={worn.nameKey} fallback="Unknown item" /> <span>Equipped</span>
                      </>
                    ) : (
                      'empty'
                    )}
                  </span>
                )
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function WornButton({
  item,
  onClick,
  onTip,
}: {
  item: InventoryItem
  onClick: () => void
  onTip: (id: string | null, at?: Point) => void
}) {
  return (
    <button
      type="button"
      aria-label={plainText(item.nameKey, 'Unknown item')}
      onClick={onClick}
      onPointerEnter={(event) => onTip(item.id, pointOf(event))}
      onPointerMove={(event) => onTip(item.id, pointOf(event))}
      onPointerLeave={() => onTip(null)}
      onFocus={(event) => onTip(item.id, pointOf(event))}
      onBlur={() => onTip(null)}
      className="absolute inset-0 cursor-pointer"
    />
  )
}

/**
 * Reborn's outfit slot shows the worn outfit as an item with "+N" (red under its level). A click
 * does nothing unless an outfit is held (then it is worn); a right click (or Enter) opens its
 * one-entry menu, Manage.
 */
function OutfitSlot({
  item,
  level,
  holding,
  open,
  onClick,
  onMenu,
  onTip,
}: {
  item?: InventoryItem
  level: number
  holding: boolean
  open: boolean
  onClick: () => void
  onMenu: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  onTip: (id: string | null, at?: Point) => void
}) {
  if (!item)
    return holding ? (
      <button
        type="button"
        aria-label="Outfit slot"
        onClick={onClick}
        className="absolute inset-0 cursor-pointer"
      />
    ) : (
      <span className="sr-only">Outfit: empty</span>
    )
  const name = itemName(item)
  const outfit = item.info?.outfit
  return (
    <>
      {outfit && (
        <OutfitPlus
          plus={starTier(outfit.plus, outfit.stars)}
          under={(item.info?.level ?? 0) > level}
        />
      )}
      <button
        type="button"
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => holding && onClick()}
        onContextMenu={onMenu}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          onMenu(event)
        }}
        onPointerEnter={(event) => onTip(item.id, pointOf(event))}
        onPointerMove={(event) => onTip(item.id, pointOf(event))}
        onPointerLeave={() => onTip(null)}
        onFocus={(event) => onTip(item.id, pointOf(event))}
        onBlur={() => onTip(null)}
        className={`absolute inset-0 ${holding ? 'cursor-pointer' : 'cursor-default'}`}
      />
      <span className="sr-only">Outfit: {name}</span>
    </>
  )
}

/**
 * Reborn's active bloodline art (main.js `xc`, @2579589): icons/bloodlines/bg/<active[0]>.png,
 * 155px, rotating once every 9 s behind the pose (bloodline-spin in index.css). It sits in the
 * pose box (14,11 208x240), bottom 5, centred, raised by a quarter of its height.
 */
function BloodlineBackground() {
  const first = useBloodlines().data?.limits.find((limit) => limit.activeSlot === 0)
  if (!first) return null
  return (
    <div aria-hidden="true" className="absolute top-[11px] left-[14px] h-[240px] w-[208px]">
      <img
        src={`/assets/reborn/icons/bloodlines/bg/${first.limitId}.webp`}
        alt=""
        data-testid="bloodline-background"
        className="bloodline-spin absolute bottom-[5px] left-1/2 size-[155px] max-w-none"
      />
    </div>
  )
}

/**
 * Reborn's "BP: 31K" under the pose (its View Character `a.bp` block, @2228672): KOMIKAK 16px
 * black, a 2px black outline under a yellow-to-orange gradient, 29px above the backdrop's foot;
 * the full number on hover.
 */
function BattlePower() {
  const power = useCharacterStats().data?.battlePower
  if (power === undefined) return null
  const text = `BP: ${shortNumber(power)}`
  const font = 'font-[KOMIKAK,Arial] text-[16px] font-black'
  return (
    <div
      title={number(power)}
      className="pointer-events-none absolute top-[227px] left-0 h-[18px] w-full text-center"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 text-black [-webkit-text-stroke:2px_#000] ${font}`}
      >
        {text}
      </span>
      <span
        aria-label={`Battle Power ${number(power)}`}
        className={`relative bg-linear-to-b from-[#ffee00] via-[#ff9500] to-[#ff5500] bg-clip-text text-transparent ${font}`}
      >
        {text}
      </span>
    </div>
  )
}

/**
 * Reborn's inventory pose (poses/<outfit>.png, 191x320 drawn at 124x208). Outfits without one
 * fall back to the first frame of the stand animation at twice its size.
 */
function Pose({ clothing }: { clothing: number }) {
  const [missing, setMissing] = useState<number | null>(null)
  if (missing === clothing) return <StandPose clothing={clothing} />
  return (
    <img
      src={`/assets/reborn/poses/${clothing}.webp`}
      alt=""
      onError={() => setMissing(clothing)}
      className="absolute top-[38px] left-[56px] h-[208px] w-[124px] object-contain"
    />
  )
}

function StandPose({ clothing }: { clothing: number }) {
  const stand = useOutfitStand(clothing)
  if (!stand) return null
  const rows = Math.ceil(stand.frames / stand.columns)
  const width = stand.frameWidth * 2
  const height = stand.frameHeight * 2
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-[10px] left-1/2 -translate-x-1/2"
      style={{
        width,
        height,
        backgroundImage: `url(${stand.file})`,
        backgroundSize: `${width * stand.columns}px ${height * rows}px`,
      }}
    />
  )
}
