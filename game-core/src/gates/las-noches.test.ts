import { describe, expect, it } from 'vitest'
import {
  buyLife,
  lifePrice,
  loseFloor,
  startOptions,
  startLasNoches,
  winFloor,
  type LasNochesRun,
} from './las-noches.js'

const config = {
  MaxEntryCnt: 3,
  BuyReliveCnt: 999,
  BuyReliveMoney: 6,
  BuyReliveAddMoney: 2,
  EntryParam0: 0.5,
  NewMaxGate: 170,
}
const floors: Record<string, { exp: number; npc: string }> = {}
for (let i = 0; i < 170; i++) floors[String(i)] = { exp: 100 + i, npc: `n${900001 + i}` }

describe('startOptions (SingleGateSystem.OnCustomEntry)', () => {
  it('offers floor 1 for 1000 Stone and no 50% start without a best floor', () => {
    expect(startOptions(0, config)).toEqual({ first: { floor: 1, stone: 1000 }, half: null })
  })
  it('offers 50% of the best floor for (int)(27.03*(floor-1)+1000) Stone', () => {
    expect(startOptions(101, config).half).toEqual({ floor: 50, stone: 2324 })
  })
})

describe('a Las Noches run', () => {
  const run = startLasNoches('first', 0, config)

  it('starts with one free life and an empty pot', () => {
    expect(run).toEqual({ floor: 1, pot: 0, lives: 1, livesBought: 0 })
    expect(() => startLasNoches('half', 1, config)).toThrow()
  })

  it('a won floor adds its EXP to the pot, moves up and raises the best floor', () => {
    const outcome = winFloor(run, 0, floors, config)
    expect(outcome).toEqual({ run: { ...run, floor: 2, pot: 100 }, best: 1, ended: false })
    expect(winFloor({ ...run, floor: 5 }, 9, floors, config).best).toBe(9)
  })

  it('the last floor ends the run', () => {
    const outcome = winFloor({ ...run, floor: 170, pot: 10 }, 169, floors, config)
    expect(outcome.ended).toBe(true)
    expect(outcome.run.pot).toBe(10 + 269)
    expect(outcome.best).toBe(170)
  })

  it('a loss uses a life and keeps the pot', () => {
    expect(loseFloor({ ...run, pot: 501 })).toEqual({
      run: { ...run, pot: 501, lives: 0 },
      ended: false,
    })
  })

  it('a loss without lives halves the pot and ends the run', () => {
    expect(loseFloor({ ...run, pot: 501, lives: 0 })).toEqual({
      run: { ...run, pot: 250, lives: 0 },
      ended: true,
    })
  })

  it('extra lives cost 6 + 2n Gold, at most 999', () => {
    expect([0, 1, 2].map((n) => lifePrice(n, config))).toEqual([6, 8, 10])
    const bought: LasNochesRun = buyLife({ ...run, lives: 0 }, config)
    expect(bought).toMatchObject({ lives: 1, livesBought: 1 })
    expect(() => buyLife({ ...run, livesBought: 999 }, config)).toThrow()
  })
})
