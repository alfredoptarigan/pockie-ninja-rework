// Reborn's Armory Enhance tab with its Enhancement (payment), Enhancement Result and Auto Enhance
// windows (reborn-windows-A-L.md). Our server rolls the attempt; the client shows the next level's
// success rate instead of Reborn's projected stats, which our rules do not share.
import type { ForgeInfo, ForgePayment, GearView } from '@pockie/shared'
import { useEffect, useRef, useState } from 'react'
import { errorMessage, useCharacter } from '../api'
import { GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { useEnhance, useForgeInfo } from './api'
import {
  canEnhance,
  EquipmentSlot,
  ItemPicker,
  tierColor,
  useForgeItems,
  WEAPON,
  type Gear,
  type NoticeState,
} from './items'
import { PaymentDialog, PayRadios, payOptions, SubWindow, type PayOption } from './parts'

/** Reborn's auto mode attempts every 500 ms. */
export const AUTO_DELAY_MS = 500
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Enhancement Info lines: attack for weapons, defence and HP for armour. */
const enhanceStats = (gear: GearView) =>
  gear.baseType === WEAPON
    ? [`Min Atk: ${gear.attack.min}`, `Max Atk: ${gear.attack.max}`]
    : [...(gear.defense > 0 ? [`Defense: ${gear.defense}`] : []), `HP: +${gear.maxHp}`]

const INFO_BOX = 'game-card flex flex-col gap-0.5 p-2'

export function EnhanceTab() {
  const { loading, failed, items } = useForgeItems(canEnhance)
  const info = useForgeInfo()
  const character = useCharacter().data
  const enhance = useEnhance()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [payment, setPayment] = useState<ForgePayment>('gold')
  const [notice, setNotice] = useState<NoticeState>(null)
  const [outcome, setOutcome] = useState<boolean | null>(null)
  // The level the last attempt reached, until the bag query catches up.
  const [reached, setReached] = useState<number | null>(null)
  const selected = items.find((item) => item.id === selectedId)

  if (loading || info.isPending) return <p className="mt-2">Opening the forge...</p>
  if (failed || info.isError) return <Notice tone="error">We could not open the forge.</Notice>

  const level = selected ? (reached ?? selected.gear.enhanceLevel) : 0
  const rate = info.data.enhanceRates[level + 1]
  const blocked = !selected
    ? 'Choose an item.'
    : !selected.gear.appraised
      ? 'Appraise this item first.'
      : level >= selected.gear.enhanceMax
        ? 'This item is fully enhanced.'
        : null

  /** One attempt; returns the level reached, or null when the server refused it. */
  const attempt = async (item: Gear, pay: ForgePayment) => {
    setNotice(null)
    try {
      const result = await enhance.mutateAsync({ itemId: item.id, payment: pay })
      const now = result.item?.gear?.enhanceLevel ?? level
      setReached(now)
      setOutcome(Boolean(result.success))
      setNotice(
        result.success
          ? { tone: 'info', text: `${plainText(item.nameKey, 'The item')} is now +${now}.` }
          : { tone: 'error', text: 'Enhancement failed. The level stays the same.' },
      )
      return now
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
      return null
    }
  }

  const options = (labels: Record<ForgePayment, string>) =>
    payOptions(character, info.data.enhanceCost, info.data.talismans.enhance, labels)

  return (
    <div className="mt-2 grid grid-cols-[168px_1fr] gap-3 text-xs">
      <ItemPicker
        items={items}
        empty="You have no weapon or armour to enhance in your bag."
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id)
          setReached(null)
          setOutcome(null)
          setNotice(null)
        }}
      />
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1">
            <EquipmentSlot item={selected} />
            {selected && rate !== undefined && <p className="game-card px-2">Rate {rate}%</p>}
          </div>
          <div className={`${INFO_BOX} min-h-[90px] flex-1`}>
            <p className="font-bold">Enhancement Info</p>
            {selected ? (
              <>
                <p>+{level}</p>
                {enhanceStats(selected.gear).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </>
            ) : (
              <p>No item selected</p>
            )}
          </div>
        </div>
        <p>
          Result:{' '}
          {outcome !== null && (
            <span className={outcome ? 'text-[#1a7f1a]' : 'text-[#8a1610]'}>
              {outcome ? 'Success' : 'Failed'}
            </span>
          )}
        </p>
        <GameButton
          disabled={Boolean(blocked) || enhance.isPending}
          onClick={() => setPaying(true)}
          className="self-start"
        >
          Attempt
        </GameButton>
        {blocked && selected && <p className="text-[#8a1610]">{blocked}</p>}
      </div>
      {paying && selected && (
        <PaymentDialog
          title="Enhancement"
          text={`Enhancement cost: ${info.data.enhanceCost} Gold / ${info.data.enhanceCost} Coupons`}
          options={options({
            gold: `Your Gold: ${character?.gold ?? 0}`,
            giftCoupon: `Your Coupons: ${character?.giftCoupon ?? 0}`,
            talisman: 'Use Strengthening Talisman',
          })}
          busy={enhance.isPending}
          onClose={() => setPaying(false)}
          onPay={(pay) => {
            setPaying(false)
            setPayment(pay)
            setResultOpen(true)
            void attempt(selected, pay)
          }}
        />
      )}
      {resultOpen && selected && (
        <EnhancementResult
          item={selected}
          level={level}
          info={info.data}
          options={options({
            gold: 'Spend Gold',
            giftCoupon: 'Spend Coupons',
            talisman: 'Use Talisman',
          })}
          initialPayment={payment}
          busy={enhance.isPending}
          notice={notice}
          onAttempt={(pay) => attempt(selected, pay)}
          onClose={() => setResultOpen(false)}
        />
      )}
    </div>
  )
}

