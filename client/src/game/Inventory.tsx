// Inventory window laid out like Pockie Ninja Reborn's (docs/ui-layout-reborn.md, "Inventory"):
// equipment columns around the character pose, then the bag: tabs I-X over a 10x6 grid of 27px
// tiles where each item covers its icon's tiles, and the six side buttons. Clicking or
// right-clicking an item opens its context menu (Reborn's #context-menu). Positions are the
// measured ones, relative to the window content (Reborn's x - 5, y - 31).
import { useCallback, useState, type CSSProperties, type MouseEvent } from 'react'
import {
  errorMessage,
  useCharacter,
  useEquipItem,
  useInventory,
  useUnequipItem,
  useUseItem,
  usePendingTreasure,
} from './api'
import { BuffsPanel, TitleText } from './BuffsPanel'
import { TreasurePanel } from './TreasurePanel'
import { useOutfitStand } from './art'
import { footprint, layoutBag, TILE, type Placed } from './bag-layout'
import { GearIcon, useGear } from './forge'
import { useAppraise, useRepair } from './forge/api'
import type { GearView } from '@pockie/shared'
import { itemIcon } from './ItemIcon'
import { ItemMenu, menuAt, type MenuEntry } from './ItemMenu'
import { completedNotice } from './QuestLog'
import { GameButton, Notice } from './skin'
import { WING_ICONS } from './wings'
import { cardName } from './cards'
import { PetSlot } from './pets'
import { GameText, plainText } from './text'
import type { ActionResult, BagHighlight, InventoryItem } from './types'
import { isEquipment, isUsable } from './world'
import { useOpenWindow } from './windows'

/** Whether a bag item is what the current tutorial step asks for. */
const isHighlighted = (item: InventoryItem, highlight: BagHighlight | undefined) =>
  !!highlight &&
  ('itemId' in highlight
    ? item.itemId === highlight.itemId
    : isEquipment(item.itemId) && !item.equippedSlot && item.fitsOutfit !== false)

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
/** Icon size for a run of 1-3 tiles (27px each, less Reborn's 3px gap): 24, 51 and 78px. */
const WIDTHS = ['', 'w-[24px]', 'w-[51px]', 'w-[78px]']
const HEIGHTS = ['', 'h-[24px]', 'h-[51px]', 'h-[78px]']

/**
 * Equipment slots: `slot` is the item's EquipType (server equippedSlot). Outfit and Pet have no
 * items yet, so they always show their empty picture. `art` is drawn at half its exported size.
 * The Wing slot (M6 decision 22) has no 2011 picture: a plain cell, at 70% like Reborn's.
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

const box = ([left, top, width, height]: readonly number[]): CSSProperties => ({
  left,
  top,
  width,
  height,
})

type Kind = 'use' | 'equip' | 'unequip'
type Open = (item: InventoryItem, event: MouseEvent<HTMLElement>) => void
const VERBS: Record<Kind, string> = { use: 'Used', equip: 'Equipped', unequip: 'Unequipped' }
const UNFIT_REASON = "Your outfit can't use this weapon."

/** Reborn's Sort: the bag grouped by item, larger stacks first. */
const sortBag = (items: InventoryItem[]) =>
  [...items].sort((a, b) => a.itemId.localeCompare(b.itemId) || b.count - a.count)

