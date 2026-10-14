// Inventory window laid out like Pockie Ninja Reborn's (docs/ui-layout-reborn.md, "Inventory"):
// equipment columns around the character, then the bag grid with its page tabs. Positions are
// the measured ones, relative to the window content (Reborn's x - 5, y - 31).
import { useId, useState, type CSSProperties } from 'react'
import {
  errorMessage,
  useCharacter,
  useEquipItem,
  useInventory,
  useUnequipItem,
  useUseItem,
  usePendingTreasure,
} from './api'
import { BuffsPanel } from './BuffsPanel'
import { TreasurePanel } from './TreasurePanel'
import { useOutfitStand } from './art'
import { BagForgeButtons, GearIcon, ItemForgeActions, useGear } from './forge'
import type { GearView } from '@pockie/shared'
import { itemIcon } from './ItemIcon'
import { completedNotice } from './QuestLog'
import { GameButton, Notice } from './skin'
import { WING_ICONS } from './wings'
import { GameText, plainText } from './text'
import type { ActionResult, BagHighlight, InventoryItem } from './types'
import { isEquipment, isUsable } from './world'

/** Whether a bag item is what the current tutorial step asks for. */
const isHighlighted = (item: InventoryItem, highlight: BagHighlight | undefined) =>
  !!highlight &&
  ('itemId' in highlight
    ? item.itemId === highlight.itemId
    : isEquipment(item.itemId) && !item.equippedSlot && item.fitsOutfit !== false)

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
/** Bag tabs I-X of 5 x 3 cells. ponytail: items past the 150th are not shown; page on if bags grow. */
const BAG_COLUMNS = 5
const PAGE_SIZE = BAG_COLUMNS * 3

