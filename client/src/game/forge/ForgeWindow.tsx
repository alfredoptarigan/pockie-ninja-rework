// The blacksmith windows: the Forge (UI_EquipMakeRoom_Xml tabs Enhance and Refine) and the
// Inscription window (UI_YYEquipCompose_Xml). The server checks every rule again; this only
// decides what to offer. Opened with useOpenForge (NPC menu, HUD).
import type { ForgeInfo, ForgePayment, GearView } from '@pockie/shared'
import { INSCRIBE_MAX_SEALS } from '@pockie/shared'
import { useId, useState } from 'react'
import { errorMessage, useCharacter, useInventory } from '../api'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { plainText } from '../text'
import type { InventoryItem } from '../types'
import { useEnhance, useForgeInfo, useGear, useInscribe, useRefine, type ForgeResult } from './api'
import { GearDetails, GearIcon } from './GearItem'

export type ForgeView = 'enhance' | 'refine' | 'inscription'

/** Which forge window is open; `open('enhance')` from an NPC menu or a HUD button. */
export function useOpenForge() {
  const [view, setView] = useState<ForgeView | null>(null)
  return { view, open: setView, close: () => setView(null) }
}

type Gear = InventoryItem & { gear: GearView }
type NoticeState = { tone: 'info' | 'error'; text: string } | null

const WEAPON = 1
const ARMOUR = 2

const OFFERED: Record<ForgeView, (gear: GearView) => boolean> = {
  enhance: (g) => (g.baseType === WEAPON || g.baseType === ARMOUR) && g.enhanceMax > 0,
  refine: (g) => g.identifyCount > 0,
  inscription: () => true,
}

/** Bag equipment (the forge box takes items from the bag) the view can work on. */
function useForgeItems(view: ForgeView) {
  const inventory = useInventory()
  const gear = useGear()
  const items = (inventory.data ?? []).flatMap((item): Gear[] => {
    const state = gear.data?.[item.id]
    return state && !item.equippedSlot ? [{ ...item, gear: state }] : []
  })
  return {
    loading: inventory.isPending || gear.isPending,
    failed: inventory.isError || gear.isError,
    items: items.filter((item) => OFFERED[view](item.gear)),
  }
}

