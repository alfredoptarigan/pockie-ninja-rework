// Explore spot rules ported from RoleModule/OutSearchSystem.java (see docs/original-data/world.md).
import type { Random } from '@pockie/game-core'
import {
  exploreFactory,
  item,
  exploreMonsters,
  type ExploreFactory,
  type ExploreFactoryEntry,
} from './data.js'
import { explorePetItem } from './pets.js'

type SpotRow = Record<string, number | string | (number | string)[]>

export const CARDS_PER_SEARCH = 5
const MAX_STAR = 5
const BASE_DAILY_SEARCHES = 7
const LEVELS_PER_EXTRA_SEARCH = 10

export type ExploreCard =
  | { type: 'fight'; monsterId: string }
  | { type: 'stone'; amount: number }
  | { type: ExploreFactory | 'pet'; itemId: string; bound: boolean }
  | { type: 'game' }
  | { type: 'nothing' }

export interface StarState {
  level: number
  progress: number
}

/** OnPlayerLoadAfter: searches per day, all spots together. */
export const dailyExploreTotal = (level: number) =>
  BASE_DAILY_SEARCHES + Math.floor(level / LEVELS_PER_EXTRA_SEARCH)

/** LogicTool.RandRange: index picked with the given weights, or -1 when all are 0. */
export function weightedIndex(weights: number[], random: Random) {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return -1
  let roll = random.int(total)
  return weights.findIndex((weight) => (roll -= weight) < 0)
}

/**
 * CostOutSearch: a spot's star level rises every `StarUp` searches up to 5. The first search
 * creates the record (star 0, progress 1); at star 5 progress is parked at -1.
 */
export function advanceStar(state: StarState | undefined, starUp: number): StarState {
  if (!state) return { level: 0, progress: 1 }
  if (state.level === MAX_STAR) return { level: MAX_STAR, progress: -1 }
  const progress = state.progress + 1
  return progress === starUp ? { level: state.level + 1, progress: 0 } : { ...state, progress }
}

/**
 * OnOutSearch: when the star level just rose, a bonus is rolled: the spot's pet egg or EXP
 * (`ExpBase + ExpBase * star / 10`), weighted by `BabyRateStarLvN` / `ExpRateStarLvN`.
 */
export function rollStarBonus(spot: SpotRow, star: StarState, random: Random) {
  if (star.progress !== 0 || star.level < 1) return null
  const weights = [
    Number(spot[`BabyRateStarLv${star.level}`]),
    Number(spot[`ExpRateStarLv${star.level}`]),
  ]
  const pick = weightedIndex(weights, random)
  // M6 decision 9: the 2011 pet egg becomes its linked Reborn pet item.
  if (pick === 0)
    return {
      type: 'pet' as const,
      itemId: explorePetItem(String(spot.PetBonusAppend)),
      bound: true,
    }
  if (pick === 1) {
    const base = Number(spot.ExpBase)
    return { type: 'exp' as const, exp: base + Math.floor((base * star.level) / 10) }
  }
  return null
}

/** SearchItem/SearchBoss/...: entry i covers [min, min + Odds] of a roll in [0, sum(Odds + 1)). */
function pickFactoryEntry(entries: ExploreFactoryEntry[], random: Random) {
  const total = entries.reduce((sum, entry) => sum + entry.Odds + 1, 0)
  let roll = random.int(total)
  return entries.find((entry) => (roll -= entry.Odds + 1) < 0)
}

function factoryCard(kind: ExploreFactory | 'pet', factoryId: number, random: Random) {
  const entry = pickFactoryEntry(exploreFactory(kind === 'pet' ? 'baby' : kind, factoryId), random)
  if (!entry || /^i15900[0-3]$/.test(entry.Config)) return { type: 'nothing' as const }
  return { type: kind, itemId: entry.Config, bound: entry.BindingStatus === 1 }
}

/** LookSearchBonus: one card's outcome, picked with the spot's seven outcome weights. */
export function rollCard(spot: SpotRow, random: Random): ExploreCard {
  const n = (key: string) => Number(spot[key] ?? 0)
  const outcome = weightedIndex(
    [
      n('GostRate'),
      n('MoneyRate'),
      n('BabyFactoryRate'),
      n('BossFactoryRate'),
      n('ItemFactoryRate'),
      n('GameFactoryRate'),
      n('KeyFactoryRate'),
    ],
    random,
  )
  switch (outcome) {
    case 0: {
      const monsters = exploreMonsters(n('GostFactoryID'))
      if (monsters.length === 0) return { type: 'nothing' }
      return { type: 'fight', monsterId: monsters[random.int(monsters.length)]! }
    }
    case 1:
      return { type: 'stone', amount: n('MoneyRule') }
    case 2:
      return factoryCard('pet', n('BabyFactoryID'), random)
    case 3:
      return factoryCard('boss', n('BossFactoryID'), random)
    case 4:
      return factoryCard('item', n('ItemFactoryID'), random)
    case 5:
      return { type: 'game' }
    case 6:
      return factoryCard('key', n('KeyFactoryID'), random)
    default:
      return { type: 'nothing' }
  }
}

/** `RequireItem`: `cfg,count;...` or -1. */
export function requiredItems(spot: SpotRow) {
  const value = String(spot.RequireItem ?? -1)
  if (value === '-1') return []
  return value.split(';').flatMap((part) => {
    const [itemId = '', count = ''] = part.split(',')
    return itemId && Number(count) > 0 ? [{ itemId, count: Number(count) }] : []
  })
}

/** OnCustomLook: first peek uses Stone; second may use coupons; later peeks require Gold. */
export function peekCost(spot: SpotRow, count: number, currency: 'gold' | 'giftCoupon') {
  if (count >= Number(spot.CanLookCount) || count < 0) return null
  if (count === 0) return { currency: 'stone' as const, amount: Number(spot.FirstMoney ?? 1000) }
  if (count > 1 && currency !== 'gold') return null
  const key = ['FirstMoney', 'SecondMoney', 'ThirdMoney', 'FourthMoney', 'FifthMoney'][
    Math.min(count, 4)
  ]!
  return { currency, amount: Number(spot[key] ?? (count === 1 ? 2 : 100)) }
}

/** OutSearchItem.js / item.ini: consuming one mapped key starts senior search. */
export function seniorKey(spotId: string) {
  const ids = [
    ...Array.from({ length: 24 }, (_, i) => `i${150046 + i}`),
    ...Array.from({ length: 4 }, (_, i) => `i${155070 + i}`),
  ]
  const itemId = ids.find((id) => Number(item(id)?.GetItemsId) === Number(spotId))
  return itemId ? { itemId, level: Number(item(itemId)?.UseLevel ?? 1) } : null
}

export const SENIOR_FORBIDDEN_SCENES = [3101, 3102, 111, 121, 131, 141, 151, 161, 171]

/**
 * OnCustomGetBonus type 3 (pet): RandInt(1,100) <= 50. Other item cards always grant.
 * `chanceMul` is the VIP drop factor (vipDropMul).
 */
export const cardGranted = (card: ExploreCard, random: Random, chanceMul = 1) =>
  card.type !== 'pet' || random.int(100) < 50 * chanceMul
