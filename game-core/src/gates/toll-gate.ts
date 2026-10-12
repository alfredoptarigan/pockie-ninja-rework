// Solo toll gate runs (J/CloneSceneModule/TollGateSystem.java): entry checks, strictly ordered
// fight points, the restore after a win, and sub-gate and gate rewards. Teams, the captain bonus
// and the weekly ranking are M4.
import { refuse } from './errors.js'

type Money = number | string

export interface TollGateRow {
  RequirMinLevel: number
  RequirMaxLevel: number
  /** Item consumed on entry, 0 = none. */
  RequireItemConfig: number | string
  RewardExp: number
  RewardMoney: Money
  TollGateName: string
}
export interface SubGateRow {
  ParentTollGateID: number
  Seq: number
  RewardExp: number
  RewardMoney: Money
}
export interface PointRow {
  ParentSubTollGateID: number
  Seq: number
}
export interface GroupRow {
  MonsterConfig1: string
  MonsterConfig2: string
  MonsterConfig3: string
}
export interface TollGateTables {
  gates: Record<string, TollGateRow>
  subs: Record<string, SubGateRow>
  points: Record<string, PointRow>
  groups: Record<string, GroupRow>
}

export interface GatePoint {
  subGateId: number
  groupId: number
  npcIds: string[]
}

/** Sub gates (by Seq), each with its points (by Seq) and their 3 group NPCs in fight order. */
export function gateLayout(gateId: number, tables: TollGateTables): GatePoint[][] {
  const bySeq = <T extends { Seq: number }>(rows: [string, T][]) =>
    rows.sort(([, a], [, b]) => a.Seq - b.Seq)
  return bySeq(Object.entries(tables.subs).filter(([, s]) => s.ParentTollGateID === gateId)).map(
    ([subId]) =>
      bySeq(
        Object.entries(tables.points).filter(([, p]) => p.ParentSubTollGateID === Number(subId)),
      ).map(([pointId]) => {
        const group = tables.groups[pointId]
        return {
          subGateId: Number(subId),
          groupId: Number(pointId),
          npcIds: group ? [group.MonsterConfig1, group.MonsterConfig2, group.MonsterConfig3] : [],
        }
      }),
  )
}

/** RewardMoney is `type,value`; type 0 is Stone (the only type in the data), 0 = nothing. */
export function rewardStone(money: Money) {
  const [type, value] = String(money).split(',')
  return value !== undefined && Number(type) === 0 ? Number(value) : 0
}

export interface Reward {
  exp: number
  stone: number
}
const rewardOf = (row: { RewardExp: number; RewardMoney: Money }): Reward => ({
  exp: Number(row.RewardExp) || 0,
  stone: rewardStone(row.RewardMoney),
})

export type EntryRefusal = 'no_tries' | 'too_low' | 'missing_item' | 'no_weapon' | 'low_hp'

/** CheckEntry order: daily tries, level, item, weapon, HP > 90%. */
export function entryRefusal(input: {
  level: number
  triesUsed: number
  maxTries: number
  minLevel: number
  hasItem: boolean
  hasWeapon: boolean
  hp: number
  maxHp: number
}): EntryRefusal | null {
  if (input.triesUsed >= input.maxTries) return 'no_tries'
  if (input.level < input.minLevel) return 'too_low'
  if (!input.hasItem) return 'missing_item'
  if (!input.hasWeapon) return 'no_weapon'
  if (input.hp <= 0 || input.maxHp <= 0 || input.hp / input.maxHp <= 0.9) return 'low_hp'
  return null
}

export interface RunState {
  gateId: number
  /** Sub gate and point (0-based) to fight next; past the last sub gate once cleared. */
  subGate: number
  point: number
  /** Last passed point as `subGate * 5 + point`, null before the first win. */
  passedPoint: number | null
  lost: boolean
}

export const startRun = (gateId: number): RunState => ({
  gateId,
  subGate: 0,
  point: 0,
  passedPoint: null,
  lost: false,
})

export const isCleared = (run: RunState, layout: GatePoint[][]) => run.subGate >= layout.length

/** The point the run fights next; refuses a lost or cleared run (OnCustomFightPoint 542-556). */
export function currentPoint(run: RunState, layout: GatePoint[][]): GatePoint {
  if (run.lost) refuse('run_lost', 'This run was lost. Leave the toll gate.')
  if (isCleared(run, layout)) refuse('run_cleared', 'This toll gate is already cleared.')
  return layout[run.subGate]![run.point]!
}

/** A won point: advance, pay the sub gate after its last point and the gate after the last one. */
export function winPoint(run: RunState, layout: GatePoint[][], tables: TollGateTables) {
  const point = currentPoint(run, layout)
  const passedPoint = run.subGate * 5 + run.point
  const subDone = run.point + 1 >= layout[run.subGate]!.length
  const next: RunState = subDone
    ? { ...run, subGate: run.subGate + 1, point: 0, passedPoint }
    : { ...run, point: run.point + 1, passedPoint }
  const cleared = isCleared(next, layout)
  return {
    run: next,
    subGateReward: subDone ? rewardOf(tables.subs[String(point.subGateId)]!) : null,
    gateReward: cleared ? rewardOf(tables.gates[String(run.gateId)]!) : null,
    cleared,
  }
}

export const loseRun = (run: RunState): RunState => ({ ...run, lost: true })

/** RestoreHP / RestoreMP percent of the maximum after a won point, capped. */
export function restoreAfterWin(
  state: { hp: number; mp: number; maxHp: number; maxMp: number },
  config: { RestoreHP: number; RestoreMP: number },
) {
  return {
    hp: Math.min(state.maxHp, state.hp + Math.trunc((state.maxHp * config.RestoreHP) / 100)),
    mp: Math.min(state.maxMp, state.mp + Math.trunc((state.maxMp * config.RestoreMP) / 100)),
  }
}
