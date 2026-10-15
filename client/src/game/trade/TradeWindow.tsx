// Reborn's "Trade with" window (`$s`, reborn-windows-M-Z-hud.md): 400 wide on BigBG1, "Your Offer"
// and "Partner Offer" 6 x 6 grids (each with its Ready Check tag), the currency block (Gold, Stones,
// GC: my input with what I own, the partner's amount), the hint, the tax lines and the main button
// Ready for Trade -> Waiting -> Confirm Trade -> Waiting for partner... -> Trading. Closing the
// window cancels the trade. Reborn drags items in from the Inventory; ours opens a bag picker from
// an empty cell of my grid (the Inventory is behind the modal window).
import type { Character, GearView } from '@pockie/shared'
import { useState, type KeyboardEvent } from 'react'
import type { TradeItem, TradeView } from '../../../../shared/src/schemas/trade'
import { errorMessage, useInventory } from '../api'
import { useGear } from '../forge'
import { ItemPicture } from '../inventory/BagGrid'
import { itemName } from '../inventory/outfits'
import { ItemTooltip } from '../ItemTooltip'
import { asInventoryItem } from '../market/parts'
import { Dialog, GameButton } from '../skin'
import { showToast } from '../toast'
import type { InventoryItem } from '../types'
import { canTradeAt, TRADE_CONFIG, tradeFee, useTradeAction, type TradeCurrency } from './api'

const TILE = 27
const COLUMNS = 6
const LEVEL_MESSAGE = `Both players must be at least level ${TRADE_CONFIG.minLevel} to trade.`
const CURRENCIES: { key: TradeCurrency; label: string; title?: string; icon?: string }[] = [
  { key: 'gold', label: 'Gold', icon: 'var(--ui-icon-gold)' },
  { key: 'stone', label: 'Stones', icon: 'var(--ui-icon-stone)' },
  { key: 'giftCoupon', label: 'GC', title: 'Gift Certificates' },
]
const number = (value: number) => value.toLocaleString('en-US')

type Tip = { item: InventoryItem; gear?: GearView; at: { x: number; y: number } } | null

