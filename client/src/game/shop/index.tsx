// The village shop laid out like Reborn's NPC shops (reborn-windows-A-L.md "Dungeon Shop",
// "Festival Shop"): a 480x510 BigBG1 panel, tabs, the balance box top right, 105x190 item cards
// eight to a page, and every purchase or sale behind the confirm prompt, reported by a toast.
// Our extras stay in the footer: the restock countdown, Buy all, Restock, Sell all, pouches.
import type { Character } from '@pockie/shared'
import { useEffect, useId, useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { Prompt } from '../Prompt'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { useShopAction, useShopView, type Currency, type ShopView, type StockItem } from './api'
import {
  Balance,
  CardGrid,
  currencyName,
  priceText,
  QuantityField,
  ShopCard,
  useCountdown,
  validCount,
  withToast,
} from './parts'
export { useOpenShop, useOpenMerchant } from './api'
export { MerchantWindow } from './merchant'

type TabId = '1' | '3' | '2' | '4' | 'sell'
const TABS: { id: TabId; title: string }[] = [
  { id: '1', title: 'Item Shop' },
  { id: '3', title: 'Dark Shop' },
  { id: '2', title: 'Mystery Shop' },
  { id: '4', title: 'Wholesale' },
  { id: 'sell', title: 'Sell' },
]
const WHOLESALE = 4
/** Wholesale quantity cap when the price is not in Stone. */
const WHOLESALE_CAP = 100
const FOOTER_BUTTON = 'h-[22px] min-w-0 px-[6px]'

type Prices = Partial<Record<Currency, number>>
type Sellable = ShopView['sellable'][number]
type Pending =
  | { kind: 'buy'; itemId: string; slot: number; prices: Prices; max: number }
  | { kind: 'sell'; item: Sellable }
  | { kind: 'sell-all' | 'buy-all' | 'restock' }

const pricesOf = (item: StockItem): Prices => ({
  stone: item.priceStone ?? 0,
  gold: item.priceGold ?? 0,
  giftCoupon: item.priceGiftCoupon ?? 0,
})
const times = (prices: Prices, amount: number) =>
  Object.fromEntries(
    Object.entries(prices).map(([key, value]) => [key, (value ?? 0) * amount]),
  ) as Prices

export function ShopWindow({
  character,
  onClose,
  initialTab = 1,
}: {
  character: Character
  onClose: () => void
  initialTab?: number
}) {
  const [active, setActive] = useState<TabId>(String(initialTab) as TabId)
  const selling = active === 'sell'
  const type = selling ? 1 : Number(active)
  const query = useShopView(type)
  const action = useShopAction()
  const [pending, setPending] = useState<Pending | null>(null)
  const [amount, setAmount] = useState(1)
  const [currency, setCurrency] = useState<Currency>('gold')
  const [pouches, setPouches] = useState(false)
  const panelId = useId()
  const tab = selling ? undefined : query.data?.tabs.find((entry) => entry.shopType === type)
  const countdown = useCountdown(tab?.refreshAt)
  useEffect(() => {
    if (tab && countdown.seconds === 0 && !action.isPending)
      action.mutate({
        action: 'refresh',
        body: { shopType: type, mode: 'countdown', currency: 'stone' },
      })
    // The refreshed query replaces refreshAt; do not retry a failed countdown on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.refreshAt, countdown.seconds, type])

  const ask = (next: Pending) => {
    setAmount(1)
    setPending(next)
  }
  /** Reborn's confirm closes on Accept; the result comes as a toast. */
  const run = (path: string, body: unknown, success: string) => {
    setPending(null)
    void withToast(action.mutateAsync({ action: path, body }), success)
  }

  const data = query.data
  const stock: StockItem[] =
    type === WHOLESALE
      ? (data?.wholesale.stock ?? []).map((item, slot) => ({
          ...item,
          slot,
          priceGold: 0,
          priceGiftCoupon: 0,
          appraised: false,
          identifyCount: 0,
          bound: true,
        }))
      : (tab?.stock ?? [])
  const wholesaleMax = (item: StockItem) =>
    Math.min(
      data?.wholesale.stock.find((row) => row.itemId === item.itemId)?.maxStack ?? 1,
      (item.priceStone ?? 0) > 0
        ? Math.floor(character.stone / (item.priceStone ?? 1))
        : WHOLESALE_CAP,
    )
  const sellTotal = (data?.sellable ?? []).reduce((sum, item) => sum + item.price * item.count, 0)

  return (
    <>
      <Dialog title="Shop" onClose={onClose} className="game-window-bare w-[490px]">
        <div className="game-panel-1 flex h-[510px] w-[480px] flex-col gap-[4px] p-[5px] font-game text-[12px] text-black">
          <Tabs
            label="Shop tabs"
            tabs={TABS}
            active={active}
            onChange={setActive}
            panelId={panelId}
          />
          <section
            role="tabpanel"
            id={panelId}
            aria-label={TABS.find((entry) => entry.id === active)!.title}
            className="flex min-h-0 flex-1 flex-col gap-[4px]"
          >
            <div className="flex justify-end">
              <Balance character={character} currencies={['stone', 'gold', 'giftCoupon']} />
            </div>
            {query.isPending && <p>Opening shop...</p>}
            {query.isError && <Notice tone="error">{errorMessage(query.error)}</Notice>}
            {data && !selling && (
              <CardGrid
                key={active}
                label="Shop stock"
                items={stock}
                empty="Sold out. Restock to see new wares."
                card={(item) => {
                  const name = itemName(item.itemId)
                  return (
                    <ShopCard
                      key={item.slot}
                      itemId={item.itemId}
                      lines={
                        <>
                          <span>
                            {priceText(pricesOf(item))}
                            {type === WHOLESALE && ' each'}
                          </span>
                          <span>{item.bound ? 'Bound' : 'Unbound'}</span>
                          {item.identifyCount > 0 && (
                            <span>
                              {item.identifyCount} properties,{' '}
                              {item.appraised ? 'appraised' : 'unappraised'}
                            </span>
                          )}
                        </>
                      }
                      button="Buy"
                      buttonLabel={`Buy ${name}`}
                      disabled={action.isPending}
                      onClick={() =>
                        ask({
                          kind: 'buy',
                          itemId: item.itemId,
                          slot: item.slot,
                          prices: pricesOf(item),
                          max: type === WHOLESALE ? wholesaleMax(item) : 1,
                        })
                      }
                    />
                  )
                }}
              />
            )}
            {data && selling && (
              <CardGrid
                key="sell"
                label="Bag items"
                items={data.sellable}
                empty="Nothing in your bag can be sold here."
                card={(item) => (
                  <ShopCard
                    key={item.inventoryId}
                    itemId={item.itemId}
                    count={item.count}
                    lines={
                      <>
                        <span>{item.price} Stone each</span>
                        {item.confirm && <span className="text-[#c00]">Valuable</span>}
                      </>
                    }
                    button="Sell"
                    buttonLabel={`Sell ${itemName(item.itemId)}`}
                    disabled={action.isPending}
                    onClick={() => ask({ kind: 'sell', item })}
                  />
                )}
              />
            )}
            {data && (
              <div className="mt-auto flex items-center justify-between gap-[4px]">
                <span className="text-[11px]">
                  {tab
                    ? `Restock in ${countdown.text} (${tab.freeRestocks} free)`
                    : selling
                      ? 'Equipped and untradeable items cannot be sold.'
                      : 'Purchases are bound.'}
                </span>
                <span className="flex gap-[4px]">
                  {tab && (
                    <>
                      <GameButton
                        small
                        className={FOOTER_BUTTON}
                        disabled={action.isPending || !tab.stock.length}
                        onClick={() => ask({ kind: 'buy-all' })}
                      >
                        Buy all
                      </GameButton>
                      <GameButton
                        small
                        className={FOOTER_BUTTON}
                        disabled={action.isPending}
                        onClick={() => ask({ kind: 'restock' })}
                      >
                        Restock
                      </GameButton>
                    </>
                  )}
                  {selling && (
                    <GameButton
                      small
                      className={FOOTER_BUTTON}
                      disabled={action.isPending || !data.sellable.length}
                      onClick={() => ask({ kind: 'sell-all' })}
                    >
                      Sell all
                    </GameButton>
                  )}
                  <GameButton small className={FOOTER_BUTTON} onClick={() => setPouches(true)}>
                    Refill pouches
                  </GameButton>
                </span>
              </div>
            )}
          </section>
        </div>
      </Dialog>
      {pending?.kind === 'buy' && (
        <Prompt
          label={`Buy ${itemName(pending.itemId)}`}
          message={`Buy ${itemName(pending.itemId)}${pending.max > 1 ? ` x${amount}` : ''}?\n\nCost: ${priceText(
            times(pending.prices, validCount(amount, pending.max) ? amount : 0),
          )}`}
          acceptDisabled={action.isPending || !validCount(amount, pending.max)}
          onAccept={() =>
            run(
              type === WHOLESALE ? 'wholesale/buy' : 'buy',
              type === WHOLESALE
                ? { itemId: pending.itemId, count: amount }
                : {
                    shopType: type,
                    slot: pending.slot,
                    currency: pending.prices.gold ? 'gold' : 'stone',
                  },
              'Purchase successful!',
            )
          }
          onClose={() => setPending(null)}
        >
          {pending.max > 1 && (
            <QuantityField value={amount} max={pending.max} onChange={setAmount} />
          )}
        </Prompt>
      )}
      {pending?.kind === 'sell' && (
        <SellPrompt
          item={pending.item}
          amount={amount}
          setAmount={setAmount}
          busy={action.isPending}
          onAccept={() =>
            run('sell', { inventoryId: pending.item.inventoryId, count: amount }, 'Sale complete.')
          }
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'sell-all' && data && (
        <Prompt
          label="Sell all"
          message={`Sell all ${data.sellable.length} items for ${sellTotal} Stone? Selling is final.`}
          acceptDisabled={action.isPending}
          onAccept={() =>
            run(
              'sell-all',
              { inventoryIds: data.sellable.map((item) => item.inventoryId) },
              'Sale complete.',
            )
          }
          onClose={() => setPending(null)}
        >
          {data.sellable.some((item) => item.confirm) && (
            <p className="text-[#c00]">
              Valuable:{' '}
              {data.sellable
                .filter((item) => item.confirm)
                .map((item) => `${itemName(item.itemId)} x${item.count}`)
                .join(', ')}
            </p>
          )}
        </Prompt>
      )}
      {pending?.kind === 'buy-all' && tab && (
        <Prompt
          label="Buy all"
          message={`Buy all ${tab.stock.length} items for ${priceText(
            tab.stock.reduce<Prices>(
              (sum, item) => ({
                stone: (sum.stone ?? 0) + (item.priceStone ?? 0),
                gold: (sum.gold ?? 0) + (item.priceGold ?? 0),
                giftCoupon: (sum.giftCoupon ?? 0) + (item.priceGiftCoupon ?? 0),
              }),
              {},
            ),
          )}?`}
          acceptDisabled={action.isPending}
          onAccept={() => run('buy-all', { shopType: type }, 'Purchase successful!')}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'restock' && tab && (
        <Prompt
          label="Restock"
          message={
            tab.freeRestocks ? 'Use a free restock?' : `Restock for ${priceText(tab.restockCosts)}?`
          }
          acceptDisabled={action.isPending}
          onAccept={() =>
            run(
              'refresh',
              {
                shopType: type,
                mode: 'instant',
                currency: tab.restockCosts.stone !== undefined ? 'stone' : currency,
              },
              'Shop restocked.',
            )
          }
          onClose={() => setPending(null)}
        >
          {tab.restockCosts.gold !== undefined && (
            <CurrencySelect value={currency} onChange={setCurrency} />
          )}
        </Prompt>
      )}
      {pouches && <PouchRefillDialog character={character} onClose={() => setPouches(false)} />}
    </>
  )
}

/** Reborn's Sell confirm: "Sell {n} [[item]] for {price}", with our valuable-item warning. */
function SellPrompt({
  item,
  amount,
  setAmount,
  busy,
  onAccept,
  onClose,
}: {
  item: Sellable
  amount: number
  setAmount: (amount: number) => void
  busy: boolean
  onAccept: () => void
  onClose: () => void
}) {
  const name = itemName(item.itemId)
  const count = validCount(amount, item.count) ? amount : 0
  return (
    <Prompt
      label={`Sell ${name}`}
      message={`Sell ${count} ${name} for ${item.price * count} Stone?${
        item.confirm ? '\nReview this valuable item carefully. Selling is final.' : ''
      }`}
      acceptDisabled={busy || count === 0}
      onAccept={onAccept}
      onClose={onClose}
    >
      {item.count > 1 && <QuantityField value={amount} max={item.count} onChange={setAmount} />}
    </Prompt>
  )
}

function CurrencySelect({
  value,
  onChange,
}: {
  value: Currency
  onChange: (currency: Currency) => void
}) {
  return (
    <label className="block">
      Pay with{' '}
      <select
        aria-label="Pay with"
        value={value}
        onChange={(event) => onChange(event.target.value as Currency)}
      >
        <option value="gold">Gold</option>
        <option value="giftCoupon">Gift Coupons</option>
      </select>
    </label>
  )
}

export function PouchRefillDialog({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const action = useShopAction()
  const [currency, setCurrency] = useState<Currency>('gold')
  const [hp, setHp] = useState(0)
  const [mp, setMp] = useState(0)
  const cost = (current: number, amount: number) =>
    current >= character.pouchMax
      ? 0
      : amount === -1
        ? Math.ceil((character.pouchMax - current) / 1000)
        : amount
  const total = cost(character.hpPouch, hp) + cost(character.mpPouch, mp)
  return (
    <Dialog title="Refill Pouches" onClose={onClose}>
      <p>1 Gold or Gift Coupon per 1,000 points. Enter -1 to fill a pouch, or 0 to skip it.</p>
      <p>
        HP: {character.hpPouch} / {character.pouchMax}; MP: {character.mpPouch} /{' '}
        {character.pouchMax}
      </p>
      {(['hp', 'mp'] as const).map((kind) => (
        <label key={kind} className="block">
          {kind.toUpperCase()} refill{' '}
          <input
            aria-label={`${kind.toUpperCase()} refill`}
            type="number"
            min={-1}
            max={Math.ceil(character.pouchMax / 1000)}
            value={kind === 'hp' ? hp : mp}
            onChange={(event) => (kind === 'hp' ? setHp : setMp)(Number(event.target.value))}
          />
        </label>
      ))}
      <GameButton
        small
        onClick={() => {
          setHp(-1)
          setMp(-1)
        }}
      >
        Fill both
      </GameButton>
      <CurrencySelect value={currency} onChange={setCurrency} />
      <p>
        Cost: {total} {currencyName(currency)}
      </p>
      <GameButton
        disabled={
          action.isPending ||
          ![hp, mp].every(
            (n) => Number.isInteger(n) && n >= -1 && n <= Math.ceil(character.pouchMax / 1000),
          ) ||
          total <= 0
        }
        onClick={() => action.mutate({ action: 'pouches/refill', body: { currency, hp, mp } })}
      >
        Refill pouches
      </GameButton>
      {action.isSuccess && <Notice>Pouches refilled.</Notice>}
      {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
    </Dialog>
  )
}
