// FightSystem.Attack beyond hit / crit / parry / defence: DecDamage, rebound (ReboundAttach),
// absorption (AbsorptionDamage), vampiric HP / MP and self damage (docs/original-data/battle.md).
import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type FightEvent, type SkillInput } from './fight.js'
import { makeFighter } from './testing.js'

/** No trigger skills, so no parry rolls: every action is one plain strike. */
const fighter = (overrides: Partial<FighterInput> = {}): FighterInput => ({
  ...makeFighter(),
  hp: 1000,
  maxHp: 1000,
  minAttack: 0,
  maxAttack: 0,
  skills: [],
  ...overrides,
})

/** A (index 0, attack 100) strikes B (index 1, attack 0, 100 HP) first; returns that strike. */
function firstStrike(attacker: Partial<FighterInput>, defender: Partial<FighterInput>) {
  const replay = simulateFight({
    attackers: [fighter({ minAttack: 100, maxAttack: 100, atkTime: 900, ...attacker })],
    defenders: [fighter({ hp: 100, ...defender })],
    seed: 1,
  })
  const strike = replay.events.find((e) => e.event === 14 && e.actor === 0) as FightEvent
  return { strike, replay }
}

describe('Damage.DamageDec (DecDamage)', () => {
  it('cuts the damage by DecDamage percent, capped at 100', () => {
    // 100 * (1 - 25 / 100) = 75
    expect(firstStrike({}, { decDamage: 25 }).strike.damage).toBe(75)
    expect(firstStrike({}, { decDamage: 150 }).strike.damage).toBe(0)
  })

  it('raises the damage for a negative DecDamage (freeze)', () => {
    // 100 * (1 + 50 / 100) = 150
    expect(firstStrike({}, { decDamage: -50 }).strike.damage).toBe(150)
  })
})

describe('Damage.BackDamage (rebound)', () => {
  it('reflects ReboundAttach percent of the pre-mitigation damage to the attacker', () => {
    // back = (int)((float)(100 * 60) * 0.01f) = 60
    const { strike, replay } = firstStrike({}, { rebound: 60 })
    expect(strike).toMatchObject({ damage: 100, backDamage: 60, selfDamage: 60 })
    expect(replay.fighters[0]!.hp).toBe(940)
  })

  it("mitigates the rebound with the attacker's DecDamage and defence", () => {
    // 60 * (1 - 154 / 1508) = 53.87 -> 53
    const { strike } = firstStrike({ defense: 154 }, { rebound: 60 })
    expect(strike).toMatchObject({ backDamage: 53, selfDamage: 53 })
    // 60 * (1 - 50 / 100) = 30
    expect(firstStrike({ decDamage: 50 }, { rebound: 60 }).strike.backDamage).toBe(30)
  })

  it('reflects nothing from a miss', () => {
    const { strike, replay } = firstStrike({}, { rebound: 60, dodge: 1_000_000 })
    expect(strike).toMatchObject({ hit: false })
    expect(strike.backDamage).toBeUndefined()
    expect(replay.fighters[0]!.hp).toBe(1000)
  })
})

describe('Damage.DamageAddHP (absorption)', () => {
  it('turns AbsorptionDamage percent of the raw damage back into HP of the target', () => {
    // absorb = (int)((float)(100 * 30) / 100f) = 30; TargetLastDamage = 100 - 30
    expect(firstStrike({}, { absorb: 30 }).strike.damage).toBe(70)
  })

  it('heals the target when it absorbs more than it takes', () => {
    // 100 - 200 = -100: the target gains 100 HP
    expect(firstStrike({}, { absorb: 200 }).strike.damage).toBe(-100)
  })
})

describe('Damage.UserVampiricHP / UserVampiricMP (life steal)', () => {
  it('heals the attacker VampiricHP percent of the damage dealt and restores MP', () => {
    // 50 * 0.01f * 100 = 50 HP; 20 * 0.01f rounds to 0.19999999f in Java floats, * 100 -> 19 MP
    const { strike, replay } = firstStrike(
      { hp: 500, mp: 10, maxMp: 100, vampiricHp: 50, vampiricMp: 20 },
      {},
    )
    expect(strike).toMatchObject({ damage: 100, incHp: 50, incMp: 19 })
    expect(strike.selfDamage).toBeUndefined()
    expect(replay.fighters[0]).toMatchObject({ hp: 550, mp: 29 })
  })

  it('never heals above MaxHP, but MP is not capped (original bug)', () => {
    const { replay } = firstStrike({ mp: 95, maxMp: 100, vampiricHp: 50, vampiricMp: 20 }, {})
    expect(replay.fighters[0]).toMatchObject({ hp: 1000, mp: 114 })
  })
})

describe('self damage (skill selfmul / selfadd)', () => {
  const recoil: SkillInput = { id: 77, type: 1, effect: 1, probability: 100, mul: 1, selfmul: 0.1 }

  it('costs the attacker damage * selfmul + selfadd', () => {
    // (int)(100 * 0.1f + 0) = 10
    const { strike, replay } = firstStrike({ skills: [recoil] }, {})
    expect(strike).toMatchObject({ skillId: 77, damage: 100, selfDamage: 10 })
    expect(replay.fighters[0]!.hp).toBe(990)
  })
})