/** A 6 x 6 offer grid: the items in offer order, one tile each. */
function OfferGrid({
  label,
  items,
  onItem,
  onEmpty,
  onTip,
}: {
  label: string
  items: TradeItem[]
  onItem?: (item: TradeItem) => void
  onEmpty?: () => void
  onTip: (tip: Tip) => void
}) {
  return (
    <ul
      aria-label={label}
      className="relative size-[162px]"
      style={{ background: `var(--ui-slot) 0 0 / ${TILE}px ${TILE}px` }}
    >
      {Array.from({ length: TRADE_CONFIG.maxItems }, (_, cell) => {
        const offered = items[cell]
        const at = { left: (cell % COLUMNS) * TILE, top: Math.floor(cell / COLUMNS) * TILE }
        if (!offered)
          return onEmpty ? (
            <li key={cell} className="absolute size-[27px]" style={at}>
              <button
                type="button"
                aria-label={`Offer an item (slot ${cell + 1})`}
                onClick={onEmpty}
                className="size-full cursor-pointer"
              />
            </li>
          ) : null
        const item = asInventoryItem(offered)
        const name = `${itemName(item)}${offered.count > 1 ? ` x${offered.count}` : ''}`
        const picture = (
          <>
            <ItemPicture item={item} gear={offered.gear} decorative />
            {offered.count > 1 && (
              <span className="absolute right-0 bottom-0 text-[9px] leading-none text-white [text-shadow:0_0_2px_#000]">
                {offered.count}
              </span>
            )}
          </>
        )
        const tip = {
          onPointerMove: (event: { clientX: number; clientY: number }) =>
            onTip({
              item,
              gear: offered.gear,
              at: { x: event.clientX + 12, y: event.clientY + 12 },
            }),
          onPointerLeave: () => onTip(null),
        }
        return (
          <li key={offered.inventoryId} className="absolute size-[27px] p-[1px]" style={at}>
            {onItem ? (
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  onTip(null)
                  onItem(offered)
                }}
                className="relative size-full cursor-pointer"
                {...tip}
              >
                {picture}
              </button>
            ) : (
              <span role="img" aria-label={name} className="relative block size-full" {...tip}>
                {picture}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** My bag items to pick from (Reborn: bag tabs only; bound items greyed and refused). */
function BagPicker({
  offered,
  onPick,
  onClose,
}: {
  offered: string[]
  onPick: (item: InventoryItem) => void
  onClose: () => void
}) {
  const inventory = useInventory()
  const gear: Record<string, GearView> = useGear().data ?? {}
  const items = (inventory.data ?? []).filter(
    (item) => !item.equippedSlot && !offered.includes(item.id),
  )
  return (
    <section
      aria-label="Choose an item to offer"
      className="game-panel-1 absolute top-[10px] left-[10px] z-10 flex h-[300px] w-[380px] flex-col gap-1 p-2"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold">Choose an item to offer</h3>
        <GameButton small onClick={onClose}>
          Done
        </GameButton>
      </div>
      {items.length === 0 && <p className="text-[11px]">Your bag is empty.</p>}
      <ul className="flex flex-wrap content-start gap-[2px] overflow-auto">
        {items.map((item) => {
          const reason = item.bound
            ? 'Bound items cannot be traded'
            : item.locked
              ? 'Locked — cannot be sold or traded'
              : undefined
          const name = `${itemName(item)}${item.count > 1 ? ` x${item.count}` : ''}`
          return (
            <li key={item.id} className="size-[27px]">
              <button
                type="button"
                aria-label={`Offer ${name}`}
                title={reason ? `${name}: ${reason}` : name}
                disabled={Boolean(reason)}
                onClick={() => onPick(item)}
                className="relative size-full cursor-pointer disabled:cursor-not-allowed disabled:grayscale"
                style={{ background: `var(--ui-slot) 0 0 / ${TILE}px ${TILE}px` }}
              >
                <ItemPicture item={item} gear={gear[item.id]} decorative />
                {item.count > 1 && (
                  <span className="absolute right-0 bottom-0 text-[9px] leading-none text-white [text-shadow:0_0_2px_#000]">
                    {item.count}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** One currency row: my amount (saved on blur or Enter, clamped to what I own) and the partner's. */
function CurrencyRow({
  currency,
  mine,
  owned,
  partner,
  disabled,
  onSet,
}: {
  currency: (typeof CURRENCIES)[number]
  mine: number
  owned: number
  partner: number
  disabled: boolean
  onSet: (amount: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const amount = Math.min(owned, Number(draft.replace(/[^0-9]/g, '')) || 0)
    if (amount !== mine) onSet(amount)
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit()
  }
  return (
    <div className="flex h-[22px] items-center">
      <span
        className="flex w-[70px] items-center gap-1 text-[10px] font-semibold"
        title={currency.title}
      >
        {currency.icon && (
          <span
            aria-hidden
            className="inline-block size-[16px] bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: currency.icon }}
          />
        )}
        {currency.label}
      </span>
      <span className="flex flex-1 items-center justify-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Your ${currency.title ?? currency.label}`}
          placeholder="0"
          disabled={disabled}
          value={draft ?? (mine ? number(mine) : '')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className="game-value-box h-[20px] w-[75px] px-[6px] text-right text-[11px] disabled:opacity-70"
        />
        <span className="min-w-[45px] text-[8px] text-[#666]">({number(owned)})</span>
      </span>
      <span
        aria-label={`Partner ${currency.title ?? currency.label}`}
        className="game-value-box mr-[5px] inline-flex h-[20px] w-[75px] items-center justify-end px-[6px] text-[11px]"
      >
        {number(partner)}
      </span>
    </div>
  )
}

/** Reborn's tax lines: the fee on what I send, then what each side receives (GC and Stones). */
function taxLines({ me, partner }: TradeView) {
  const rate = Math.round(TRADE_CONFIG.taxRate.stone * 100)
  const gc = (sent: TradeView['me']['currency']) => tradeFee('giftCoupon', sent.giftCoupon)
  const stones = (sent: TradeView['me']['currency']) => tradeFee('stone', sent.stone)
  const amounts = (sent: TradeView['me']['currency']) =>
    [
      gc(sent).net > 0 ? `${number(gc(sent).net)} GC` : '',
      stones(sent).net > 0 ? `${number(stones(sent).net)} Stones` : '',
    ]
      .filter(Boolean)
      .join(', ')
  const fees = [
    gc(me.currency).fee > 0 ? `${number(gc(me.currency).fee)} GC Fee` : '',
    stones(me.currency).fee > 0 ? `${number(stones(me.currency).fee)} Stones Tax Fee` : '',
  ].filter(Boolean)
  const lines: { key: string; text: string; className: string }[] = []
  if (fees.length)
    lines.push({
      key: 'tax',
      text: `Trade Tax: ${fees.join(' + ')}`,
      className: 'font-bold text-[#cc6600]',
    })
  if (amounts(me.currency))
    lines.push({
      key: 'partner',
      text: `${partner.name} receives ${amounts(me.currency)} (−${rate}% fee)`,
      className: 'font-semibold text-[#666]',
    })
  if (amounts(partner.currency))
    lines.push({
      key: 'you',
      text: `You receive ${amounts(partner.currency)} (−${rate}% fee)`,
      className: 'font-semibold text-[#228b22]',
    })
  return lines
}

export function TradeWindow({ trade, character }: { trade: TradeView; character: Character }) {
  const action = useTradeAction()
  const [picking, setPicking] = useState(false)
  const [tip, setTip] = useState<Tip>(null)
  const allowed = canTradeAt(character.level)
  const editable = allowed && !action.isPending
  const { me, partner, version } = trade
  const run = (path: string, body: object = {}, done?: () => void) =>
    action.mutate(
      { path, body },
      {
        onSuccess: (result) => {
          if (result.completed) showToast('Trade completed.', 'success')
          done?.()
        },
        onError: (error) => showToast(errorMessage(error), 'failure'),
      },
    )
  const lines = taxLines(trade)
  const extra = 12 * Math.max(0, lines.length - 1)

  const main = (() => {
    if (!allowed) return { text: `Level ${TRADE_CONFIG.minLevel} required`, disabled: true }
    if (!me.ready || !partner.ready)
      return {
        text: me.ready ? 'Waiting' : 'Ready for Trade',
        onClick: () => run('ready', { ready: !me.ready, version }),
      }
    if (!me.confirmed) return { text: 'Confirm Trade', onClick: () => run('confirm', { version }) }
    return { text: partner.confirmed ? 'Trading' : 'Waiting for partner...', disabled: true }
  })()

  return (
    <Dialog
      title={`Trade with ${partner.name}`}
      onClose={() => run('cancel')}
      className="game-window-bare w-[424px] overflow-visible"
    >
      <div className="game-panel-1 relative w-[400px] text-black" style={{ height: 385 + extra }}>
        {[
          { side: me, title: 'Your Offer', left: 10 },
          { side: partner, title: 'Partner Offer', left: 192 },
        ].map(({ side, title, left }) => (
          <div key={title} className="absolute top-[10px] w-[172px]" style={{ left }}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#4b2f0a]">{title}</span>
              {side.ready && (
                <span className="text-[9px] font-bold text-[#228b22]">Ready Check</span>
              )}
            </div>
            <div className="game-inset size-[172px] p-[5px]">
              <OfferGrid
                label={side === me ? 'Your offer' : `${partner.name}'s offer`}
                items={side.items}
                onTip={setTip}
                onItem={
                  side === me && editable
                    ? (item) => run('items/remove', { inventoryId: item.inventoryId })
                    : undefined
                }
                onEmpty={side === me && editable ? () => setPicking(true) : undefined}
              />
            </div>
          </div>
        ))}
        <section
          aria-label="Currencies"
          className="absolute top-[212px] left-[10px] w-[380px] text-[10px]"
        >
          <div className="mb-[6px] flex border-b border-[#8b735566] pb-1 font-bold text-[#4b2f0a]">
            <span className="w-[70px]">Your Offer</span>
            <span className="flex-1" />
            <span className="w-[145px] pr-[5px] text-right">Partner Offers</span>
          </div>
          {CURRENCIES.map((currency) => (
            <CurrencyRow
              key={currency.key}
              currency={currency}
              mine={me.currency[currency.key]}
              owned={character[currency.key]}
              partner={partner.currency[currency.key]}
              disabled={me.ready || !allowed || action.isPending}
              onSet={(amount) => run('currency', { currency: currency.key, amount })}
            />
          ))}
        </section>
        <p className="absolute top-[307px] left-[10px] w-[380px] text-center text-[9px] text-[#666] italic">
          Click an empty slot to offer an item. Click offered items to remove.
        </p>
        {lines.length > 0 && (
          <div className="absolute top-[319px] left-[10px] w-[380px] text-center text-[9px]">
            {lines.map((line) => (
              <p
                key={line.key}
                title={line.text}
                className={`h-[12px] truncate leading-[12px] ${line.className}`}
              >
                {line.text}
              </p>
            ))}
          </div>
        )}
        <GameButton
          className="absolute left-[130px] h-[30px] w-[140px] text-[11px] font-bold"
          style={{ top: 340 + extra }}
          disabled={main.disabled || action.isPending}
          title={allowed ? undefined : LEVEL_MESSAGE}
          onClick={main.onClick}
        >
          {main.text}
        </GameButton>
        {picking && (
          <BagPicker
            offered={me.items.map((item) => item.inventoryId)}
            onPick={(item) => run('items/add', { inventoryId: item.id })}
            onClose={() => setPicking(false)}
          />
        )}
      </div>
      {tip && <ItemTooltip entry={{ item: tip.item, gear: tip.gear }} at={tip.at} />}
    </Dialog>
  )
}
