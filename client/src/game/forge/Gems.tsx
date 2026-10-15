// Reborn's Armory tabs for gems and enchantments (reborn-windows-A-L.md "Armory"): Enchantment (an
// Enchanting Stone's lines onto gear, compared ● ▲ ▼ with the lines it has), Create Hole (a Slot
// Talisman opens one gem socket) and Remove (every gem back to the bag). Our bag is a separate
// window, so pickers stand in for Reborn's drag onto the slots. The server checks every rule.
import type { GearView } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useInventory } from '../api'
import { GameButton, Notice } from '../skin'
import { plainText } from '../text'
import type { InventoryItem } from '../types'
import { useCreateHole, useEnchant, useRemoveGems } from './api'
import { statLine } from './gear'
import { EquipmentSlot, ItemPicker, useForgeItems, type Gear, type NoticeState } from './items'
import { SubWindow } from './parts'

/** Reborn's Slot Talismans (Create Hole's talisman slot accepts these ids). */
export const SLOT_TALISMANS = [
  'i161002',
  'i161040',
  'i161041',
  'i161042',
  'i161043',
  'i161044',
  'i161045',
  'i161046',
]

const INFO_BOX = 'game-card flex min-h-[90px] flex-1 flex-col gap-0.5 p-2'
const notWing = (gear: GearView) => gear.equipType !== 'Wing'
const socketed = (gear: GearView) => gear.sockets.some(Boolean)

/** Unequipped bag rows `offered` accepts. */
function useBagRows(offered: (item: InventoryItem) => boolean) {
  return (useInventory().data ?? []).filter((item) => !item.equippedSlot && offered(item))
}

