// Shields (FightSystem.ShieldDamage, type 3 buffs), CanMove / CanAttack / CanUseSkill and the fight
// buffs that set them (RES/skill/FightBuff.ini, RES/javascript/buff/*.js).
import { afterEach, describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type SkillInput } from './fight.js'
import { GENERIC_SKILLS, SKILL_SCRIPTS } from './skills.js'
import { makeFighter } from './testing.js'
import { SKILL_SUCCESS } from './types.js'

const TEST_SCRIPT = 'test/add_buff.js'

/** A fight-begin trigger that gives its owner `buff` (SaveData `saveData`), like a skill would. */
function selfBuff(buff: number, saveData = 0): SkillInput {
  SKILL_SCRIPTS[TEST_SCRIPT] = (ctx, self, _target, fv, timer) => {
    ctx.addBuff(self, buff, timer, fv, saveData)
    return SKILL_SUCCESS
  }
  return { id: 99, type: 2, quomodo: 1, probability: 100, javascript: TEST_SCRIPT }
}

afterEach(() => {
  delete SKILL_SCRIPTS[TEST_SCRIPT]
})

const fighter = (overrides: Partial<FighterInput> = {}): FighterInput => ({
  ...makeFighter(),
  hp: 1000,
  maxHp: 1000,
  minAttack: 0,
  maxAttack: 0,
  skills: [],
  ...overrides,
})

/** A (index 0, attack 100, AtkTime 900) against B (index 1) with a fight-begin buff. */
function fightBuffed(buff: number, saveData: number, defender: Partial<FighterInput> = {}) {
  return simulateFight({
    attackers: [fighter({ minAttack: 100, maxAttack: 100, atkTime: 900 })],
    defenders: [fighter({ skills: [selfBuff(buff, saveData)], ...defender })],
    seed: 1,
  })
}

const strikesBy = (replay: ReturnType<typeof simulateFight>, actor: number) =>
  replay.events.filter((e) => e.actor === actor && e.event === 14 && e.skillId !== undefined)

describe('11831 shield (buff_jingdianjiejie_11831.js, FightSystem.ShieldDamage)', () => {
  it('absorbs hits until SaveData is used up, then breaks', () => {
    const replay = fightBuffed(11831, 150)
    const [first, second, third] = strikesBy(replay, 0)
    expect(first).toMatchObject({ damage: 0, targetShield: 100 })
    // 100 >= 50 left: the shield takes 50 and is removed, 50 gets through.
    expect(second).toMatchObject({
      damage: 50,
      targetShield: 50,
      delBuffs: [{ role: 1, buff: 11831 }],
    })
    expect(third).toMatchObject({ damage: 100 })
    expect(third!.targetShield).toBeUndefined()
  })
})

describe('11813 stun (buff_xuanyun_11813.js)', () => {
  it('skips the actions of its owner (event 3) for SaveData timeline units', () => {
    const replay = fightBuffed(11813, 1500, { minAttack: 10, maxAttack: 10 })
    const own = replay.events.filter((e) => e.actor === 1 && [1, 3, 9].includes(e.event))
    // t=1000: still stunned (1000 <= 0 + 1500); t=2000: the buff expires first, then it acts.
    expect(own.slice(0, 3)).toEqual([
      { actor: 1, event: 3 },
      { actor: 1, event: 9, delBuffs: [{ role: 1, buff: 11813 }] },
      { actor: 1, event: 1 },
    ])
  })
})

describe('control flags on trigger skills (FightSystem.UserBeDamageSkill, ...)', () => {
  it('lets a stunned fighter trigger nothing, so it cannot prepare a parry', () => {
    const replay = simulateFight({
      attackers: [fighter({ minAttack: 100, maxAttack: 100, atkTime: 900 })],
      defenders: [fighter({ parry: 1600, skills: [selfBuff(11813, 1500), GENERIC_SKILLS[0]!] })],
      seed: 1,
    })
    // Hits at 900 and 1800 land on the stunned B; the hit at 2700 (B acted at 2000) arms 7777.
    expect(
      strikesBy(replay, 0)
        .map((e) => e.parry ?? false)
        .slice(0, 5),
    ).toEqual([false, false, false, true, true])
  })
})

describe('11826 daze (buff_11826.js): no attack, no skills, removed when damaged', () => {
  it('keeps its owner from striking until a damaging hit clears it', () => {
    const replay = fightBuffed(11826, 0, { atkTime: 500, minAttack: 10, maxAttack: 10 })
    // t=500: B's turn passes without a strike; t=900: A's hit removes the buff; t=1000: B strikes.
    const first = replay.events.slice(0, 6)
    expect(first).toEqual([
      { actor: 1, event: 14, target: 0, skillId: 99, addBuffs: [{ role: 1, buff: 11826 }] },
      { actor: 1, event: 1 },
      { actor: 1, event: 2 },
      { actor: 0, event: 1 },
      expect.objectContaining({ actor: 0, event: 14, delBuffs: [{ role: 1, buff: 11826 }] }),
      { actor: 0, event: 2 },
    ])
    expect(replay.events[6]).toEqual({ actor: 1, event: 1 })
    expect(replay.events[7]).toMatchObject({ actor: 1, event: 14, damage: 10 })
  })
})

describe('11802 freeze (buff_dongjie_11802.js)', () => {
  it('cannot dodge, takes SaveData percent damage and thaws on the next hit', () => {
    // DodgeMul 1600 would make every attack miss; frozen it is InitDodge - 9999.
    const replay = fightBuffed(11802, 150, { dodge: 1600 })
    const [first, second] = strikesBy(replay, 0)
    // DecDamage -= 150 - 100: 100 * (1 + 50 / 100) = 150
    expect(first).toMatchObject({
      hit: true,
      damage: 150,
      delBuffs: [{ role: 1, buff: 11802 }],
    })
    expect(second).toMatchObject({ hit: false })
  })
})

describe('11824 earth wall (buff_tuliubi_11824.js)', () => {
  it('parries 40 % and reflects 60 % of the next hit', () => {
    const replay = fightBuffed(11824, 0)
    const [first] = strikesBy(replay, 0)
    // 100 * (100 - 40) / 100 = 60 taken; (int)(100 * 60 * 0.01f) = 60 reflected.
    expect(first).toMatchObject({
      damage: 60,
      parry: true,
      backDamage: 60,
      selfDamage: 60,
      delBuffs: [{ role: 1, buff: 11824 }],
    })
  })
})

describe('11817 needles (buff_11817.js)', () => {
  it('reflects 25 % of every hit', () => {
    const replay = fightBuffed(11817, 0)
    expect(strikesBy(replay, 0).slice(0, 2)).toMatchObject([
      { damage: 100, backDamage: 25 },
      { damage: 100, backDamage: 25 },
    ])
  })
})