function EnhancementResult({
  item,
  level,
  info,
  options,
  initialPayment,
  busy,
  notice,
  onAttempt,
  onClose,
}: {
  item: Gear
  level: number
  info: ForgeInfo
  options: PayOption[]
  initialPayment: ForgePayment
  busy: boolean
  notice: NoticeState
  onAttempt: (payment: ForgePayment) => Promise<number | null>
  onClose: () => void
}) {
  const [payment, setPayment] = useState(initialPayment)
  const [auto, setAuto] = useState(false)
  const [asking, setAsking] = useState(false)
  const stop = useRef(false)
  // Closing the window stops auto mode.
  useEffect(
    () => () => {
      stop.current = true
    },
    [],
  )
  const max = item.gear.enhanceMax
  const atMax = level >= max
  const affordable = options.find((option) => option.id === payment)?.affordable ?? false
  const rate = info.enhanceRates[level + 1]

  const runAuto = async (target: number) => {
    stop.current = false
    setAuto(true)
    let now: number | null = level
    while (!stop.current && now !== null && now < target) {
      now = await onAttempt(payment)
      if (now !== null && now < target && !stop.current) await sleep(AUTO_DELAY_MS)
    }
    setAuto(false)
  }

  return (
    <SubWindow title="Enhancement Result" width={320} onClose={onClose}>
      <p className="text-center font-bold" style={{ color: tierColor(item.gear) }}>
        {plainText(item.nameKey, 'Unknown item')}
      </p>
      <div className="flex items-stretch gap-2">
        <div className={`${INFO_BOX} flex-1`}>
          <p className="font-bold">Current</p>
          <p>+{level}</p>
          {enhanceStats(item.gear).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <span aria-hidden="true" className="self-center text-base">
          &rarr;
        </span>
        <div className={`${INFO_BOX} flex-1 text-[#1a7f1a]`}>
          <p className="font-bold text-black">If successful:</p>
          {atMax ? <p>Max Level</p> : <p>+{level + 1}</p>}
          {!atMax && rate !== undefined && <p>Success rate {rate}%</p>}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <p>Price: {info.enhanceCost}</p>
        <PayRadios options={options} value={payment} onChange={setPayment} />
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="flex justify-center gap-2">
        <GameButton
          disabled={busy || auto || atMax || !affordable}
          onClick={() => void onAttempt(payment)}
        >
          {atMax ? 'Max Level' : 'Enhance'}
        </GameButton>
        <GameButton
          disabled={!auto && (busy || atMax || !affordable)}
          onClick={() => {
            if (auto) stop.current = true
            else setAsking(true)
          }}
        >
          {auto ? 'Stop' : 'Auto'}
        </GameButton>
      </div>
      {asking && (
        <AutoEnhance
          from={level + 1}
          max={max}
          onClose={() => setAsking(false)}
          onStart={(target) => {
            setAsking(false)
            void runAuto(target)
          }}
        />
      )}
    </SubWindow>
  )
}

/** "Enhance to Level": the target is clamped to the next level .. the item's maximum. */
function AutoEnhance({
  from,
  max,
  onStart,
  onClose,
}: {
  from: number
  max: number
  onStart: (target: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(String(from))
  const target = Math.min(max, Math.max(from, Math.floor(Number(value)) || from))
  return (
    <SubWindow title="Auto Enhance" width={200} top={90} onClose={onClose}>
      <label className="flex items-center justify-between gap-2 font-bold">
        Enhance to Level
        <input
          type="number"
          min={from}
          max={max}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="game-field w-[50px] px-1"
        />
      </label>
      <div className="flex justify-center gap-2">
        <GameButton small onClick={() => onStart(target)}>
          Start
        </GameButton>
        <GameButton small onClick={onClose}>
          Cancel
        </GameButton>
      </div>
    </SubWindow>
  )
}
