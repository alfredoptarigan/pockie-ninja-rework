import { describe, expect, it } from 'vitest'
import { damageTotals } from './FightSummary'
import type { Replay } from './types'

const fighter = (index: number, side: 'attackers' | 'defenders') => ({
  index,
  side,
  name: `F${index}`,
  level: 1,
  maxHp: 100,
  startHp: 100,
  hp: 50,
})

describe('damageTotals', () => {
  it('adds up strikes and buff ticks per side', () => {
    const replay: Replay = {
      seed: 1,
      winner: 'attackers',
      fighters: [fighter(0, 'attackers'), fighter(1, 'defenders')],
      events: [
        { actor: 0, event: 14, target: 1, damage: 30, hit: true },
        { actor: 1, event: 14, target: 0, damage: 12, hit: true },
        { actor: 1, event: 9, selfDamage: 3 },
        { actor: 0, event: 7, target: 1, hit: false },
      ],
    }
    expect(damageTotals(replay)).toEqual({ dealt: 33, taken: 12 })
  })

  it('does not count heals (negative damage) as damage', () => {
    const replay: Replay = {
      seed: 1,
      winner: 'attackers',
      fighters: [fighter(0, 'attackers'), fighter(1, 'defenders')],
      events: [
        { actor: 0, event: 14, target: 1, damage: -5, hit: true },
        { actor: 1, event: 14, target: 0, damage: 10, hit: true },
      ],
    }
    expect(damageTotals(replay)).toEqual({ dealt: 0, taken: 10 })
  })
})
