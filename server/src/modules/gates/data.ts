// Read-only toll gate, Las Noches and pub fight tables (server/data/game, task 1's import).
// Loaded on first use and cached; server/src/game/data.ts belongs to another task.
import type {
  CardConfig,
  CardLibRow,
  FloorRow,
  RewardRule,
  SingleGateConfig,
  TollGateRow,
  TollGateTables,
} from '@pockie/game-core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dataDir = fileURLToPath(new URL('../../../data/game/', import.meta.url))
const cache = new Map<string, unknown>()
function load<T>(name: string): T {
  if (!cache.has(name)) {
    cache.set(name, JSON.parse(readFileSync(`${dataDir}${name}.json`, 'utf8')))
  }
  return cache.get(name) as T
}

/** RequirTeam: 0 solo only (100000), 2 solo or team. */
type GateRow = TollGateRow & { Hard: number | string; BossName: string; RequirTeam: number }

export const tollGateTables = (): TollGateTables & { gates: Record<string, GateRow> } => ({
  gates: load('toll-gates'),
  subs: load('toll-gate-subs'),
  points: load('toll-gate-points'),
  groups: load('toll-gate-groups'),
})

export const tollGateConfig = () =>
  load<{
    props: { RestoreHP: number; RestoreMP: number; EntryTollGateMaxTimes: number }
    cards: { ShowAllCap: number; ExchangeCap: number }
    /** CaptianMul.ini by team size: the captain's bonus % on sub gate and gate rewards. */
    captainMul: Record<string, { ExpMul: number; MoneyMul: number }>
  }>('toll-gate-config')

const cards = () =>
  load<{ gates: Record<string, CardConfig>; libs: Record<string, CardLibRow[]> }>('toll-gate-cards')
export const cardConfig = (gateId: number) => cards().gates[String(gateId)]
export const cardLib = (gateId: number) => cards().libs[String(cardConfig(gateId)?.DropId)] ?? []

export interface ExchangeRow {
  SrcItemCfg: string
  SrcCount: number
  CommonSrcItemCfg: string | number
  DestItemCfg: string
  DestCount: number
}
export const gateExchanges = () => load<Record<string, ExchangeRow>>('toll-gate-exchanges')

export const singleGateData = () =>
  load<{ config: SingleGateConfig; floors: Record<string, FloorRow> }>('single-gate')

export const pubData = () =>
  load<{
    config: { PubFightMaxTimes: number; PullRockerCd: number }
    scenes: Record<string, { MonsterLibID: number }>
    libs: Record<string, { MonsterConfig: string }[]>
    rewardRules: Record<string, RewardRule>
    drops: Record<string, { DropLibID: number }>
  }>('pub-fights')

/** The NPC library of a pub fight scene, or undefined outside 26xx-28xx. */
export function pubPool(sceneId: number) {
  const scene = pubData().scenes[String(sceneId)]
  return scene && (pubData().libs[String(scene.MonsterLibID)] ?? []).map((row) => row.MonsterConfig)
}