/** The selection state a tab keeps: the chosen gear, a notice and a pending confirm. */
function useTabState(items: Gear[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [confirming, setConfirming] = useState(false)
  return {
    selected: items.find((item) => item.id === selectedId),
    selectedId,
    select: (id: string) => {
      setSelectedId(id)
      setNotice(null)
    },
    notice,
    setNotice,
    confirming,
    setConfirming,
  }
}

/** Runs a forge request and turns its outcome into the tab's notice. */
async function run(
  request: () => Promise<unknown>,
  setNotice: (notice: NoticeState) => void,
  done: string,
) {
  setNotice(null)
  try {
    await request()
    setNotice({ tone: 'info', text: done })
  } catch (error) {
    setNotice({ tone: 'error', text: errorMessage(error) })
  }
}

function Confirm({
  title,
  text,
  onAccept,
  onClose,
}: {
  title: string
  text: string
  onAccept: () => void
  onClose: () => void
}) {
  return (
    <SubWindow title={title} width={260} onClose={onClose}>
      <p className="text-center">{text}</p>
      <div className="flex justify-center gap-3">
        <GameButton
          onClick={() => {
            onClose()
            onAccept()
          }}
        >
          Accept
        </GameButton>
        <GameButton onClick={onClose}>Deny</GameButton>
      </div>
    </SubWindow>
  )
}

/** Reborn's Enchantment Info rows: current lines, marked against the placed stone's. */
function enchantRows(gear: GearView | undefined, stone: InventoryItem | undefined) {
  const mine = new Map((gear?.enchant?.lines ?? []).map((line) => [line.name, line.value]))
  const theirs = new Map((stone?.info?.enchant?.lines ?? []).map((line) => [line.name, line.value]))
  return [...new Set([...mine.keys(), ...theirs.keys()])].map((name) => {
    const now = mine.get(name)
    const next = theirs.get(name)
    const mark = !stone
      ? undefined
      : now === undefined
        ? { glyph: '●', color: '#3b82f6', label: 'new' }
        : next === undefined || next < now
          ? { glyph: '▼', color: '#ef4444', label: next === undefined ? 'lost' : 'lower' }
          : next > now
            ? { glyph: '▲', color: '#22c55e', label: 'higher' }
            : { glyph: '●', color: '#ffffff', label: 'same' }
    const line = statLine(name, (now ?? next)!)
    return { name, text: `${line.label}: ${line.value}`, mark }
  })
}

export function EnchantTab() {
  const { loading, failed, items } = useForgeItems(notWing)
  const tab = useTabState(items)
  const enchant = useEnchant()
  const [stoneId, setStoneId] = useState('')
  const gear = tab.selected?.gear
  const stones = useBagRows(
    (item) =>
      !!item.info?.enchant &&
      (!gear ||
        (item.info.enchant.slots.includes(gear.equipType) &&
          gear.level >= item.info.enchant.level)),
  )
  const stone = stones.find((item) => item.id === stoneId)

  if (loading) return <p className="mt-2">Opening the forge...</p>
  if (failed) return <Notice tone="error">We could not open the forge.</Notice>

  const rows = enchantRows(gear, stone)
  return (
    <div className="mt-2 grid grid-cols-[168px_1fr] gap-3 text-xs">
      <ItemPicker
        items={items}
        empty="You have no equipment in your bag."
        selectedId={tab.selectedId}
        onSelect={(id) => {
          tab.select(id)
          setStoneId('')
        }}
      />
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <EquipmentSlot item={tab.selected} />
          <div className={INFO_BOX}>
            <p className="font-bold">Enchantment Info</p>
            {!tab.selected ? (
              <p>No item selected</p>
            ) : rows.length === 0 ? (
              <p>No enchantments</p>
            ) : (
              <ul aria-label="Enchantment Info">
                {rows.map((row) => (
                  <li key={row.name} className="flex justify-between text-[11px] font-bold">
                    <span>{row.text}</span>
                    {row.mark && (
                      <span style={{ color: row.mark.color }} aria-label={row.mark.label}>
                        {row.mark.glyph}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2">
          Enchanting Stone
          <select
            value={stoneId}
            onChange={(event) => setStoneId(event.target.value)}
            className="game-card max-w-[220px] px-1"
          >
            <option value="">{stones.length ? 'Choose a stone' : 'No stone fits'}</option>
            {stones.map((item) => (
              <option key={item.id} value={item.id}>
                {plainText(item.nameKey, item.itemId)}
              </option>
            ))}
          </select>
        </label>
        <GameButton
          disabled={!tab.selected || !stone || enchant.isPending}
          onClick={() => tab.setConfirming(true)}
          className="self-start"
        >
          Attempt
        </GameButton>
        {tab.notice && <Notice tone={tab.notice.tone}>{tab.notice.text}</Notice>}
      </div>
      {tab.confirming && tab.selected && stone && (
        <Confirm
          title="Enchantment"
          text={`Enchant ${plainText(tab.selected.nameKey, 'this item')} with ${plainText(stone.nameKey, 'this stone')}? Its current enchantment is replaced.`}
          onClose={() => tab.setConfirming(false)}
          onAccept={() => {
            const itemId = tab.selected!.id
            setStoneId('')
            void run(
              () => enchant.mutateAsync({ itemId, stoneId: stone.id }),
              tab.setNotice,
              'Enchantment applied.',
            )
          }}
        />
      )}
    </div>
  )
}

export function CreateHoleTab() {
  const { loading, failed, items } = useForgeItems((gear) => gear.maxSockets > 0)
  const tab = useTabState(items)
  const createHole = useCreateHole()
  const [talisman, setTalisman] = useState('')
  const talismans = useBagRows((item) => SLOT_TALISMANS.includes(item.itemId))
  // One entry per talisman kind, whatever stacks it is split into.
  const kinds = [...new Map(talismans.map((item) => [item.itemId, item])).values()]

  if (loading) return <p className="mt-2">Opening the forge...</p>
  if (failed) return <Notice tone="error">We could not open the forge.</Notice>

  const gear = tab.selected?.gear
  const chosen = kinds.find((item) => item.itemId === talisman)
  return (
    <div className="mt-2 grid grid-cols-[168px_1fr] gap-3 text-xs">
      <ItemPicker
        items={items}
        empty="You have no equipment with gem slots in your bag."
        selectedId={tab.selectedId}
        onSelect={tab.select}
      />
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <EquipmentSlot item={tab.selected} />
          <div className={INFO_BOX}>
            <p className="font-bold">Gem Slots</p>
            {gear ? (
              <p>
                {gear.sockets.length} / {gear.maxSockets}
              </p>
            ) : (
              <p>No item selected</p>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2">
          Talisman
          <select
            value={talisman}
            onChange={(event) => setTalisman(event.target.value)}
            className="game-card max-w-[220px] px-1"
          >
            <option value="">{kinds.length ? 'Choose a talisman' : 'No Slot Talisman'}</option>
            {kinds.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {plainText(item.nameKey, item.itemId)}
              </option>
            ))}
          </select>
        </label>
        <p>You need a Slot Talisman to create a gem slot</p>
        <GameButton
          disabled={!tab.selected || !chosen || createHole.isPending}
          onClick={() => tab.setConfirming(true)}
          className="self-start"
        >
          Attempt
        </GameButton>
        {tab.notice && <Notice tone={tab.notice.tone}>{tab.notice.text}</Notice>}
      </div>
      {tab.confirming && tab.selected && chosen && (
        <Confirm
          title="Create Hole"
          text={`Create Gem Slot for ${plainText(tab.selected.nameKey, 'this item')}?`}
          onClose={() => tab.setConfirming(false)}
          onAccept={() => {
            const itemId = tab.selected!.id
            void run(
              () => createHole.mutateAsync({ itemId, talisman: chosen.itemId }),
              tab.setNotice,
              'Gem slot created.',
            )
          }}
        />
      )}
    </div>
  )
}

export function RemoveGemsTab() {
  const { loading, failed, items } = useForgeItems(socketed)
  const tab = useTabState(items)
  const remove = useRemoveGems()

  if (loading) return <p className="mt-2">Opening the forge...</p>
  if (failed) return <Notice tone="error">We could not open the forge.</Notice>

  return (
    <div className="mt-2 grid grid-cols-[168px_1fr] gap-3 text-xs">
      <ItemPicker
        items={items}
        empty="You have no equipment with gems in your bag."
        selectedId={tab.selectedId}
        onSelect={tab.select}
      />
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <EquipmentSlot item={tab.selected} />
          <div className={INFO_BOX}>
            <p className="font-bold">Socketed Gems</p>
            {!tab.selected ? (
              <p>No item selected</p>
            ) : (
              tab.selected.gear.sockets.map((gem, index) => (
                <p key={`${gem?.itemId ?? 'open'}-${index}`}>
                  {gem ? plainText(gem.nameKey, gem.itemId) : 'Open Socket'}
                </p>
              ))
            )}
          </div>
        </div>
        <GameButton
          disabled={!tab.selected || remove.isPending}
          onClick={() =>
            void run(
              () => remove.mutateAsync({ itemId: tab.selected!.id }),
              tab.setNotice,
              'The gems are back in your bag.',
            )
          }
          className="self-start"
        >
          Remove Gems
        </GameButton>
        {tab.notice && <Notice tone={tab.notice.tone}>{tab.notice.text}</Notice>}
      </div>
    </div>
  )
}