/**
 * Equipment slots: `slot` is the item's EquipType (server equippedSlot). Outfit and Pet have no
 * items yet, so they always show their empty picture. `art` is drawn at half its exported size.
 * The Wing slot (M6 decision 22) has no 2011 picture, so it uses a plain cell on the backdrop.
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
  { slot: 'Wing', label: 'Wing', art: null, size: 51, at: [247, 247, 55, 55] },
] as const

const box = ([left, top, width, height]: readonly number[]): CSSProperties => ({
  left,
  top,
  width,
  height,
})

type Kind = 'use' | 'equip' | 'unequip'
type Run = (item: InventoryItem, kind: Kind) => void
const VERBS: Record<Kind, string> = { use: 'Used', equip: 'Equipped', unequip: 'Unequipped' }

export function Inventory({ highlight }: { highlight?: BagHighlight }) {
  const inventory = useInventory()
  const use = useUseItem()
  const pendingTreasure = usePendingTreasure()
  const [treasureBox, setTreasureBox] = useState<InventoryItem | null>(null)
  const [treasureVisible, setTreasureVisible] = useState(false)
  const [buffsVisible, setBuffsVisible] = useState(false)
  const equip = useEquipItem()
  const unequip = useUnequipItem()
  const gear = useGear().data ?? {}
  const actions = { use, equip, unequip }
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState<number | null>(null)

  const run: Run = async (item, kind) => {
    setNotice(null)
    if (kind === 'use' && /^i15900[0-3]$/.test(item.itemId)) {
      setTreasureBox(item)
      setTreasureVisible(true)
      return
    }
    try {
      const result = await actions[kind].mutateAsync(item.id)
      const name = plainText(item.nameKey, 'the item')
      const completed =
        kind === 'unequip' ? '' : completedNotice((result as ActionResult).completed)
      setNotice({ tone: 'info', text: `${VERBS[kind]} ${name}.${completed}` })
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
    }
  }
  const busy = use.isPending || equip.isPending || unequip.isPending

  if (inventory.isPending) return <p>Opening your bag...</p>
  if (inventory.isError) return <Notice tone="error">We could not open your bag.</Notice>

  const bag = inventory.data.filter((item) => !item.equippedSlot)
  const marked = bag.find((item) => isHighlighted(item, highlight))
  // The tutorial's item is selected (and its page shown) until the player picks another.
  const selected = bag.find((item) => item.id === selectedId) ?? marked
  const worn = inventory.data.find((item) => item.id === selectedId && item.equippedSlot)
  const markedPage = marked ? Math.floor(bag.indexOf(marked) / PAGE_SIZE) : 0
  const shownPage = page ?? markedPage
  const shown = bag.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE)

  return (
    <div className="relative -m-3 h-[513px] w-[369px] bg-[#25282b] font-game text-xs">
      <BagPages />
      <GameButton
        className="absolute top-[90px] left-[100px] z-10"
        disabled={treasureVisible}
        onClick={() => setBuffsVisible(true)}
      >
        Buffs and titles
      </GameButton>
      {buffsVisible && <BuffsPanel onClose={() => setBuffsVisible(false)} />}
      {pendingTreasure.data?.treasure && !treasureVisible && (
        <GameButton
          className="absolute top-[120px] left-[100px] z-10"
          onClick={() => setTreasureVisible(true)}
        >
          Resume treasure
        </GameButton>
      )}
      {treasureVisible && (
        <TreasurePanel
          box={treasureBox}
          pending={pendingTreasure.data?.treasure ?? null}
          onClose={() => {
            setTreasureVisible(false)
            setTreasureBox(null)
          }}
        />
      )}

      <Equipment items={inventory.data} selectedId={selectedId} onSelect={setSelectedId} />
      {worn && (
        <div className="absolute top-[331px] left-[288px] flex w-[75px] flex-col gap-[5px] text-[11px] text-ink-game">
          <p className="font-bold">
            <GameText k={worn.nameKey} fallback="Unknown item" />
          </p>
          <GameButton
            disabled={busy}
            aria-label={`Unequip ${plainText(worn.nameKey, 'item')}`}
            onClick={() => run(worn, 'unequip')}
            className="h-[25px] w-[75px]"
          >
            Unequip
          </GameButton>
        </div>
      )}
      <div className="game-inset absolute top-[313px] left-0 h-[200px] w-[369px]" />
      <div
        role="tabpanel"
        aria-label={`Bag ${ROMAN[shownPage]}`}
        className="game-inset absolute top-[340px] left-[5px] h-[170px] w-[279px]"
      >
        <ul
          aria-label="Bag"
          className="absolute top-[5px] left-[5px] grid h-[160px] w-[271px] grid-cols-[repeat(5,51px)] content-start gap-x-[4px] gap-y-[3.5px]"
          style={{ background: 'var(--ui-slot) 0 0 / 51px 51px space' }}
        >
          {shown.map((item) => (
            <BagCell
              key={item.id}
              item={item}
              highlighted={isHighlighted(item, highlight)}
              selected={item === selected}
              gear={gear[item.id]}
              busy={busy}
              onSelect={() => setSelectedId(item.id)}
              run={run}
            />
          ))}
        </ul>
        {bag.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-white [text-shadow:var(--shadow-game-text)]">
            Your bag is empty.
          </p>
        )}
      </div>
      <div role="tablist" aria-label="Bag tabs" className="absolute top-[318px] left-[10px] flex">
        {ROMAN.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={index === shownPage}
            onClick={() => setPage(index)}
            className="game-tab h-[22px] w-[27px] px-0 text-[13px] tracking-[-0.5px] text-black"
          >
            {label}
          </button>
        ))}
      </div>
      {bag.length > 0 && !selected && !worn && (
        <p className="absolute top-[331px] left-[288px] w-[75px] text-[11px] text-ink-game">
          Select an item.
        </p>
      )}
      <div className="absolute bottom-[6px] left-[288px] w-[75px] text-[11px]">
        <BagForgeButtons pageItemIds={shown.map((item) => item.id)} />
      </div>
      {notice && (
        <div className="absolute bottom-[213px] left-[69px] w-[231px]">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
    </div>
  )
}

/** Bag pages I-V: the bag is a single page today, so only I is open. */
function BagPages() {
  return (
    <div
      role="group"
      aria-label="Bag pages"
      className="game-panel-small absolute top-[6px] left-[32px] flex h-[32px] w-[305px] gap-[4px] pt-[3px] pl-[4px]"
    >
      {ROMAN.slice(0, 5).map((label, index) => (
        <GameButton
          key={label}
          small
          aria-pressed={index === 0}
          disabled={index > 0}
          className="h-[24px] w-[56px]"
        >
          {label}
        </GameButton>
      ))}
    </div>
  )
}

/**
 * The equipment columns, the character backdrop and the slots with what is worn. Selecting a
 * worn item shows it in the side column with its Unequip button, like a bag item.
 */
