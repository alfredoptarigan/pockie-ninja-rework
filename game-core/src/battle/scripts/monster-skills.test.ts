import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_SUCCESS, type FightEvent } from '../types.js'
import { MONSTER_SKILLS } from './monster-skills.js'

const blind = MONSTER_SKILLS['skill/skill_taiyangquan_40027.js']!
const bite = MONSTER_SKILLS['skill/skill_dingyao_40023.js']!
const blade = MONSTER_SKILLS['skill/skill_daoguang_40031.js']!
const launch = MONSTER_SKILLS['skill/skill_tiaofei_40033.js']!
const combo = MONSTER_SKILLS['skill/skill_lianzhan_40036.js']!

const player = (overrides = {}) => makeFighter({ index: 0, ...overrides })
const monster = (overrides = {}) => makeFighter({ index: 1, side: 'defenders', ...overrides })
const event = (): FightEvent => ({ actor: 1, event: 14, target: 0 })

describe('40027 Sun Fist (skill_taiyangquan_40027.js)', () => {
  it('blinds for 480 HitMul and costs InitMaxMP * 0.23 (MP truncated after the subtraction)', () => {
    const { ctx, calls } = fakeContext()
    const self = monster({ mp: 30, maxMp: 30 })
    const fv = event()
    expect(blind(ctx, self, player(), fv, 0)).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11843, 480]])
    // 30 - 6.9 = 23.1 -> 23; DecMP 6.9 -> 6
    expect(self.mp).toBe(23)
    expect(fv.decMp).toBe(6)
  })

  it('falls back to the normal attack without mana or when the target is already blind', () => {
    const noMana = fakeContext()
    blind(noMana.ctx, monster({ mp: 6, maxMp: 30 }), player(), event(), 0)
    expect(noMana.calls).toEqual([['normalAttack']])

    const blinded = fakeContext()
    const self = monster({ mp: 30, maxMp: 30 })
    const target = player({ buffs: [{ id: 11843, saveData: 480, lifeTime: -1, startTime: 0 }] })
    blind(blinded.ctx, self, target, event(), 0)
    expect(blinded.calls).toEqual([['normalAttack']])
    expect(self.mp).toBe(30)
  })
})

describe('40023 Bite (skill_dingyao_40023.js)', () => {
  it('hits for damage * 1.2 and poisons with SaveData MaxMP * AtkTime / 18000', () => {
    const { ctx, calls } = fakeContext({ damage: 9 })
    const self = monster({ mp: 32, maxMp: 32 })
    const fv = event()
    expect(bite(ctx, self, player(), fv, 0)).toBe(SKILL_SUCCESS)
    // 9 * 1.2 = 10.8 -> 10; 32 * 1000 / 18000 = 1.78 -> 1
    expect(calls).toEqual([
      ['attack', 10],
      ['addBuff', 0, 11811, 1],
    ])
    expect(self.mp).toBe(27)
    expect(fv.decMp).toBe(4)
  })

  it('does not poison on a miss but still pays', () => {
    const { ctx, calls } = fakeContext({ miss: true })
    const self = monster({ mp: 32, maxMp: 32 })
    bite(ctx, self, player(), event(), 0)
    expect(calls).toEqual([['attack', 12]])
    expect(self.mp).toBe(27)
  })
})

describe('40031 Blade Light (skill_daoguang_40031.js)', () => {
  it('breaks an earth wall and hits for damage * 1.2 at MaxMP * 0.17', () => {
    const { ctx, calls } = fakeContext()
    const self = monster({ mp: 73, maxMp: 73 })
    const target = player({ buffs: [{ id: 11824, saveData: 0, lifeTime: 0, startTime: 0 }] })
    const fv = event()
    blade(ctx, self, target, fv, 0)
    expect(calls).toEqual([
      ['removeBuff', 0, 11824],
      ['attack', 12],
    ])
    // 73 - 12.41 = 60.59 -> 60
    expect(self.mp).toBe(60)
    expect(fv.decMp).toBe(12)
  })

  it('falls back to the normal attack below the cost', () => {
    const { ctx, calls } = fakeContext()
    blade(ctx, monster({ mp: 12, maxMp: 73 }), player(), event(), 0)
    expect(calls).toEqual([['normalAttack']])
  })
})

describe('40033 Launch (skill_tiaofei_40033.js)', () => {
  it('hits and delays the target by MaxMP * AtkTime / 12000, hit or miss', () => {
    const { ctx, calls } = fakeContext({ miss: true })
    const self = monster({ mp: 73, maxMp: 73 })
    launch(ctx, self, player(), event(), 0)
    // 73 * 1000 / 12000 = 6.08 -> 6
    expect(calls).toEqual([
      ['attack', 12],
      ['changeNextAtkTime', 0, 6],
    ])
    expect(self.mp).toBe(62)
  })
})

describe('40036 Combo Slash (skill_lianzhan_40036.js)', () => {
  it.each([
    { rolls: [33], damage: 22, count: 2 },
    { rolls: [34, 32], damage: 23, count: 3 },
    { rolls: [34, 33], damage: 24, count: 4 },
  ])('rolls $rolls into $count strikes for $damage', ({ rolls, damage, count }) => {
    const { ctx, calls } = fakeContext({ rolls, damage: 20 })
    const fv = event()
    combo(ctx, monster({ mp: 73, maxMp: 73 }), player(), fv, 0)
    expect(calls).toEqual([['attack', damage]])
    expect(fv.attackCount).toBe(count)
  })
})

describe('monster skills in a fight', () => {
  const base: FighterInput = { ...makeFighter() }
  const must = (id: number, script: string): SkillInput => ({
    id,
    type: 1,
    effect: 2,
    probability: 100,
    javascript: `skill/${script}_${id}.js`,
  })

  it('blinds once, then attacks normally, and the blind player misses', () => {
    const replay = simulateFight({
      attackers: [{ ...base, hp: 1000, maxHp: 1000, minAttack: 1, maxAttack: 1 }],
      defenders: [
        {
          ...base,
          hp: 1000,
          maxHp: 1000,
          mp: 30,
          maxMp: 30,
          skills: [must(40027, 'skill_taiyangquan')],
        },
      ],
      seed: 3,
    })
    const skills = replay.events.filter((e) => e.actor === 1 && e.event === 14)
    expect(skills[0]).toMatchObject({
      skillId: 40027,
      decMp: 6,
      addBuffs: [{ role: 0, buff: 11843 }],
    })
    expect(skills.slice(1).every((e) => e.skillId === 1)).toBe(true)
    const playerHits = replay.events.filter((e) => e.actor === 0 && e.event === 14)
    // HitMul 0 - 480 against Dodge 0: 100 - 480 / 16 = 70 % to hit.
    expect(playerHits.some((e) => e.hit === false)).toBe(true)
    expect(replay.fighters[1]!.mp).toBe(23)
  })

  it('ticks the poison on each action of the poisoned fighter (MaxHP * 0.0003 * 100)', () => {
    const replay = simulateFight({
      attackers: [{ ...base, hp: 1000, maxHp: 1000, minAttack: 1, maxAttack: 1 }],
      defenders: [{ ...base, hp: 1000, maxHp: 1000, skills: [must(40023, 'skill_dingyao')] }],
      seed: 5,
    })
    const ticks = replay.events.filter((e) => e.event === 9 && e.skillId === 11811)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.every((e) => e.actor === 0 && e.selfDamage === 30)).toBe(true)
  })
})
