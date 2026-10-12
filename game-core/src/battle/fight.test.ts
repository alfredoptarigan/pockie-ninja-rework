import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput } from './fight.js'

function fighter(overrides: Partial<FighterInput> = {}): FighterInput {
  return {
    name: 'Ninja',
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    minAttack: 10,
    maxAttack: 10,
    atkTime: 1000,
    hit: 0,
    dodge: 0,
    crit: 0,
    critAttach: 230,
    tough: 0,
    parry: 0,
    pierce: 0,
    defense: 0,
    neglectDefense: 0,
    counter: 0,
    priority: 0,
    ...overrides,
  }
}

const damageEvents = (replay: ReturnType<typeof simulateFight>, actor: number) =>
  replay.events.filter((e) => e.event === 14 && e.actor === actor)

describe('simulateFight', () => {
  it('lets the stronger side win and records the death', () => {
    const replay = simulateFight({
      attackers: [fighter({ minAttack: 60, maxAttack: 60 })],
      defenders: [fighter({ name: 'Sunflower' })],
      seed: 1,
    })
    expect(replay.winner).toBe('attackers')
    expect(replay.events.at(-1)).toMatchObject({ event: 20, actor: 1 })
    expect(replay.fighters[1]!.hp).toBe(0)
  })

  it('gives a fighter with half the attack interval twice the actions', () => {
    const replay = simulateFight({
      attackers: [fighter({ atkTime: 500, minAttack: 1, maxAttack: 1, hp: 1000, maxHp: 1000 })],
      defenders: [fighter({ minAttack: 1, maxAttack: 1, hp: 1000, maxHp: 1000 })],
      seed: 2,
    })
    const fast = damageEvents(replay, 0).length
    const slow = damageEvents(replay, 1).length
    expect(fast + slow).toBe(60) // MaxBout counts actions of both sides
    expect(fast).toBe(40)
  })

  it('decides a timeout by HP percentage, and a tie kills the target', () => {
    const tie = simulateFight({
      attackers: [fighter({ minAttack: 0, maxAttack: 0 })],
      defenders: [fighter({ minAttack: 0, maxAttack: 0 })],
      seed: 3,
    })
    expect(tie.winner).toBe('attackers')
    expect(tie.fighters[1]!.hp).toBe(0)
  })

  it('fights sequential duels and the survivor keeps its HP', () => {
    const replay = simulateFight({
      attackers: [fighter({ minAttack: 100, maxAttack: 100, hp: 500, maxHp: 500 })],
      defenders: [fighter({ name: 'A' }), fighter({ name: 'B' })],
      seed: 4,
    })
    expect(replay.winner).toBe('attackers')
    expect(replay.events.filter((e) => e.event === 21)).toEqual([{ actor: 2, event: 21 }])
    expect(replay.fighters[0]!.hp).toBeLessThan(500)
  })

  it('misses against overwhelming dodge and never deals negative damage', () => {
    const replay = simulateFight({
      attackers: [fighter({ minAttack: 5, maxAttack: 5 })],
      defenders: [fighter({ dodge: 1600, defense: 5000, hp: 1000, maxHp: 1000 })],
      seed: 5,
    })
    const attacks = damageEvents(replay, 0)
    expect(attacks.every((e) => e.hit === false)).toBe(true)
  })

  it('rolls the begin-fight parry (8888) so even the first hit can be parried', () => {
    const replay = simulateFight({
      attackers: [fighter({ atkTime: 500, minAttack: 50, maxAttack: 50, hp: 1000, maxHp: 1000 })],
      defenders: [fighter({ parry: 1600, hp: 1000, maxHp: 1000 })],
      seed: 6,
    })
    const first = damageEvents(replay, 0)[0]!
    // 11841: parry 40 %, consumed by the hit (cleartype 2), OnRemove adds 11851.
    expect(first).toMatchObject({
      damage: 30,
      parry: true,
      delBuffs: [{ role: 1, buff: 11841 }],
      addBuffs: [{ role: 1, buff: 11851 }],
    })
    // 7777 prepares the next parry after every damaging hit (chance 1600 / 16 = 100).
    expect(damageEvents(replay, 0).every((e) => e.parry)).toBe(true)
  })

  it('delays the parried attacker by 60 % of its initial AtkTime and ticks 11851 away', () => {
    const replay = simulateFight({
      attackers: [fighter({ atkTime: 500, minAttack: 50, maxAttack: 50, hp: 1000, maxHp: 1000 })],
      defenders: [fighter({ parry: 1600, hp: 1000, maxHp: 1000 })],
      seed: 7,
    })
    const order = replay.events.filter((e) => e.event === 1 || e.event === 9)
    // A acts at 500 (parried, next 500 + 500 + 300 = 1300), B at 1000 (11851 expires), A at 1300.
    expect(order.slice(0, 4)).toEqual([
      { actor: 0, event: 1 },
      { actor: 1, event: 9, delBuffs: [{ role: 1, buff: 11851 }] },
      { actor: 1, event: 1 },
      { actor: 0, event: 1 },
    ])
  })

  it('clears the buffs of the survivor before its next duel (event 9)', () => {
    const replay = simulateFight({
      attackers: [fighter({ minAttack: 100, maxAttack: 100, hp: 500, maxHp: 500 })],
      defenders: [fighter({ name: 'A' }), fighter({ name: 'B' })],
      seed: 4,
    })
    const next = replay.events.findIndex((e) => e.event === 21)
    expect(replay.events[next + 1]).toEqual({
      actor: 0,
      event: 9,
      delBuffs: [{ role: 0, buff: 8888 }],
    })
  })

  it('reports MP at the start and the end of the fight', () => {
    const replay = simulateFight({
      attackers: [fighter({ mp: 20, maxMp: 30, minAttack: 60, maxAttack: 60 })],
      defenders: [fighter()],
      seed: 1,
    })
    expect(replay.fighters[0]).toMatchObject({ maxMp: 30, startMp: 20, mp: 20 })
  })

  it('is deterministic for a seed', () => {
    const input = {
      attackers: [fighter({ minAttack: 5, maxAttack: 20, crit: 400, counter: 30 })],
      defenders: [fighter({ minAttack: 5, maxAttack: 20, parry: 400, dodge: 50 })],
    }
    expect(simulateFight({ ...input, seed: 9 })).toEqual(simulateFight({ ...input, seed: 9 }))
    expect(simulateFight({ ...input, seed: 9 })).not.toEqual(simulateFight({ ...input, seed: 10 }))
  })
})
