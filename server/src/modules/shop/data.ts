import { readFileSync } from 'node:fs'
import type { IdentifyGroups, IdentifyList, IdentifyProps } from '@pockie/game-core'
const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../data/game/${name}.json`, import.meta.url), 'utf8')) as T
export interface Offer {
  item: string
  costs: { amount: number; type: number }[]
}
interface Band {
  MinLevel: number
  MaxLevel: number
  BelongNPC: string
  BoxName: string
}
interface Pool {
  MinLevel: number
  MaxLevel: number
  Type: number
  RandCount: number
  RefreshTime: number
  GratisCount: number
  ImidRequireMoney: string
}
export const wholesale = load<{ boxes: Record<string, Band>; items: Record<string, Offer[]> }>(
  'npc-shops',
)
export const refresh = load<{ pools: Record<string, Pool>; items: Record<string, Offer[]> }>(
  'refresh-shops',
)
export const sellAsk = load<{ ID: string; Type: number }[]>('sell-ask-items')
export const identifyLists = load<Record<string, IdentifyList>>('identify-lists')
export const identifyTables = {
  groups: load<IdentifyGroups>('identify-groups'),
  props: load<IdentifyProps>('identify-props'),
}
export interface MysticOffer {
  item: string
  price: number
  bind: number
  useLevel: number
  maxCnt: number
}
export const mystic = load<{
  times: Record<string, { hour: string; livetime: number; location: number }>
  locations: Record<string, { scene: number }[]>
  items: Record<string, MysticOffer[]>
  buyLimits: Record<string, number>
}>('mystic-shop')
