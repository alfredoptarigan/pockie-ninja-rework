// Inventory window as Pockie Ninja Reborn's (data/reborn-raw/audit-2026-10-14/reborn-windows-A-L.md,
// "Inventory"; docs/audit/reborn-ui-audit.md §1). A click picks an item up (a ghost follows the
// pointer; Escape or a right click puts it back); a click on a tile, item or slot then moves,
// swaps, equips or unequips it. A double click or right click opens a bag item's menu. Menus,
// tooltips and small windows render inside this window, so they stay in its modal top layer.
import type { GearView } from '@pockie/shared'
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useCharacter, useInventory, usePendingTreasure } from './api'
import { BuffsPanel } from './BuffsPanel'
import { BagGrid, iconFile, SideButtons, span, type Point } from './inventory/BagGrid'
import {
  ConfirmDialog,
  ManageOutfitDialog,
  MultiSellDialog,
  SortDialog,
  UseMultipleDialog,
} from './inventory/dialogs'
import { Equipment, OutfitTooltip, SetBar } from './inventory/EquipmentSlots'
import { attempt, useBagRequests } from './inventory/requests'
import { ItemMenu, menuAt, type MenuEntry } from './ItemMenu'
import { ItemTooltip } from './ItemTooltip'
import { GameButton, Notice } from './skin'
import { requestItemLink } from './social'
import { plainText } from './text'
import { showToast } from './toast'
import { TreasurePanel } from './TreasurePanel'
import type { BagHighlight, InventoryItem } from './types'
import { useGear } from './forge'
import { useOpenWindow } from './windows'

/** Two clicks on the same item this close together open its menu (Reborn's double click). */
const DOUBLE_CLICK_MS = 250
/** Reborn's default split size (settings.splitCount). */
const SPLIT_COUNT = 2
/** Reborn's tooltip offset per tile of the item: right and up from the pointer. */
const TIP_OFFSET = { x: 24, y: 30 }
const INVALID_SWAP = 'Invalid Swap'
const UNFIT_REASON = "Your outfit can't use this weapon."
const TREASURE_BOX = /^i15900[0-3]$/
const OUTFIT = 'outfit'

type Modal =
  | { kind: 'sort' }
  | { kind: 'outfit' }
  | { kind: 'useMultiple'; id: string }
  | { kind: 'confirm'; text: string; onAccept: () => void }
type ClickEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>

/** Whether a bag item is what the current tutorial step asks for. */
const isHighlighted = (item: InventoryItem, highlight: BagHighlight | undefined) =>
  !!highlight &&
  ('itemId' in highlight
    ? item.itemId === highlight.itemId
    : item.info?.kind === 'equip' && item.fitsOutfit !== false)

/** Click time, read in event handlers only. */
const clickTime = () => Date.now()

const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]

