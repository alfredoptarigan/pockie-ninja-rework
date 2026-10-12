import type { Random } from '../random.js'

export type ShopType = 1 | 2 | 3
export interface Prices {
  stone: number
  gold: number
  coupons: number
}
export interface ShopRow {
  item: string
  costs: { amount: number; type: number }[]
}
export interface DrawnShopItem {
  slot: number
  item: string
  prices: Prices
  identifyCount: number
  appraised: boolean
  bound: boolean
}

export function pricesFromCosts(costs: ShopRow['costs']): Prices {
  const prices = { stone: 0, gold: 0, coupons: 0 }
  for (const { amount, type } of costs) {
    if (type === 0) prices.stone += amount
    if (type === 2) prices.gold += amount
    if (type === 3) prices.coupons += amount
  }
  return prices
}

export function parsePrices(value: string): Prices {
  const fields = value.split(',').map(Number)
  const costs = []
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const amount = fields[i]!
    const type = fields[i + 1]!
    if (Number.isFinite(amount) && amount >= 0 && Number.isInteger(type))
      costs.push({ amount, type })
  }
  return pricesFromCosts(costs)
}

export function findLevelBand<T extends { MinLevel: number; MaxLevel: number }>(
  rows: Record<string, T>,
  level: number,
  predicate: (row: T) => boolean = () => true,
): [string, T] | undefined {
  return Object.entries(rows).find(
    ([, row]) => level >= row.MinLevel && level <= row.MaxLevel && predicate(row),
  )
}

export function splitStacks(count: number, maxFold: number): number[] {
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(maxFold) || maxFold < 1)
    throw new RangeError('Invalid stack amount')
  return Array.from({ length: Math.ceil(count / maxFold) }, (_, i) =>
    Math.min(maxFold, count - i * maxFold),
  )
}

function weightedIndex(weights: number[], random: Random): number {
  let roll = random.int(weights.reduce((sum, weight) => sum + weight, 0))
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!
    if (roll < 0) return i
  }
  return weights.length - 1
}

/** Missing item configurations are skipped, as in the original Create failure. */
export function drawRefreshStock(
  rows: readonly ShopRow[],
  count: number,
  type: ShopType,
  tutorialComplete: boolean,
  random: Random,
  itemInfo: (id: string) => { equipment: boolean; maxIdentifyCount: number } | undefined,
): DrawnShopItem[] {
  const stock: DrawnShopItem[] = []
  if (!rows.length) return stock
  for (let i = 0; i < count; i++) {
    const row = rows[tutorialComplete ? random.int(rows.length) : i]
    if (!row) continue
    const info = itemInfo(row.item)
    if (!info) continue
    let identifyCount = 0
    let appraised = false
    if (info.equipment) {
      if (type === 1) {
        identifyCount = weightedIndex([60, 40], random)
        appraised = identifyCount === 1
      } else
        identifyCount = 1 + weightedIndex(type === 2 ? [60, 20, 15, 5] : [700, 249, 50, 1], random)
      identifyCount = Math.min(identifyCount, info.maxIdentifyCount)
    }
    stock.push({
      slot: i,
      item: row.item,
      prices: pricesFromCosts(row.costs),
      identifyCount,
      appraised,
      bound: type !== 2,
    })
  }
  return stock
}

export function restockDue(
  last: Date | null,
  now: Date,
  seconds: number,
  trigger: 'open' | 'countdown',
): boolean {
  if (!last) return true
  const elapsed = now.getTime() - last.getTime()
  return trigger === 'open' ? elapsed > seconds * 1000 : elapsed >= seconds * 1000
}
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}
export function freeRestocksUsed(used: number, day: string | null, now: Date): number {
  return day === utcDay(now) ? used : 0
}

/** VIP discounts are excluded by milestone 3 decisions 10 and 14. */
export function pouchRefill(
  hp: number,
  mp: number,
  max: number,
  addHP: number,
  addMP: number,
): { hp: number; mp: number; cost: number } {
  const refill = (current: number, add: number) => {
    if (add !== -1 && (!Number.isSafeInteger(add) || add < 0))
      throw new RangeError('Invalid pouch refill')
    if (current >= max || add === 0) return { current, cost: 0 }
    return {
      current: add === -1 ? max : Math.min(max, current + add * 1000),
      cost: add === -1 ? Math.ceil((max - current) / 1000) : add,
    }
  }
  const h = refill(hp, addHP)
  const m = refill(mp, addMP)
  return { hp: h.current, mp: m.current, cost: h.cost + m.cost }
}

export function merchantPrice(
  base: number,
  soldTotal: number,
  maxCnt: number,
  vip = false,
): number {
  return vip ? base : Math.floor(base * (1 + (soldTotal / maxCnt) * 0.1))
}
export function merchantCanBuy(
  amount: number,
  purchased: number,
  limit: number,
  stock: number | null,
): boolean {
  return (
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    purchased + amount <= limit &&
    (stock === null || amount <= stock)
  )
}
/** Configured hours are interpreted in UTC, consistent with all daily economy boundaries. */
export function merchantSpawn(
  now: Date,
  times: Record<string, { hour: string; livetime: number; location: number }>,
  locations: Record<string, readonly { scene: number }[]>,
  random: Random,
): { scene: number; startsAt: Date; until: Date } | null {
  for (const time of Object.values(times)) {
    const [hour, minute] = time.hour.split(':').map(Number)
    const startsAt = new Date(now)
    startsAt.setUTCHours(hour!, minute!, 0, 0)
    const until = new Date(startsAt.getTime() + time.livetime * 60_000)
    const choices = locations[String(time.location)]
    if (now >= startsAt && now < until && choices?.length)
      return { scene: choices[random.int(choices.length)]!.scene, startsAt, until }
  }
  return null
}
