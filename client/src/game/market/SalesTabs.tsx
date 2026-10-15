// Reborn's Recent tab (component X, the last 50 sales on the Market) and History tab (component Y,
// your sales with the tax and your purchases).
import { useState } from 'react'
import type { MarketSale } from '../../../../shared/src/schemas/market'
import { errorMessage } from '../api'
import { GameButton } from '../skin'
import { useMarketHistory, useMarketRecent } from './api'
import {
  CELL,
  Header,
  marketItemName,
  NameCell,
  PriceTag,
  TypeSelect,
  typeOf,
  usePages,
  type Coin,
  type ItemType,
} from './parts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A sale's amounts per currency (one in Reborn; a 2011 listing may have charged both). */
const paid = (sale: MarketSale) =>
  (
    [
      ['stone', sale.stone, sale.taxStone],
      ['gold', sale.gold, sale.taxGold],
    ] as const
  ).flatMap(([currency, total, tax]) => (total > 0 ? [{ currency, total, tax }] : []))

const asItem = (sale: MarketSale) => ({ ...sale, bound: false })

/** "{n}d ago" / "{n}h ago" / "{n}m ago" / "Just now". */
export function ago(at: string, now = Date.now()) {
  const ms = now - Date.parse(at)
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d ago`
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h ago`
  if (ms >= MINUTE) return `${Math.floor(ms / MINUTE)}m ago`
  return 'Just now'
}

