// Fight-engine hooks of the Reborn update: talents at the roll sites (decision 8) and the
// secret-technique threshold (decision 9).
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput } from '../battle/fight.js'
import { execute } from '../battle/scripts/execute.js'
import { fakeContext, fightOnly, makeFighter } from '../battle/testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type Replay } from '../battle/types.js'

function fighter(overrides: Partial<FighterInput> = {}): FighterInput {
  return {
    name: 'Ninja',
    level: 60,
    hp: 5000,
    maxHp: 5000,
    mp: 500,
    maxMp: 500,
    minAttack: 300,
    maxAttack: 400,
    atkTime: 1000,
    hit: 200,
    dodge: 600,
    crit: 900,
    critAttach: 230,
    tough: 300,
    parry: 700,
    pierce: 100,
    defense: 900,
    neglectDefense: 200,
    counter: 5,
    priority: 0,
    ...overrides,
  }
}

const GOLDEN = 'dc2f83058bbc7eaf1552bdede0fd4c96b9069a2f116a4e8230da984e2283a799'
// The panel is display data; the golden hash covers the fight itself.
const hash = (replays: Replay[]) =>
  createHash('sha256')
    .update(JSON.stringify(replays.map(fightOnly)))
    .digest('hex')

/** Both sides lead on some stats, so every talent would have something to narrow. */
const golden = (talents?: FighterInput['talents']) =>
  [1, 2, 3, 4, 5].map((seed) =>
    simulateFight({
      attackers: [
        fighter({ name: 'A', ...(talents && { talents }) }),
        fighter({ name: 'A2', crit: 200, tough: 900 }),
      ],
      defenders: [
        fighter({
          name: 'B',
          hit: 700,
          dodge: 150,
          parry: 100,
          pierce: 800,
          defense: 150,
          neglectDefense: 1000,
        }),
      ],
      seed,
    }),
  )

describe('fight engine without talents', () => {
  it('replays byte-identical to the engine before the Reborn update', () => {
    expect(hash(golden())).toBe(GOLDEN)
  })

  it('replays identically with talents at level 0', () => {
    const replays = golden({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 })
    expect(hash(replays)).toBe(GOLDEN)
  })
})

describe('fight engine with talents', () => {
  it('changes the fight when an active talent meets an enemy lead', () => {
    // B leads on neglectDefense (1000 > A's defense 900) and pierce (800 > A's parry 700).
    expect(hash(golden({ 3: 40 }))).not.toBe(GOLDEN)
    expect(hash(golden({ 1: 40 }))).not.toBe(GOLDEN)
  })

  it('keeps the fight when the talent has no enemy lead to narrow', () => {
    // B's dodge 150 does not beat A's hit 200, so Dodge (8) has nothing to do.
    expect(hash(golden({ 8: 40 }))).toBe(GOLDEN)
  })
})

describe('secret technique threshold (decision 9)', () => {
  const run = (secretThreshold: number | undefined) => {
    // Gap 0: probability 10, roll 5 passes; target at 18% HP.
    const { ctx } = fakeContext({ rolls: [5, 300] })
    const self = makeFighter({ avatarLevel: 0, ...(secretThreshold && { secretThreshold }) })
    const target = makeFighter({ index: 1, avatarLevel: 0, hp: 18, maxHp: 100 })
    return execute(ctx, self, target, { actor: 0, event: 14 }, 0)
  }

  it('executes at 18% HP with threshold 20', () => {
    expect(run(20)).toBe(SKILL_SUCCESS)
  })

  it('does not execute at 18% HP with the default 15', () => {
    expect(run(undefined)).toBe(SKILL_LOSE)
    expect(run(15)).toBe(SKILL_LOSE)
  })
})