export function Inventory({ highlight }: { highlight?: BagHighlight }) {
  const inventory = useInventory()
  const use = useUseItem()
  const equip = useEquipItem()
  const unequip = useUnequipItem()
  const appraise = useAppraise()
  const repair = useRepair()
  const pendingTreasure = usePendingTreasure()
  const gear = useGear().data ?? {}
  const [treasureBox, setTreasureBox] = useState<InventoryItem | null>(null)
  const [treasureVisible, setTreasureVisible] = useState(false)
  const [buffsVisible, setBuffsVisible] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [page, setPage] = useState<number | null>(null)
  const [sorted, setSorted] = useState(false)
  const [brief, setBrief] = useState(false)
  const closeMenu = useCallback(() => setMenu(null), [])
  const busy =
    use.isPending || equip.isPending || unequip.isPending || appraise.isPending || repair.isPending

  async function report(action: () => Promise<unknown>, done: (result: unknown) => string) {
    setNotice(null)
    try {
      setNotice({ tone: 'info', text: done(await action()) })
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
    }
  }

  function run(item: InventoryItem, kind: Kind) {
    if (kind === 'use' && /^i15900[0-3]$/.test(item.itemId)) {
      setNotice(null)
      setTreasureBox(item)
      setTreasureVisible(true)
      return
    }
    const name = plainText(item.nameKey, 'the item')
    void report(
      () => ({ use, equip, unequip })[kind].mutateAsync(item.id),
      (result) => {
        const completed =
          kind === 'unequip' ? '' : completedNotice((result as ActionResult).completed)
        const card = kind === 'use' ? (result as ActionResult).card : undefined
        const found = card ? ` You found ${cardName(card)}.` : ''
        return `${VERBS[kind]} ${name}.${found}${completed}`
      },
    )
  }

  /** Appraise or Repair through the forge, with its price in Stone. */
  function forgeEntry(verb: 'Appraise' | 'Repair', item: InventoryItem, cost: number): MenuEntry {
    const name = plainText(item.nameKey, 'the item')
    const mutate = verb === 'Appraise' ? appraise.mutateAsync : repair.mutateAsync
    return {
      label: `${verb} (${cost} Stone)`,
      name: `${verb} ${name} for ${cost} Stone`,
      disabled: busy,
      onSelect: () =>
        void report(
          () => mutate({ itemId: item.id }),
          () => `${verb === 'Appraise' ? 'Appraised' : 'Repaired'} ${name}.`,
        ),
    }
  }

  /** The context menu's actions for a bag or worn item. */
  function entries(item: InventoryItem): MenuEntry[] {
    const name = plainText(item.nameKey, 'item')
    const forged = gear[item.id]
    const list: MenuEntry[] = []
    const add = (kind: Kind, label: string, extra: Partial<MenuEntry> = {}) =>
      list.push({
        label,
        name: `${label} ${name}`,
        disabled: busy,
        onSelect: () => run(item, kind),
        ...extra,
      })
    if (item.equippedSlot) add('unequip', 'Unequip')
    else if (isEquipment(item.itemId)) {
      const fits = item.fitsOutfit !== false
      add('equip', 'Equip', { disabled: busy || !fits, reason: fits ? undefined : UNFIT_REASON })
    } else if (isUsable(item.itemId)) add('use', 'Use')
    if (forged && !forged.appraised) list.push(forgeEntry('Appraise', item, forged.appraiseCost))
    if (forged && forged.repairCost > 0) list.push(forgeEntry('Repair', item, forged.repairCost))
    return list
  }

  const openMenu: Open = (item, event) => setMenu({ id: item.id, ...menuAt(event) })

  if (inventory.isPending) return <p>Opening your bag...</p>
  if (inventory.isError) return <Notice tone="error">We could not open your bag.</Notice>

  const bag = inventory.data.filter((item) => !item.equippedSlot)
  const pages = layoutBag(sorted ? sortBag(bag) : bag, (item) => footprint(itemIcon(item.itemId)))
  const marked = bag.find((item) => isHighlighted(item, highlight))
  const markedPage = marked ? pages.findIndex((list) => list.some((p) => p.item === marked)) : 0
  const shownPage = page ?? markedPage
  const menuItem = menu && inventory.data.find((item) => item.id === menu.id)

  return (
    <div data-menu-root className="relative h-[513px] w-[369px] bg-[#25282b] font-game text-xs">
      <BagPages />
      <Equipment
        items={inventory.data}
        menuId={menu?.id ?? null}
        onOpen={openMenu}
        onTitle={() => setBuffsVisible(true)}
        brief={brief}
        onBrief={setBrief}
      />
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

      <div className="game-inset absolute top-[313px] left-0 h-[200px] w-[369px]" />
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
      <div
        role="tabpanel"
        aria-label={`Bag ${ROMAN[shownPage]}`}
        className="game-inset absolute top-[340px] left-[5px] h-[170px] w-[279px]"
      >
        <ul
          aria-label="Bag"
          className="absolute top-[5px] left-[5px] h-[160px] w-[271px]"
          style={{ background: `var(--ui-slot) 0 0 / ${TILE}px ${TILE}px` }}
        >
          {(pages[shownPage] ?? []).map((placed) => (
            <BagCell
              key={placed.item.id}
              placed={placed}
              highlighted={placed.item === marked}
              open={placed.item.id === menu?.id}
              gear={gear[placed.item.id]}
              brief={brief}
              onOpen={openMenu}
            />
          ))}
        </ul>
        {bag.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-white [text-shadow:var(--shadow-game-text)]">
            Your bag is empty.
          </p>
        )}
      </div>
      <SideButtons sorted={sorted} onSort={() => setSorted(!sorted)} />
      {menuItem && menu && (
        <ItemMenu
          title={plainText(menuItem.nameKey, 'Unknown item')}
          at={menu}
          entries={entries(menuItem)}
          onClose={closeMenu}
        />
      )}
      {notice && (
        <div className="absolute bottom-[213px] left-[69px] z-20 w-[231px]">
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
 * Reborn's side column (x 288 from y 331, 30 apart). Compose opens our forge (the Inscription
 * window is UI_YYEquipCompose), Collection the wing collection, Sort groups the bag.
 * ponytail: Multi Sell, Wardrobe and Reroll have no feature behind them yet, so they stay disabled.
 */
function SideButtons({ sorted, onSort }: { sorted: boolean; onSort: () => void }) {
  const openWindow = useOpenWindow()
  const buttons: { label: string; onClick?: () => void; pressed?: boolean }[] = [
    { label: 'Compose', onClick: () => openWindow('forge') },
    { label: 'Multi Sell' },
    { label: 'Collection', onClick: () => openWindow('wings') },
    { label: 'Wardrobe' },
    { label: 'Reroll' },
    { label: 'Sort', onClick: onSort, pressed: sorted },
  ]
  return (
    <div className="absolute top-[331px] left-[288px] flex w-[75px] flex-col gap-[5px]">
      {buttons.map(({ label, onClick, pressed }) => (
        <GameButton
          key={label}
          disabled={!onClick}
          aria-pressed={pressed}
          onClick={onClick}
          className="h-[25px] w-[75px] min-w-0! px-0! whitespace-nowrap"
        >
          {label}
        </GameButton>
      ))}
    </div>
  )
}

/**
 * The equipment columns, the backdrop with the title plate (it opens buffs and titles), the
 * pose, Talent / Blood Limit and the Hide box, and the slots with what is worn.
 */
function Equipment({
  items,
  menuId,
  onOpen,
  onTitle,
  brief,
  onBrief,
}: {
  items: InventoryItem[]
  menuId: string | null
  onOpen: Open
  onTitle: () => void
  brief: boolean
  onBrief: (brief: boolean) => void
}) {
  const character = useCharacter().data
  const openWindow = useOpenWindow()
  return (
    <>
      <div className="game-equip-column absolute top-[46px] left-0 h-[262px] w-[63px]" />
      <div className="game-equip-column absolute top-[46px] left-[306px] h-[262px] w-[63px]" />
      <div className="game-equip-backdrop absolute top-[48px] left-[65px] h-[256px] w-[239px]">
        {character && <Pose clothing={character.clothing} />}
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
        <label
          title="Click to hide detailed stats"
          className="absolute top-[230px] left-[183px] flex items-center gap-2 text-[13px] text-[#ffd27a]"
        >
          <input
            type="checkbox"
            checked={brief}
            onChange={(event) => onBrief(event.target.checked)}
            className="size-5 appearance-none border border-[#5a5a5a] bg-linear-to-b from-[#2a2a2a] to-[#1a1a1a] checked:after:block checked:after:text-center checked:after:leading-5 checked:after:text-[#ffd27a] checked:after:content-['✓']"
          />
          Hide
        </label>
      </div>
      <button
        type="button"
        aria-label="Buffs and titles"
        onClick={onTitle}
        className="game-title-plate absolute top-[52px] left-[103px] grid h-[36px] w-[164px] cursor-pointer place-items-center"
      >
        <TitleText className="text-[15px]" />
      </button>
      <ul aria-label="Equipment">
        {SLOTS.map(({ slot, label, art, size, at }) => {
          const worn = items.find((item) => item.equippedSlot === slot)
          const icon = worn && (itemIcon(worn.itemId)?.file ?? WING_ICONS[worn.itemId])
          const name = worn && plainText(worn.nameKey, 'Unknown item')
          return (
            <li
              key={slot}
              className={`absolute grid place-items-center ${art ? '' : 'opacity-70'}`}
              style={{
                ...box(at),
                background: `var(--ui-slot${art ? `-${art}` : ''}) center / ${typeof size === 'number' ? `${size}px` : size} no-repeat`,
              }}
            >
              {icon && <img src={icon} alt="" className="size-full object-contain p-[2px]" />}
              {worn && (
                <button
                  type="button"
                  aria-label={name}
                  aria-haspopup="menu"
                  aria-expanded={worn.id === menuId}
                  title={name}
                  onClick={(event) => onOpen(worn, event)}
                  onContextMenu={(event) => onOpen(worn, event)}
                  className={`absolute inset-0 cursor-pointer ${
                    worn.id === menuId ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''
                  }`}
                />
              )}
              {/* The active pet (M6) is not an item; PetSlot draws and names it. */}
              {slot === 'Pet' ? (
                <PetSlot />
              ) : (
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
              )}
            </li>
          )
        })}
      </ul>
    </>
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

/** One bag item over the tiles it covers; clicking it opens its context menu. */
function BagCell({
  placed: { item, x, y, w, h },
  highlighted,
  open,
  gear,
  brief,
  onOpen,
}: {
  placed: Placed<InventoryItem>
  highlighted: boolean
  open: boolean
  gear?: GearView
  brief: boolean
  onOpen: Open
}) {
  const name = plainText(item.nameKey, 'Unknown item')
  return (
    <li className="absolute" style={{ left: x * TILE, top: y * TILE }}>
      <GearIcon
        itemId={item.itemId}
        nameKey={item.nameKey}
        gear={gear}
        brief={brief}
        className={`${WIDTHS[w] ?? WIDTHS[2]} ${HEIGHTS[h] ?? HEIGHTS[2]} ${
          highlighted ? 'ring-2 ring-[#ffb300]' : ''
        } ${open ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''}`}
      >
        {item.count > 1 && (
          <span
            aria-hidden="true"
            className="absolute right-[2px] bottom-0 text-[11px] font-bold text-white [text-shadow:var(--shadow-game-text)]"
          >
            {item.count}
          </span>
        )}
        <button
          type="button"
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => onOpen(item, event)}
          onContextMenu={(event) => onOpen(item, event)}
          className="absolute inset-0 cursor-pointer"
        />
      </GearIcon>
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
    </li>
  )
}