function Equipment({
  items,
  selectedId,
  onSelect,
}: {
  items: InventoryItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const character = useCharacter().data
  return (
    <>
      <div className="game-equip-column absolute top-[46px] left-0 h-[262px] w-[63px]" />
      <div className="game-equip-column absolute top-[46px] left-[306px] h-[262px] w-[63px]" />
      <div className="game-equip-backdrop absolute top-[48px] left-[65px] h-[256px] w-[239px]">
        {character && <StandPose clothing={character.clothing} />}
      </div>
      {character && (
        <p className="game-title-plate absolute top-[52px] left-[103px] grid h-[36px] w-[164px] place-items-center text-[13px] font-bold text-[#e8e8e8] [text-shadow:var(--shadow-game-text)]">
          {character.name}
        </p>
      )}
      <ul aria-label="Equipment">
        {SLOTS.map(({ slot, label, art, size, at }) => {
          const worn = items.find((item) => item.equippedSlot === slot)
          const icon = worn && (itemIcon(worn.itemId)?.file ?? WING_ICONS[worn.itemId])
          return (
            <li
              key={slot}
              className="absolute grid place-items-center"
              style={{
                ...box(at),
                background: `var(--ui-slot${art ? `-${art}` : ''}) center / ${typeof size === 'number' ? `${size}px` : size} no-repeat`,
              }}
            >
              {icon && <img src={icon} alt="" className="size-full object-contain p-[2px]" />}
              {worn && (
                <button
                  type="button"
                  aria-label={plainText(worn.nameKey, 'Unknown item')}
                  aria-pressed={worn.id === selectedId}
                  title={plainText(worn.nameKey, 'Unknown item')}
                  onClick={() => onSelect(worn.id)}
                  className={`absolute inset-0 cursor-pointer ${
                    worn.id === selectedId ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''
                  }`}
                />
              )}
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
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** First frame of the outfit's stand animation at twice its size, standing on the platform. */
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

/**
 * One bag cell: the icon (selecting it shows the item in the side column), and, when selected,
 * its name and action there (positioned against the grid, so they land in the side column).
 */
function BagCell({
  item,
  highlighted,
  selected,
  gear,
  busy,
  onSelect,
  run,
}: {
  item: InventoryItem
  highlighted: boolean
  selected: boolean
  gear?: GearView
  busy: boolean
  onSelect: () => void
  run: Run
}) {
  const name = plainText(item.nameKey, 'Unknown item')
  return (
    <li>
      <GearIcon
        itemId={item.itemId}
        nameKey={item.nameKey}
        gear={gear}
        className={`size-[51px] ${
          highlighted ? 'ring-2 ring-[#ffb300]' : ''
        } ${selected ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''}`}
      >
        {item.count > 1 && (
          <span aria-hidden="true" className="absolute right-[3px] bottom-px text-[11px] font-bold">
            {item.count}
          </span>
        )}
        <button
          type="button"
          aria-label={name}
          aria-pressed={selected}
          title={name}
          onClick={onSelect}
          className="absolute inset-0 cursor-pointer"
        />
      </GearIcon>
      {selected ? (
        <ItemDetails item={item} gear={gear} highlighted={highlighted} busy={busy} run={run} />
      ) : (
        <span className="sr-only">
          <span>
            <GameText k={item.nameKey} fallback="Unknown item" />
          </span>
          {item.count > 1 && <span> x{item.count}</span>}
          {highlighted && (
            <>
              {' '}
              (<span>Next step</span>)
            </>
          )}
        </span>
      )}
    </li>
  )
}

/** The selected item in the side column: name, tutorial marker and its Use / Equip button. */
function ItemDetails({
  item,
  gear,
  highlighted,
  busy,
  run,
}: {
  item: InventoryItem
  gear?: GearView
  highlighted: boolean
  busy: boolean
  run: Run
}) {
  const name = plainText(item.nameKey, 'item')
  return (
    // Positioned against the bag grid (window 10,345): the side column is at window 288,331.
    <div className="absolute top-[-14px] left-[278px] flex w-[75px] flex-col gap-[5px] text-[11px] text-ink-game">
      <p className="font-bold">
        <GameText k={item.nameKey} fallback="Unknown item" />
        {item.count > 1 && <span className="sr-only"> x{item.count}</span>}
      </p>
      {highlighted && (
        <span className="self-start rounded bg-[#ffb300] px-1 font-bold text-ink-game">
          Next step
        </span>
      )}
      {isEquipment(item.itemId) ? (
        <EquipButton item={item} busy={busy} onEquip={() => run(item, 'equip')} />
      ) : (
        isUsable(item.itemId) && (
          <GameButton
            disabled={busy}
            aria-label={`Use ${name}`}
            onClick={() => run(item, 'use')}
            className="h-[25px] w-[75px]"
          >
            Use
          </GameButton>
        )
      )}
      <ItemForgeActions item={item} gear={gear} />
    </div>
  )
}

const UNFIT_REASON = "Your outfit can't use this weapon."

/** Equip, or a disabled Equip with the reason when the outfit's weapon class cannot wear it. */
function EquipButton({
  item,
  busy,
  onEquip,
}: {
  item: InventoryItem
  busy: boolean
  onEquip: () => void
}) {
  const id = useId()
  const fits = item.fitsOutfit !== false
  return (
    <>
      <GameButton
        disabled={busy || !fits}
        aria-label={`Equip ${plainText(item.nameKey, 'item')}`}
        aria-describedby={fits ? undefined : id}
        onClick={onEquip}
        className="h-[25px] w-[75px]"
      >
        Equip
      </GameButton>
      {!fits && (
        <span id={id} className="text-[#8a1610]">
          {UNFIT_REASON}
        </span>
      )}
    </>
  )
}
