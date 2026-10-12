import type { Character } from '@pockie/shared'
import { useEffect, useId, useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { useMerchantView, useShopAction, useShopView, type Currency, type StockItem } from './api'
export { useOpenShop, useOpenMerchant } from './api'

const tabNames: Record<number, string> = {
  1: 'Item Shop',
  2: 'Mystery Shop',
  3: 'Dark Shop',
  4: 'Wholesale',
}
const currencyName = (currency: Currency) =>
  ({ stone: 'Stone', gold: 'Gold', giftCoupon: 'Gift Coupons' })[currency]
const priceText = (prices: Partial<Record<Currency, number>>) =>
  (Object.entries(prices) as [Currency, number][])
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => `${value} ${currencyName(currency)}`)
    .join(', ') || 'Free'
const pricesOf = (item: StockItem) => ({
  stone: item.priceStone ?? 0,
  gold: item.priceGold ?? 0,
  giftCoupon: item.priceGiftCoupon ?? 0,
})

function useCountdown(end: string | undefined) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = end ? Math.max(0, Math.ceil((Date.parse(end) - now) / 1000)) : 0
  return {
    seconds,
    text: [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':'),
  }
}

export function ShopWindow({
  character,
  onClose,
  initialTab = 1,
}: {
  character: Character
  onClose: () => void
  initialTab?: number
}) {
  const [active, setActive] = useState(String(initialTab))
  const query = useShopView(Number(active))
  const action = useShopAction()
  const [buy, setBuy] = useState<{
    itemId: string
    slot: number
    prices: Partial<Record<Currency, number>>
    max: number
  } | null>(null)
  const [amount, setAmount] = useState(1)
  const [currency, setCurrency] = useState<Currency>('gold')
  const [confirm, setConfirm] = useState<'sell-all' | 'buy-all' | 'restock' | null>(null)
  const [sellId, setSellId] = useState<string | null>(null)
  const [sellCount, setSellCount] = useState(1)
  const [pouches, setPouches] = useState(false)
  const [notice, setNotice] = useState('')
  const panelId = useId()
  const type = Number(active)
  const tab = query.data?.tabs.find((entry) => entry.shopType === type)
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
  async function run(path: string, body: unknown, success: string) {
    setNotice('')
    try {
      await action.mutateAsync({ action: path, body })
      setNotice(success)
      setBuy(null)
      setConfirm(null)
      setSellId(null)
    } catch {
      /* Mutation error is rendered in the window. */
    }
  }
  const selected = query.data?.sellable.find((item) => item.inventoryId === sellId)
  return (
    <>
      <Dialog title="Shop" onClose={onClose} className="w-[42rem]">
        <p className="mb-2">
          {character.stone} Stone · {character.gold} Gold · {character.giftCoupon} Gift Coupons
        </p>
        {query.isPending && <p>Opening shop...</p>}
        {query.isError && <Notice tone="error">{errorMessage(query.error)}</Notice>}
        {query.data && (
          <>
            <Tabs
              label="Shop tabs"
              tabs={[1, 3, 2, 4].map((id) => ({ id: String(id), title: tabNames[id]! }))}
              active={active}
              onChange={setActive}
              panelId={panelId}
            />
            <section
              role="tabpanel"
              id={panelId}
              aria-label={tabNames[type]}
              className="game-inset p-3"
            >
              {tab ? (
                <>
                  <p>
                    Restock in {countdown.text}. Free restocks left today: {tab.freeRestocks}.
                  </p>
                  <p className="text-xs">
                    {type === 1
                      ? 'Gray and blue-grade equipment. Purchases are bound.'
                      : type === 3
                        ? 'Unappraised equipment with a chance of orange-grade gear. Purchases are bound.'
                        : 'Blue, orange and gold-grade equipment. Equipment is unappraised.'}
                  </p>
                </>
              ) : (
                <p>Wholesale level band: {query.data.wholesale.boxId}. Purchases are bound.</p>
              )}
              <ul aria-label="Shop stock" className="my-3 grid grid-cols-2 gap-2">
                {(
                  tab?.stock ??
                  query.data.wholesale.stock.map((item, slot) => ({
                    ...item,
                    slot,
                    priceGold: 0,
                    priceGiftCoupon: 0,
                    appraised: false,
                    identifyCount: 0,
                    bound: true,
                  }))
                ).map((item) => (
                  <li key={item.slot} className="rounded border border-wood-light bg-white/40 p-2">
                    <div className="flex items-center gap-2">
                      <ItemIcon
                        itemId={item.itemId}
                        name={itemName(item.itemId)}
                        className="size-10 border-[7px] [border-image-source:var(--ui-slot-shop)] [border-image-slice:14] [border-image-repeat:stretch]"
                      />
                      <span>{itemName(item.itemId)}</span>
                    </div>
                    <p>{priceText(pricesOf(item))}</p>
                    <p className="text-xs">
                      {item.bound ? 'Bound' : 'Unbound'}
                      {item.identifyCount > 0 &&
                        ` · ${item.identifyCount} properties · ${item.appraised ? 'Appraised' : 'Unappraised'}`}
                    </p>
                    <GameButton
                      small
                      disabled={action.isPending}
                      aria-label={`Buy ${itemName(item.itemId)}`}
                      onClick={() => {
                        setAmount(1)
                        setBuy({
                          itemId: item.itemId,
                          slot: item.slot,
                          prices: pricesOf(item),
                          max:
                            type === 4
                              ? Math.min(
                                  query.data.wholesale.stock.find(
                                    (row) => row.itemId === item.itemId,
                                  )?.maxStack ?? 1,
                                  (item.priceStone ?? 0) > 0
                                    ? Math.floor(character.stone / (item.priceStone ?? 1))
                                    : 100,
                                )
                              : 1,
                        })
                      }}
                    >
                      Buy
                    </GameButton>
                  </li>
                ))}
              </ul>
              {tab && (
                <div className="flex gap-2">
                  <GameButton
                    small
                    disabled={action.isPending || !tab.stock.length}
                    onClick={() => setConfirm('buy-all')}
                  >
                    Buy all
                  </GameButton>
                  <GameButton
                    small
                    disabled={action.isPending}
                    onClick={() => setConfirm('restock')}
                  >
                    Restock now
                  </GameButton>
                </div>
              )}
            </section>
            <section aria-label="Sell bag items" className="mt-3">
              <h3 className="font-bold">Sell bag items</h3>
              <p className="text-xs">Equipped and untradeable items cannot be sold.</p>
              <select
                aria-label="Item to sell"
                value={sellId ?? ''}
                onChange={(event) => {
                  setSellId(event.target.value || null)
                  setSellCount(1)
                }}
              >
                <option value="">Select an item</option>
                {query.data.sellable.map((item) => (
                  <option key={item.inventoryId} value={item.inventoryId}>
                    {itemName(item.itemId)} x{item.count}
                  </option>
                ))}
              </select>
              {selected && (
                <>
                  <label className="ml-2">
                    Sell quantity{' '}
                    <input
                      aria-label="Sell quantity"
                      type="number"
                      min={1}
                      max={selected.count}
                      value={sellCount}
                      onChange={(event) => setSellCount(Number(event.target.value))}
                      className="w-16"
                    />
                  </label>
                  <GameButton
                    small
                    disabled={
                      action.isPending ||
                      !Number.isInteger(sellCount) ||
                      sellCount < 1 ||
                      sellCount > selected.count
                    }
                    onClick={() =>
                      void run(
                        'sell',
                        { inventoryId: selected.inventoryId, count: sellCount },
                        'Sale complete.',
                      )
                    }
                  >
                    Sell for {selected.price * sellCount} Stone
                  </GameButton>
                  {selected.confirm && (
                    <p className="text-xs">
                      Review this valuable item carefully. Selling is final.
                    </p>
                  )}
                </>
              )}
              <div className="mt-2 flex gap-2">
                <GameButton
                  small
                  disabled={!query.data.sellable.length || action.isPending}
                  onClick={() => setConfirm('sell-all')}
                >
                  Sell all
                </GameButton>
                <GameButton small onClick={() => setPouches(true)}>
                  Refill pouches
                </GameButton>
              </div>
            </section>
          </>
        )}
        {notice && <Notice>{notice}</Notice>}
        {action.isError && !buy && !confirm && (
          <Notice tone="error">{errorMessage(action.error)}</Notice>
        )}
      </Dialog>
      {buy && (
        <Dialog title={`Buy ${itemName(buy.itemId)}`} onClose={() => setBuy(null)}>
          <p>
            {priceText(
              Object.fromEntries(
                Object.entries(buy.prices).map(([key, value]) => [key, (value ?? 0) * amount]),
              ),
            )}
          </p>
          <label>
            Quantity{' '}
            <input
              aria-label="Quantity"
              type="number"
              min={1}
              max={buy.max}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="w-20"
            />
          </label>
          <p>Maximum: {buy.max}</p>
          <GameButton
            disabled={
              action.isPending || !Number.isInteger(amount) || amount < 1 || amount > buy.max
            }
            onClick={() =>
              void run(
                type === 4 ? 'wholesale/buy' : 'buy',
                type === 4
                  ? { itemId: buy.itemId, count: amount }
                  : {
                      shopType: type,
                      slot: buy.slot,
                      currency: buy.prices.gold ? 'gold' : 'stone',
                    },
                'Purchase complete.',
              )
            }
          >
            Confirm purchase
          </GameButton>
          {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        </Dialog>
      )}
      {confirm && query.data && (
        <Dialog
          title={
            confirm === 'sell-all'
              ? 'Sell all items'
              : confirm === 'buy-all'
                ? 'Buy all items'
                : 'Restock shop'
          }
          onClose={() => setConfirm(null)}
        >
          {confirm === 'sell-all' ? (
            <>
              <p>Selling is final.</p>
              <ul>
                {query.data.sellable.map((item) => (
                  <li key={item.inventoryId}>
                    {itemName(item.itemId)} x{item.count} — {item.price * item.count} Stone
                    {item.confirm && <strong> · Review valuable item</strong>}
                  </li>
                ))}
              </ul>
              <p>
                Total: {query.data.sellable.reduce((sum, item) => sum + item.price * item.count, 0)}{' '}
                Stone
              </p>
            </>
          ) : confirm === 'buy-all' ? (
            <p>
              Buy all {tab?.stock.length} items for{' '}
              {priceText(
                (tab?.stock ?? []).reduce(
                  (sum, item) => ({
                    stone: sum.stone + (item.priceStone ?? 0),
                    gold: sum.gold + (item.priceGold ?? 0),
                    giftCoupon: sum.giftCoupon + (item.priceGiftCoupon ?? 0),
                  }),
                  { stone: 0, gold: 0, giftCoupon: 0 },
                ),
              )}
              ?
            </p>
          ) : (
            <>
              <p>
                {tab?.freeRestocks
                  ? 'Use a free restock?'
                  : `Restock for ${priceText(tab?.restockCosts ?? {})}?`}
              </p>
              {tab?.restockCosts.gold !== undefined && (
                <CurrencySelect value={currency} onChange={setCurrency} />
              )}
            </>
          )}
          <GameButton
            disabled={action.isPending}
            onClick={() =>
              void run(
                confirm === 'sell-all' ? 'sell-all' : confirm === 'buy-all' ? 'buy-all' : 'refresh',
                confirm === 'sell-all'
                  ? { inventoryIds: query.data.sellable.map((item) => item.inventoryId) }
                  : confirm === 'buy-all'
                    ? { shopType: type }
                    : {
                        shopType: type,
                        mode: 'instant',
                        currency: tab?.restockCosts.stone !== undefined ? 'stone' : currency,
                      },
                confirm === 'sell-all'
                  ? 'Sale complete.'
                  : confirm === 'buy-all'
                    ? 'Purchase complete.'
                    : 'Shop restocked.',
              )
            }
          >
            {confirm === 'sell-all' ? 'Confirm sale' : 'Confirm'}
          </GameButton>
          {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        </Dialog>
      )}
      {pouches && <PouchRefillDialog character={character} onClose={() => setPouches(false)} />}
    </>
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

export function MerchantWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const query = useMerchantView()
  const action = useShopAction()
  const [tab, setTab] = useState('gold')
  const [slot, setSlot] = useState<number | null>(null)
  const [count, setCount] = useState(1)
  const id = useId()
  const data = query.data && query.data.available !== false ? query.data : null
  const countdown = useCountdown(data?.endsAt)
  const stock = data ? (tab === 'gold' ? data.stock : data.vipStock) : []
  const selected = stock.find((item) => item.slot === slot)
  return (
    <>
      <Dialog title="Mysterious Merchant" onClose={onClose} className="w-[38rem]">
        {query.isPending && <p>Finding the merchant...</p>}
        {query.isError && <Notice tone="error">{errorMessage(query.error)}</Notice>}
        {query.data && !data && (
          <p>
            The merchant is away. Visit the neutral fields during the first ten minutes of a
            scheduled hour.
          </p>
        )}
        {data && (
          <>
            <p>
              Scene {data.sceneId}. Leaves in {countdown.text}.
            </p>
            <Tabs
              label="Merchant tabs"
              tabs={[
                { id: 'gold', title: 'Gold' },
                { id: 'vip', title: 'VIP' },
              ]}
              active={tab}
              onChange={(value) => {
                setTab(value)
                setSlot(null)
              }}
              panelId={id}
            />
            <section role="tabpanel" id={id} aria-label={tab === 'gold' ? 'Gold' : 'VIP'}>
              {tab === 'vip' && !data.vipAvailable && <Notice>VIP membership is required.</Notice>}
              <ul className="flex flex-col gap-2">
                {stock.map((item) => (
                  <li
                    key={item.slot}
                    className="flex items-center gap-3 rounded border border-wood-light p-2"
                  >
                    <ItemIcon
                      itemId={item.itemId}
                      name={itemName(item.itemId)}
                      className="size-10 border-[7px] [border-image-source:var(--ui-slot-shop)] [border-image-slice:14] [border-image-repeat:stretch]"
                    />
                    <div className="flex-1">
                      <p>
                        {itemName(item.itemId)} · {item.price} Gold
                      </p>
                      <p>{item.bound ? 'Bound' : 'Unbound'}</p>
                      <p>
                        Stock: {item.left}; your remaining limit:{' '}
                        {Math.max(0, item.limit - item.purchased)}
                      </p>
                      <p>Requires level {item.useLevel}</p>
                    </div>
                    <GameButton
                      small
                      aria-label={`Buy ${itemName(item.itemId)}`}
                      disabled={
                        action.isPending ||
                        countdown.seconds === 0 ||
                        (tab === 'vip' && !data.vipAvailable) ||
                        character.level < item.useLevel ||
                        item.left === 0 ||
                        item.purchased >= item.limit
                      }
                      onClick={() => {
                        setSlot(item.slot)
                        setCount(1)
                      }}
                    >
                      Buy
                    </GameButton>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        {action.isSuccess && <Notice>Purchase complete.</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
      </Dialog>
      {selected && data && (
        <Dialog title={`Buy ${itemName(selected.itemId)}`} onClose={() => setSlot(null)}>
          <label>
            Quantity{' '}
            <input
              aria-label="Quantity"
              type="number"
              min={1}
              max={Math.min(
                selected.left < 0 ? Infinity : selected.left,
                selected.limit - selected.purchased,
              )}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>
          <p>Cost: {selected.price * count} Gold</p>
          <GameButton
            disabled={
              action.isPending ||
              countdown.seconds === 0 ||
              !Number.isInteger(count) ||
              count < 1 ||
              count > selected.limit - selected.purchased ||
              (selected.left >= 0 && count > selected.left)
            }
            onClick={async () => {
              try {
                await action.mutateAsync({
                  action: 'merchant/buy',
                  body: { spawnId: data.spawnId, tab, slot: selected.slot, count },
                })
                setSlot(null)
              } catch {
                /* Render the mutation error. */
              }
            }}
          >
            Confirm purchase
          </GameButton>
          {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        </Dialog>
      )}
    </>
  )
}