export function ForgeWindow({ view, onClose }: { view: ForgeView; onClose: () => void }) {
  const [tab, setTab] = useState<ForgeView>(view)
  const panelId = useId()
  if (view === 'inscription') {
    return (
      <Dialog title="Inscription" onClose={onClose} className="w-[34rem]">
        <ForgePanel view="inscription" />
      </Dialog>
    )
  }
  return (
    <Dialog title="Forge" onClose={onClose} className="w-[34rem]">
      <Tabs
        label="Forge"
        panelId={panelId}
        tabs={[
          { id: 'enhance', title: 'Enhance' },
          { id: 'refine', title: 'Refine' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div id={panelId} role="tabpanel" aria-label={tab === 'enhance' ? 'Enhance' : 'Refine'}>
        <ForgePanel key={tab} view={tab} />
      </div>
    </Dialog>
  )
}

/** Item list on the left, the chosen item and its action on the right. */
function ForgePanel({ view }: { view: ForgeView }) {
  const { loading, failed, items } = useForgeItems(view)
  const info = useForgeInfo()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState>(null)
  const selected = items.find((item) => item.id === selectedId)

  if (loading || info.isPending) return <p className="mt-2">Opening the forge...</p>
  if (failed || info.isError) return <Notice tone="error">We could not open the forge.</Notice>

  return (
    <div className="mt-2 grid grid-cols-[168px_1fr] gap-3">
      <div>
        <p className="mb-1 text-xs font-bold">Your equipment</p>
        {items.length === 0 ? (
          <p className="text-xs">{EMPTY[view]}</p>
        ) : (
          <ul aria-label="Equipment to forge" className="grid grid-cols-3 gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <GearIcon itemId={item.itemId} nameKey={item.nameKey} gear={item.gear}>
                  <button
                    type="button"
                    aria-label={plainText(item.nameKey, 'Unknown item')}
                    aria-pressed={item.id === selectedId}
                    onClick={() => {
                      setSelectedId(item.id)
                      setNotice(null)
                    }}
                    className={`absolute inset-0 cursor-pointer ${
                      item.id === selectedId ? 'shadow-[inset_0_0_0_2px_#fff2ae]' : ''
                    }`}
                  />
                </GearIcon>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {selected ? (
          <>
            <div className="rounded-[3px] border-2 border-[#5c5c5c] bg-black/85 px-2 py-1 text-white">
              <GearDetails nameKey={selected.nameKey} gear={selected.gear} />
            </div>
            {view === 'inscription' ? (
              <InscribeAction item={selected} info={info.data} onDone={setNotice} />
            ) : (
              <PaidAction view={view} item={selected} info={info.data} onDone={setNotice} />
            )}
          </>
        ) : (
          <p className="text-xs">Choose an item.</p>
        )}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </div>
    </div>
  )
}

const EMPTY: Record<ForgeView, string> = {
  enhance: 'You have no weapon or armour to enhance in your bag.',
  refine: 'You have no equipment with properties in your bag.',
  inscription: 'You have no equipment in your bag.',
}

const PAYMENT_NAMES: Record<ForgePayment, string> = {
  gold: 'Gold',
  giftCoupon: 'Gift Coupons',
  talisman: 'Talisman',
}

/** Enhance or Refine: pay with Gold, Gift Coupons (binds the item) or a talisman. */
function PaidAction({
  view,
  item,
  info,
  onDone,
}: {
  view: 'enhance' | 'refine'
  item: Gear
  info: ForgeInfo
  onDone: (notice: NoticeState) => void
}) {
  const character = useCharacter().data
  const enhance = useEnhance()
  const refine = useRefine()
  const action = view === 'enhance' ? enhance : refine
  const [payment, setPayment] = useState<ForgePayment>('gold')
  const groupId = useId()
  const cost = view === 'enhance' ? info.enhanceCost : info.refineCost
  const talismans = view === 'enhance' ? info.talismans.enhance : info.talismans.refine
  const atMax = view === 'enhance' && item.gear.enhanceLevel >= item.gear.enhanceMax
  const rate = info.enhanceRates[item.gear.enhanceLevel + 1]
  const affordable = payment === 'talisman' ? talismans > 0 : (character?.[payment] ?? 0) >= cost
  const blocked = !item.gear.appraised
    ? 'Appraise this item first.'
    : atMax
      ? 'This item is fully enhanced.'
      : !affordable
        ? payment === 'talisman'
          ? 'You have no talisman for this.'
          : `You need ${cost} ${PAYMENT_NAMES[payment]}.`
        : null

  const run = async () => {
    onDone(null)
    try {
      const result: ForgeResult = await action.mutateAsync({ itemId: item.id, payment })
      const name = plainText(item.nameKey, 'the item')
      if (view === 'refine') onDone({ tone: 'info', text: `Refined ${name}.` })
      else if (result.success) {
        onDone({ tone: 'info', text: `${name} is now +${result.item?.gear?.enhanceLevel}.` })
      } else onDone({ tone: 'error', text: 'Enhancement failed. The level stays the same.' })
    } catch (error) {
      onDone({ tone: 'error', text: errorMessage(error) })
    }
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {view === 'enhance' && !atMax && rate !== undefined && (
        <p>
          Next: +{item.gear.enhanceLevel + 1}, success rate {rate}%
        </p>
      )}
      <fieldset aria-labelledby={groupId} className="flex flex-col gap-0.5">
        <legend id={groupId} className="font-bold">
          Pay with
        </legend>
        {(['gold', 'giftCoupon', 'talisman'] as const).map((option) => (
          <label key={option} className="flex items-center gap-1">
            <input
              type="radio"
              name={`${groupId}-payment`}
              checked={payment === option}
              onChange={() => setPayment(option)}
            />
            {option === 'talisman'
              ? `Talisman (${talismans} in bag)`
              : `${cost} ${PAYMENT_NAMES[option]}${option === 'giftCoupon' ? ' (binds the item)' : ''}`}
          </label>
        ))}
      </fieldset>
      <GameButton
        disabled={Boolean(blocked) || action.isPending}
        onClick={run}
        className="self-start"
      >
        {view === 'enhance' ? 'Enhance' : 'Refine'}
      </GameButton>
      {blocked && <p className="text-[#8a1610]">{blocked}</p>}
    </div>
  )
}

/** Inscription: Low or High Seals raise the odds; a failure drops to the row's fail level. */
function InscribeAction({
  item,
  info,
  onDone,
}: {
  item: Gear
  info: ForgeInfo
  onDone: (notice: NoticeState) => void
}) {
  const character = useCharacter().data
  const inscribe = useInscribe()
  const [seal, setSeal] = useState<'low' | 'high'>('low')
  const [seals, setSeals] = useState(0)
  const groupId = useId()
  const row = info.inscribeLevels[item.gear.inscribeLevel]
  const owned = seal === 'low' ? info.talismans.lowSeal : info.talismans.highSeal
  const odds = seal === 'low' ? info.sealOdds.low : info.sealOdds.high
  const used = row ? Math.min(seals, owned, Math.ceil((100 - row.BaseOdds) / odds)) : 0
  const chance = row ? Math.min(100, row.BaseOdds + odds * used) : 0
  const blocked = !row
    ? 'This item is fully inscribed.'
    : owned === 0
      ? `You need a ${seal === 'low' ? 'Low' : 'High'} Seal.`
      : (character?.stone ?? 0) < row.StoneCost
        ? `You need ${row.StoneCost} Stone.`
        : null

  const run = async () => {
    onDone(null)
    try {
      const result = await inscribe.mutateAsync({ itemId: item.id, seal, seals })
      const level = result.item?.gear?.inscribeLevel ?? 0
      onDone(
        result.success
          ? { tone: 'info', text: `Inscription reached +${level}.` }
          : { tone: 'error', text: `Inscription failed. It is now +${level}.` },
      )
    } catch (error) {
      onDone({ tone: 'error', text: errorMessage(error) })
    }
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {row && (
        <p>
          Next: +{row.AddLevel} for {row.StoneCost} Stone, success {chance}%. On failure: +
          {row.FailLevel}.
        </p>
      )}
      <fieldset aria-labelledby={groupId} className="flex flex-col gap-0.5">
        <legend id={groupId} className="font-bold">
          Seals
        </legend>
        {(['low', 'high'] as const).map((option) => (
          <label key={option} className="flex items-center gap-1">
            <input
              type="radio"
              name={`${groupId}-seal`}
              checked={seal === option}
              onChange={() => setSeal(option)}
            />
            {option === 'low' ? 'Low Seal' : 'High Seal'} (+
            {option === 'low' ? info.sealOdds.low : info.sealOdds.high}% each,{' '}
            {option === 'low' ? info.talismans.lowSeal : info.talismans.highSeal} in bag)
          </label>
        ))}
        <label className="flex items-center gap-1">
          Use
          <select
            value={seals}
            onChange={(event) => setSeals(Number(event.target.value))}
            className="game-field px-1"
          >
            {Array.from({ length: INSCRIBE_MAX_SEALS + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          seals
        </label>
      </fieldset>
      <GameButton
        disabled={Boolean(blocked) || inscribe.isPending}
        onClick={run}
        className="self-start"
      >
        Inscribe
      </GameButton>
      {blocked && <p className="text-[#8a1610]">{blocked}</p>}
    </div>
  )
}