const dateText = (at: string) =>
  new Date(at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Rounded mean unit price per item and currency. */
function averages(sales: MarketSale[]) {
  const sums = new Map<string, [number, number]>()
  for (const sale of sales)
    for (const { currency, total } of paid(sale)) {
      const key = `${sale.itemId}|${currency}`
      const [sum, n] = sums.get(key) ?? [0, 0]
      sums.set(key, [sum + total, n + sale.count])
    }
  return (itemId: string, currency: Coin) => {
    const [sum, n] = sums.get(`${itemId}|${currency}`)!
    return Math.round(sum / n)
  }
}

const RECENT_COLUMNS: [string, number][] = [
  ['Name', 192],
  ['Qty', 40],
  ['Unit Price', 102],
  ['Avg. Price', 102],
  ['Total', 112],
  ['When', 104],
]

export function RecentTab() {
  const recent = useMarketRecent()
  const [type, setType] = useState<ItemType>('all')
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const all = recent.data?.sales ?? []
  const avg = averages(all)
  const sales = all.filter(
    (sale) =>
      (type === 'all' || typeOf(sale.info) === type) &&
      (!needle || marketItemName(asItem(sale)).toLowerCase().includes(needle)),
  )
  const { shown, pager } = usePages(sales, `${type}|${needle}`)
  return (
    <div className="flex flex-col gap-[4px]">
      <div className="flex h-[20px] items-center gap-[5px]">
        <GameButton
          small
          className="h-[20px] w-[55px] min-w-0 px-0"
          onClick={() => void recent.refetch()}
        >
          Refresh
        </GameButton>
        <TypeSelect value={type} onChange={setType} className="h-[20px] w-[90px]" />
        <input
          aria-label="Search"
          placeholder="Search by name..."
          value={search}
          maxLength={40}
          onChange={(event) => setSearch(event.target.value)}
          className="game-field h-[16px] w-[120px] px-[3px] text-[11px]"
        />
        <span className="ml-auto text-[11px]">Last 50 Sales</span>
      </div>
      <div role="table" aria-label="Recent sales" className="flex flex-col gap-[2px]">
        <Header columns={RECENT_COLUMNS} />
        {shown.map((sale) => {
          const [main] = paid(sale)
          const unit = main ? Math.round(main.total / sale.count) : 0
          const mean = main ? avg(sale.itemId, main.currency) : 0
          return (
            <div key={sale.id} role="row" className="flex gap-[2px]">
              <NameCell item={asItem(sale)} width={192} />
              <span className={CELL} style={{ width: 40 }}>
                {sale.count}
              </span>
              <span
                className={`${CELL} font-bold ${unit < mean ? 'text-[#1a7f1a]' : unit > mean ? 'text-[#c00]' : ''}`}
                style={{ width: 102 }}
              >
                {main && <PriceTag value={unit} currency={main.currency} />}
              </span>
              <span className={CELL} style={{ width: 102 }}>
                {main && <PriceTag value={mean} currency={main.currency} />}
              </span>
              <span className={CELL} style={{ width: 112 }}>
                {paid(sale).map(({ currency, total }) => (
                  <PriceTag key={currency} value={total} currency={currency} />
                ))}
              </span>
              <span className={CELL} style={{ width: 104 }}>
                {ago(sale.at)}
              </span>
            </div>
          )
        })}
      </div>
      {recent.isError && <p className="text-[#c00]">{errorMessage(recent.error)}</p>}
      {recent.data && sales.length === 0 && <p>No recent sales found</p>}
      {pager}
    </div>
  )
}

const SALES_COLUMNS: [string, number][] = [
  ['Name', 168],
  ['Qty', 40],
  ['Price', 106],
  ['Tax %', 86],
  ['Received', 110],
  ['Date', 142],
]
const PURCHASE_COLUMNS: [string, number][] = [
  ['Name', 230],
  ['Qty', 56],
  ['Price Paid', 178],
  ['Date', 192],
]

/** Sums per currency of `pick` over the sales. */
function totals(sales: MarketSale[], pick: (row: ReturnType<typeof paid>[number]) => number) {
  const sum: Record<Coin, number> = { stone: 0, gold: 0 }
  for (const sale of sales) for (const row of paid(sale)) sum[row.currency] += pick(row)
  return (['stone', 'gold'] as const).flatMap((currency) =>
    sum[currency] ? [<PriceTag key={currency} value={sum[currency]} currency={currency} />] : [],
  )
}

export function HistoryTab() {
  const history = useMarketHistory()
  const [view, setView] = useState<'sales' | 'purchases'>('sales')
  const rows = history.data?.[view] ?? []
  const { shown, pager } = usePages(rows, view)
  const toggle = (id: typeof view, label: string, width: number) => (
    <GameButton
      small
      aria-pressed={view === id}
      className={`h-[22px] min-w-0 px-0 ${view === id ? '' : 'opacity-60'}`}
      style={{ width }}
      onClick={() => setView(id)}
    >
      {label}
    </GameButton>
  )
  return (
    <div className="flex flex-col gap-[4px]">
      <div className="flex h-[22px] items-center gap-[5px]">
        {toggle('sales', 'My Sales', 80)}
        {toggle('purchases', 'My Purchases', 90)}
        <span className="ml-auto inline-flex items-center gap-[4px] text-[10px]">
          {view === 'sales' ? (
            <>
              Sold: {totals(rows, (r) => r.total)} | Tax: {totals(rows, (r) => r.tax)} | Received:{' '}
              {totals(rows, (r) => r.total - r.tax)}
            </>
          ) : (
            <>Total Spent: {totals(rows, (r) => r.total)}</>
          )}
        </span>
      </div>
      <div
        role="table"
        aria-label={view === 'sales' ? 'My sales' : 'My purchases'}
        className="flex flex-col gap-[2px]"
      >
        <Header columns={view === 'sales' ? SALES_COLUMNS : PURCHASE_COLUMNS} />
        {shown.map((sale) => (
          <div key={sale.id} role="row" className="flex gap-[2px]">
            <NameCell item={asItem(sale)} width={view === 'sales' ? 168 : 230} />
            <span className={CELL} style={{ width: view === 'sales' ? 40 : 56 }}>
              {sale.count}
            </span>
            <span className={CELL} style={{ width: view === 'sales' ? 106 : 178 }}>
              {paid(sale).map(({ currency, total }) => (
                <PriceTag key={currency} value={total} currency={currency} />
              ))}
            </span>
            {view === 'sales' && (
              <>
                <span className={`${CELL} text-[#c00]`} style={{ width: 86 }}>
                  {paid(sale).map(({ currency, tax }) => (
                    <PriceTag key={currency} value={-tax} currency={currency} />
                  ))}
                </span>
                <span className={`${CELL} text-[#1a7f1a]`} style={{ width: 110 }}>
                  {paid(sale).map(({ currency, total, tax }) => (
                    <PriceTag key={currency} value={total - tax} currency={currency} />
                  ))}
                </span>
              </>
            )}
            <span className={CELL} style={{ width: view === 'sales' ? 142 : 192 }}>
              {dateText(sale.at)}
            </span>
          </div>
        ))}
      </div>
      {history.isError && <p className="text-[#c00]">{errorMessage(history.error)}</p>}
      {history.data && rows.length === 0 && (
        <p>{view === 'sales' ? 'No sales history yet' : 'No purchase history yet'}</p>
      )}
      {pager}
    </div>
  )
}
