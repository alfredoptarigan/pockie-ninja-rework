import { describe, expect, it } from 'vitest'
import {
  entryRefusal,
  gateLayout,
  loseRun,
  restoreAfterWin,
  rewardStone,
  startRun,
  winPoint,
  type TollGateTables,
} from './toll-gate.js'

// Gate 1 with two sub gates of five points each, as in TollGate.ini 100001.
const points: TollGateTables['points'] = {}
const groups: TollGateTables['groups'] = {}
for (const sub of [11, 12]) {
  for (let seq = 0; seq < 5; seq++) {
    const id = `${sub}${seq}`
    points[id] = { ParentSubTollGateID: sub, Seq: seq }
    groups[id] = { MonsterConfig1: `n${id}a`, MonsterConfig2: `n${id}b`, MonsterConfig3: `n${id}c` }
  }
}
const tables: TollGateTables = {
  gates: {
    '1': {
      RequirMinLevel: 16,
      RequirMaxLevel: 25,
      RequireItemConfig: 0,
      RewardExp: 500,
      RewardMoney: '0,2800',
      TollGateName: 'TollGate_1',
    },
  },
  // Listed out of order on purpose: Seq decides.
  subs: {
    '12': { ParentTollGateID: 1, Seq: 1, RewardExp: 300, RewardMoney: '0,1700' },
    '11': { ParentTollGateID: 1, Seq: 0, RewardExp: 200, RewardMoney: '0,1100' },
  },
  points,
  groups,
}
const layout = gateLayout(1, tables)

describe('gateLayout', () => {
  it('orders sub gates and points by Seq with their three NPCs', () => {
    expect(layout).toHaveLength(2)
    expect(layout[0]!.map((p) => p.groupId)).toEqual([110, 111, 112, 113, 114])
    expect(layout[1]![4]!.npcIds).toEqual(['n124a', 'n124b', 'n124c'])
  })
})

describe('rewardStone', () => {
  it('reads "type,value" money as Stone for type 0 and plain 0 as nothing', () => {
    expect(rewardStone('0,2800')).toBe(2800)
    expect(rewardStone(0)).toBe(0)
    expect(rewardStone('2,10')).toBe(0)
  })
})

describe('entryRefusal (TollGateSystem.CheckEntry)', () => {
  const ok = {
    level: 20,
    triesUsed: 0,
    maxTries: 3,
    minLevel: 16,
    hasItem: true,
    hasWeapon: true,
    hp: 91,
    maxHp: 100,
  }
  it('lets a ready ninja in', () => expect(entryRefusal(ok)).toBeNull())
  it('refuses after three tries today', () =>
    expect(entryRefusal({ ...ok, triesUsed: 3 })).toBe('no_tries'))
  it('refuses below the gate level', () =>
    expect(entryRefusal({ ...ok, level: 15 })).toBe('too_low'))
  it('refuses without the entry item', () =>
    expect(entryRefusal({ ...ok, hasItem: false })).toBe('missing_item'))
  it('refuses without a weapon', () =>
    expect(entryRefusal({ ...ok, hasWeapon: false })).toBe('no_weapon'))
  it('needs more than 90% HP', () => {
    expect(entryRefusal({ ...ok, hp: 90 })).toBe('low_hp')
    expect(entryRefusal({ ...ok, hp: 0, maxHp: 0 })).toBe('low_hp')
  })
})

describe('run state', () => {
  it('starts at the first point of the first sub gate', () => {
    expect(startRun(1)).toEqual({ gateId: 1, subGate: 0, point: 0, passedPoint: null, lost: false })
  })

  it('advances point by point without rewards inside a sub gate', () => {
    const outcome = winPoint(startRun(1), layout, tables)
    expect(outcome.run).toMatchObject({ subGate: 0, point: 1, passedPoint: 0 })
    expect(outcome.subGateReward).toBeNull()
    expect(outcome.cleared).toBe(false)
  })

  it('pays the sub gate after its fifth point and moves to the next sub gate', () => {
    const outcome = winPoint({ ...startRun(1), point: 4, passedPoint: 3 }, layout, tables)
    expect(outcome.run).toMatchObject({ subGate: 1, point: 0, passedPoint: 4 })
    expect(outcome.subGateReward).toEqual({ exp: 200, stone: 1100 })
    expect(outcome.gateReward).toBeNull()
  })

  it('pays the last sub gate and the gate on the final point and clears the run', () => {
    const outcome = winPoint({ ...startRun(1), subGate: 1, point: 4 }, layout, tables)
    expect(outcome.subGateReward).toEqual({ exp: 300, stone: 1700 })
    expect(outcome.gateReward).toEqual({ exp: 500, stone: 2800 })
    expect(outcome.cleared).toBe(true)
    expect(outcome.run.passedPoint).toBe(9)
  })

  it('refuses to fight on after a loss or a clear', () => {
    expect(() => winPoint(loseRun(startRun(1)), layout, tables)).toThrow('lost')
    const cleared = winPoint({ ...startRun(1), subGate: 1, point: 4 }, layout, tables).run
    expect(() => winPoint(cleared, layout, tables)).toThrow('cleared')
  })
})

describe('restoreAfterWin', () => {
  it('restores 20% HP and 40% MP, capped at the maximum', () => {
    const config = { RestoreHP: 20, RestoreMP: 40 }
    expect(restoreAfterWin({ hp: 10, mp: 0, maxHp: 1000, maxMp: 100 }, config)).toEqual({
      hp: 210,
      mp: 40,
    })
    expect(restoreAfterWin({ hp: 950, mp: 90, maxHp: 1000, maxMp: 100 }, config)).toEqual({
      hp: 1000,
      mp: 100,
    })
  })
})