export function Inventory({ highlight }: { highlight?: BagHighlight }) {
  const inventory = useInventory()
  const character = useCharacter().data
  const gear: Record<string, GearView> = useGear().data ?? {}
  const request = useBagRequests()
  const pendingTreasure = usePendingTreasure()
  const openWindow = useOpenWindow()
  const [page, setPage] = useState<number | null>(null)
  const [heldId, setHeldId] = useState<string | null>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [tip, setTip] = useState<{ id: string; at: Point } | null>(null)
  const [modal, setModal] = useState<Modal | null>(null)
  const [multiSell, setMultiSell] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [treasureBox, setTreasureBox] = useState<InventoryItem | null>(null)
  const [treasureVisible, setTreasureVisible] = useState(false)
  const [buffsVisible, setBuffsVisible] = useState(false)
  const lastClick = useRef<{ id: string; time: number } | null>(null)
  /** A fixed probe: the origin of fixed tooltips (the window frame may be their containing block). */
  const origin = useRef<HTMLSpanElement>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const closeModal = useCallback(() => setModal(null), [])

  if (inventory.isPending) return <p>Opening your bag...</p>
  if (inventory.isError) return <Notice tone="error">We could not open your bag.</Notice>

  const items = inventory.data
  const bag = items.filter((item) => !item.equippedSlot && item.page != null && item.slot != null)
  const held = items.find((item) => item.id === heldId) ?? null
  const marked = bag.find((item) => isHighlighted(item, highlight))
  const shownPage = page ?? marked?.page ?? 0
  const level = character?.level ?? 1
  const run = (action: () => Promise<unknown>) => void attempt(action)

  function pickUp(item: InventoryItem) {
    setHeldId(item.id)
    setTip(null)
    setMenu(null)
  }

  function openMenu(id: string, event: ClickEvent) {
    setHeldId(null)
    setTip(null)
    setMenu({ id, ...menuAt(event) })
  }

  function clickBagItem(item: InventoryItem, event: MouseEvent<HTMLElement>) {
    if (multiSell) {
      if (!item.locked) setSelected(toggle(selected, item.id))
      return
    }
    const now = clickTime()
    const last = lastClick.current
    lastClick.current = { id: item.id, time: now }
    if (last?.id === item.id && now - last.time < DOUBLE_CLICK_MS) return openMenu(item.id, event)
    if (!held) return pickUp(item)
    if (held.id === item.id) return setHeldId(null)
    if (held.equippedSlot) {
      // A worn item over a bag item: wear that one instead, when it fits the slot.
      if (item.info?.equipSlot !== held.equippedSlot) return showToast(INVALID_SWAP, 'failure')
      setHeldId(null)
      return run(() => request.equip(item.id))
    }
    setHeldId(null)
    run(() => request.swap({ id: held.id, targetId: item.id }))
  }

  function clickTile(tab: number, slot: number) {
    if (!held) return
    setHeldId(null)
    const spot = { id: held.id, page: tab, slot }
    run(() => (held.equippedSlot ? request.unequip(spot) : request.move(spot)))
  }

  function clickSlot(slot: string, worn?: InventoryItem) {
    if (!held) return worn && pickUp(worn)
    if (held.id === worn?.id) return setHeldId(null)
    if (held.equippedSlot || held.info?.equipSlot !== slot)
      return showToast(INVALID_SWAP, 'failure')
    setHeldId(null)
    run(() => request.equip(held.id))
  }

  function showTip(id: string | null, at?: Point) {
    if (!id || !at || held) return setTip(null)
    const base = origin.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    setTip({ id, at: { x: at.x - base.left, y: at.y - base.top } })
  }

  function consume(item: InventoryItem) {
    if (!TREASURE_BOX.test(item.itemId)) return run(() => request.use(item.id))
    setTreasureBox(item)
    setTreasureVisible(true)
  }

  /** The context menu of a bag item, in Reborn's order; Appraise / Repair (our forge) last. */
  function entries(item: InventoryItem): MenuEntry[] {
    const name = plainText(item.nameKey, 'item')
    const info = item.info
    const list: MenuEntry[] = []
    const add = (label: string, onSelect: () => void, extra: Partial<MenuEntry> = {}) =>
      list.push({ label, name: `${label} ${name}`, disabled: request.busy, onSelect, ...extra })
    if (info?.kind === 'equip') {
      const fits = item.fitsOutfit !== false
      add('Equip', () => run(() => request.equip(item.id)), {
        disabled: request.busy || !fits,
        reason: fits ? undefined : UNFIT_REASON,
      })
    }
    if (info?.equipSlot === 'Wing') add('Enhance Wing', () => openWindow('wingEnhance'))
    if (info?.kind === 'use') add('Use', () => consume(item))
    if (info?.kind === 'use' && item.count > 1)
      add('Use Multiple', () => setModal({ kind: 'useMultiple', id: item.id }))
    if (item.count > 1) {
      const count = Math.min(SPLIT_COUNT, item.count - 1)
      add('Split', () => run(() => request.split({ id: item.id, count })))
    }
    const price = info?.sellPrice
    if (!item.locked && price != null) {
      const text = `Sell ${item.count} ${name} for ${price * item.count}?`
      add('Sell', () =>
        setModal({ kind: 'confirm', text, onAccept: () => run(() => request.sell([item.id])) }),
      )
    }
    add(item.locked ? 'Unlock' : 'Lock', () => run(() => request.lock(item.id)))
    add('Link in Chat', () => requestItemLink(name), { name: `Link ${name} in chat` })
    const forged = gear[item.id]
    const forge = (verb: 'Appraise' | 'Repair', cost: number) =>
      list.push({
        label: `${verb} (${cost} Stone)`,
        name: `${verb} ${name} for ${cost} Stone`,
        disabled: request.busy,
        onSelect: () =>
          run(() => (verb === 'Appraise' ? request.appraise : request.repair)({ itemId: item.id })),
      })
    if (forged && !forged.appraised) forge('Appraise', forged.appraiseCost)
    if (forged && forged.repairCost > 0) forge('Repair', forged.repairCost)
    return list
  }

  function closeMultiSell() {
    setMultiSell(false)
    setSelected([])
  }

  const menuItem = menu && menu.id !== OUTFIT && items.find((item) => item.id === menu.id)
  const tipItem = tip && items.find((item) => item.id === tip.id)
  const tipAt = (tiles: { w?: number; h?: number } = {}) =>
    tip && {
      x: tip.at.x + TIP_OFFSET.x * (tiles.w ?? 2),
      y: Math.max(0, tip.at.y - TIP_OFFSET.y * (tiles.h ?? 2)),
    }
  const wornFor = (item: InventoryItem) => {
    if (item.equippedSlot || item.info?.kind !== 'equip') return undefined
    const worn = items.find((other) => other.equippedSlot === item.info?.equipSlot)
    return worn && { item: worn, gear: gear[worn.id] }
  }
  const useMultipleItem =
    modal?.kind === 'useMultiple' && items.find((item) => item.id === modal.id)
  const ghost = held && iconFile(held.itemId)

  return (
    <div
      data-menu-root
      className="relative h-[513px] w-[369px] bg-[#25282b] font-game text-xs"
      onPointerMove={(event: PointerEvent<HTMLElement>) => {
        if (!held) return
        const box = event.currentTarget.getBoundingClientRect()
        setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !held) return
        // Puts the item back instead of closing the Inventory.
        event.preventDefault()
        event.stopPropagation()
        setHeldId(null)
      }}
      onContextMenuCapture={(event) => {
        if (!held) return
        event.preventDefault()
        event.stopPropagation()
        setHeldId(null)
      }}
    >
      <span ref={origin} aria-hidden="true" className="pointer-events-none fixed top-0 left-0" />
      <SetBar />
      <Equipment
        items={items}
        character={character}
        gear={gear}
        held={held}
        outfitMenuOpen={menu?.id === OUTFIT}
        onTitle={() => setBuffsVisible(true)}
        onSlot={clickSlot}
        onOutfitMenu={(event) => openMenu(OUTFIT, event)}
        onTip={showTip}
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
      <BagGrid
        items={bag}
        page={shownPage}
        onPage={setPage}
        heldId={heldId}
        holding={!!held}
        markedId={marked?.id}
        menuId={menu?.id}
        selected={selected}
        gear={gear}
        level={level}
        onTile={clickTile}
        onClick={clickBagItem}
        onMenu={(item, event) => (held ? setHeldId(null) : openMenu(item.id, event))}
        onLock={(item) => run(() => request.lock(item.id))}
        onTip={(item, at) => showTip(item?.id ?? null, at)}
      />
      <SideButtons
        onMultiSell={() => {
          setHeldId(null)
          setMultiSell(true)
        }}
        onSort={() => setModal({ kind: 'sort' })}
      />
      {ghost && pointer && (
        <img
          src={ghost}
          alt=""
          className="pointer-events-none absolute z-[65] object-contain opacity-80"
          style={{
            left: pointer.x - span(held.info?.w) / 2,
            top: pointer.y - span(held.info?.h) / 2,
            width: span(held.info?.w),
            height: span(held.info?.h),
          }}
        />
      )}
      {!held && tipItem && (
        <ItemTooltip
          entry={{ item: tipItem, gear: gear[tipItem.id] }}
          worn={wornFor(tipItem)}
          at={tipAt(tipItem.info)!}
          characterLevel={level}
        />
      )}
      {!held && tip?.id === OUTFIT && character && (
        <OutfitTooltip clothing={character.clothing} at={tipAt()!} />
      )}
      {menuItem && menu && (
        <ItemMenu
          title={plainText(menuItem.nameKey, 'Unknown item')}
          at={menu}
          entries={entries(menuItem)}
          onClose={closeMenu}
        />
      )}
      {menu?.id === OUTFIT && character && (
        <ItemMenu
          title={plainText(`lg_avatar${character.clothing}`, 'Outfit')}
          at={menu}
          entries={[{ label: 'Manage', onSelect: () => setModal({ kind: 'outfit' }) }]}
          onClose={closeMenu}
        />
      )}
      {multiSell && (
        <MultiSellDialog
          items={bag}
          gear={gear}
          selected={selected}
          onSelect={setSelected}
          onSell={() =>
            setModal({
              kind: 'confirm',
              text: 'Sell these items?',
              onAccept: () =>
                run(async () => {
                  await request.sell(selected)
                  setSelected([])
                }),
            })
          }
          onClose={closeMultiSell}
        />
      )}
      {modal?.kind === 'sort' && (
        <SortDialog
          page={shownPage}
          busy={request.busy}
          onSort={(input) =>
            run(async () => {
              await request.sort(input)
              setModal(null)
            })
          }
          onClose={closeModal}
        />
      )}
      {useMultipleItem && (
        <UseMultipleDialog
          item={useMultipleItem}
          onUse={(amount) => {
            setModal(null)
            run(() => request.useMany({ id: useMultipleItem.id, amount }))
          }}
          onClose={closeModal}
        />
      )}
      {modal?.kind === 'outfit' && character && (
        <ManageOutfitDialog clothing={character.clothing} onClose={closeModal} />
      )}
      {modal?.kind === 'confirm' && (
        <ConfirmDialog text={modal.text} onAccept={modal.onAccept} onClose={closeModal} />
      )}
    </div>
  )
}
