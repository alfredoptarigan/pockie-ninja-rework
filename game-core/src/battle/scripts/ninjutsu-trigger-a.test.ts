/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput, type SkillInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'
import { NINJUTSU_TRIGGER_A_SKILLS } from './ninjutsu-trigger-a.js'

const script = (name: string) => NINJUTSU_TRIGGER_A_SKILLS[`skill/${name}.js`]!
const thunder = script('skill_luolei_1802')
const beastHeart = script('skill_weishouzhixin_1805')
const galePalm = script('skill_liefengzhang_1813')
const earthPrison = script('skill_tulao_1815')
const earthRiver = script('skill_tuliudahe_1816')
const flashStep = script('skill_shunbu_1826')
const mysticPalm = script('skill_zhangxianshu_1829')
const staticBarrier = script('skill_jingdianjiejie_1839')
const yinHealing = script('skill_yinyushangmie_3802')
const rebirth = script('skill_chuangzaozaisheng_3803')
const hotBlood = script('skill_rexue_3804')
const seduction = script('skill_seyoushu_3805')
const earthWall = script('skill_tuliubi_3806')
const net = script('skill_wang_3807')

const buff = (id: number, saveData = 0, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: -1,
  startTime: 0,
})
// Level 30 base MP cost: 29.41 (see field-2600-skills.test.ts).
const self = (overrides = {}) => makeFighter({ index: 0, level: 30, buffs: [buff(8888)], ...overrides })
const foe = (overrides = {}) =>
  makeFighter({ index: 1, side: 'defenders', buffs: [buff(8888)], ...overrides })
const event = (): FightEvent => ({ actor: 0, event: 14, target: 1 })
const level = (n: number): SkillInput => ({ id: (n - 1) * 10000 + 1, type: 2, level: n })

describe('1802 Falling Thunder (skill_luolei_1802.js)', () => {
  it('strikes for damage * 0.8 and paralyses for 350 units at level 1', () => {
    const { ctx, calls } = fakeContext()
    const target = foe()
    const caster = self()
    const fv = event()
    expect(thunder(ctx, caster, target, fv, 0, level(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 8],
      ['changeNextAtkTime', 1, 350],
      ['addBuff', 1, 11801, 0],
    ])
    expect(target.buffs![0]!.saveData).toBe(100)
    expect(caster.mp).toBe(71)
    expect(fv.decMp).toBe(29)
  })

  it('scales by level and by its own static barrier (11831)', () => {
    const plain = fakeContext()
    thunder(plain.ctx, self(), foe(), event(), 0, level(13))
    expect(plain.calls[0]).toEqual(['attack', 10])
    const barrier = fakeContext()
    thunder(barrier.ctx, self({ buffs: [buff(11831)] }), foe(), event(), 0, level(1))
    expect(barrier.calls.slice(0, 2)).toEqual([
      ['attack', 9],
      ['changeNextAtkTime', 1, 420],
    ])
  })

  it('stops paralysing after four, on frozen targets and on a miss', () => {
    for (const target of [foe({ buffs: [buff(8888, 400)] }), foe({ buffs: [buff(8888), buff(11802)] })]) {
      const { ctx, calls } = fakeContext()
      thunder(ctx, self(), target, event(), 0, level(1))
      expect(calls).toEqual([['attack', 8]])
    }
    const missed = fakeContext({ miss: true })
    thunder(missed.ctx, self(), foe(), event(), 0, level(1))
    expect(missed.calls).toEqual([['attack', 8]])
  })

  it('fails sealed, without mana or before the target has its 8888 buff', () => {
    const cases = [
      [self({ buffs: [buff(11812)] }), foe()],
      [self({ mp: 28 }), foe()],
      [self(), foe({ buffs: null })],
    ] as const
    for (const [caster, target] of cases) {
      const { ctx, calls } = fakeContext()
      expect(thunder(ctx, caster, target, event(), 0, level(1))).toBe(SKILL_LOSE)
      expect(calls).toEqual([])
    }
  })
})

describe('1805 Beast Heart (skill_weishouzhixin_1805.js)', () => {
  it('removes a random own buff with overlying 1 and ignores its MP table', () => {
    const { ctx, calls } = fakeContext({ rolls: [1] })
    const caster = self({ buffs: [buff(8888), buff(11813)] })
    expect(beastHeart(ctx, caster, foe(), event(), 0, level(13))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['removeBuff', 0, 11813]])
    expect(caster.mp).toBe(100)
  })

  it('fails when the roll lands on another buff', () => {
    const { ctx, calls } = fakeContext({ rolls: [0] })
    expect(beastHeart(ctx, self(), foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
    expect(calls).toEqual([])
  })
})

describe('1813 Gale Palm (skill_liefengzhang_1813.js)', () => {
  it('strikes for damage * 1.2 at level 1 and * 0.84 at level 13 for base * 0.8 MP', () => {
    const one = fakeContext()
    const caster = self()
    expect(galePalm(one.ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(one.calls).toEqual([['attack', 12]])
    expect(caster.mp).toBe(77)
    const thirteen = fakeContext()
    galePalm(thirteen.ctx, self(), foe(), event(), 0, level(13))
    expect(thirteen.calls).toEqual([['attack', 8]])
  })

  it('drops Illusion (11836) after the strike', () => {
    const { ctx, calls } = fakeContext()
    galePalm(ctx, self({ buffs: [buff(11836)] }), foe(), event(), 0, level(1))
    expect(calls).toEqual([
      ['attack', 12],
      ['removeBuff', 0, 11836],
    ])
  })
})

describe('1815 Earth Prison (skill_tulao_1815.js, also 60003)', () => {
  it('drains 3 % of the target MaxMP and lowers its defence by 50 at level 1', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ mp: 50 })
    const target = foe({ mp: 200, maxMp: 200 })
    const fv = event()
    expect(earthPrison(ctx, caster, target, fv, 0, level(1))).toBe(SKILL_SUCCESS)
    expect(caster.mp).toBe(56)
    expect(target.mp).toBe(194)
    expect(fv.incMp).toBe(6)
    expect(fv.targetDecMp).toBe(6)
    expect(calls).toEqual([['changeDefense', 1, -50]])
  })

  it('takes at most what the target has and gives at most up to MaxMP', () => {
    const { ctx } = fakeContext()
    const caster = self({ mp: 98 })
    const target = foe({ mp: 4, maxMp: 1000, buffs: [buff(11839)] })
    const fv = event()
    earthPrison(ctx, caster, target, fv, 0, level(13))
    expect(target.mp).toBe(0)
    expect(caster.mp).toBe(100)
    expect(fv.incMp).toBe(2)
  })

  it('fails on a target without MP or when sealed', () => {
    for (const [caster, target] of [
      [self(), foe({ mp: 0 })],
      [self({ buffs: [buff(11812)] }), foe()],
    ] as const) {
      const { ctx } = fakeContext()
      expect(earthPrison(ctx, caster, target, event(), 0, level(1))).toBe(SKILL_LOSE)
    }
  })
})

describe('1816 Earth River (skill_tuliudahe_1816.js)', () => {
  it('slows the target and delays it by half its slowed AtkTime, once per duel', () => {
    const { ctx, calls } = fakeContext()
    const target = foe()
    const record = ctx.addBuff
    ctx.addBuff = (...args) => {
      record(...args)
      target.atkTime = 2000
    }
    const caster = self()
    expect(earthRiver(ctx, caster, target, event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['addBuff', 1, 11810, 1200],
      ['changeNextAtkTime', 1, 1000],
    ])
    expect(caster.mp).toBe(45)
    expect(caster.buffs![0]!.saveData1).toBe(100)
    expect(earthRiver(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
  })

  it('fails on an already slowed target', () => {
    const { ctx } = fakeContext()
    const target = foe({ buffs: [buff(8888), buff(11810)] })
    expect(earthRiver(ctx, self(), target, event(), 0, level(1))).toBe(SKILL_LOSE)
  })
})

describe('1826 Flash Step (skill_shunbu_1826.js)', () => {
  it('speeds itself to AtkTime 1 with -35 % attack and delays the target by 1', () => {
    const { ctx, calls } = fakeContext()
    const caster = self()
    expect(flashStep(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['addBuff', 0, 11825, 999, 35],
      ['changeNextAtkTime', 1, 1],
    ])
    expect(caster.mp).toBe(68)
  })

  it('keeps full attack under Ghost (11808) and adds Excitement with a killing aura', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ buffs: [buff(8888), buff(11808), buff(11853), buff(11854, 7)] })
    flashStep(ctx, caster, foe(), event(), 0, level(1))
    expect(calls).toEqual([
      ['addBuff', 0, 11825, 999],
      ['changeNextAtkTime', 1, 1],
      ['addBuff', 0, 11880, 1, 7],
    ])
  })

  it('fails while already accelerated', () => {
    const { ctx } = fakeContext()
    const caster = self({ buffs: [buff(11825)] })
    expect(flashStep(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
  })
})

describe('1829 Mystic Palm (skill_zhangxianshu_1829.js)', () => {
  it('heals 11 % of the missing HP and cures poison, three times per duel', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ hp: 50, buffs: [buff(8888, 0, 2), buff(11811)] })
    const fv = event()
    expect(mysticPalm(ctx, caster, foe(), fv, 0, level(1))).toBe(SKILL_SUCCESS)
    expect(caster.hp).toBe(55)
    expect(fv.incHp).toBe(5)
    expect(caster.mp).toBe(65)
    expect(calls).toEqual([['removeBuff', 0, 11811]])
    expect(mysticPalm(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
  })

  it('fails at full HP', () => {
    const { ctx } = fakeContext()
    expect(mysticPalm(ctx, self(), foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
  })
})

describe('1839 Static Barrier (skill_jingdianjiejie_1839.js)', () => {
  it('raises a shield of 18 % MaxHP once per duel for base * 3 MP', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ mp: 100 })
    expect(staticBarrier(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11831, 18]])
    expect(caster.mp).toBe(12)
    caster.mp = 100
    expect(staticBarrier(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
  })
})

describe('3802 Yin Healing (skill_yinyushangmie_3802.js)', () => {
  it('heals 3 % MaxHP now and again on its next tick at level 1', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ hp: 500, maxHp: 1000, buffs: [buff(8888), buff(11834)] })
    const fv = event()
    expect(yinHealing(ctx, caster, foe(), fv, 0, level(1))).toBe(SKILL_SUCCESS)
    expect(caster.hp).toBe(530)
    expect(fv.incHp).toBe(30)
    expect(caster.mp).toBe(83)
    expect(calls).toEqual([
      ['removeBuff', 0, 11834],
      ['addBuff', 0, 11834, 30],
    ])
  })

  it('heals 58 % MaxHP but no tick at level 13', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ hp: 100, maxHp: 1000 })
    yinHealing(ctx, caster, foe(), event(), 0, level(13))
    expect(caster.hp).toBe(680)
    expect(calls).toEqual([['addBuff', 0, 11834, 0]])
  })
})

describe('3803 Rebirth (skill_chuangzaozaisheng_3803.js)', () => {
  // Chance at timer 800: 100 - sqrt(800 / 200) * 12 = 76.
  it('revives with 25 % InitMaxHP when the roll beats the shrinking chance', () => {
    const { ctx } = fakeContext({ rolls: [75] })
    const caster = self({ hp: 0, mp: 200 })
    const fv = event()
    expect(rebirth(ctx, caster, foe(), fv, 800, level(1))).toBe(SKILL_SUCCESS)
    expect(caster.hp).toBe(25)
    expect(fv.incHp).toBe(25)
    expect(caster.mp).toBe(83)
  })

  it('fails a roll at the chance or without mana', () => {
    expect(rebirth(fakeContext({ rolls: [76] }).ctx, self({ hp: 0, mp: 200 }), foe(), event(), 800, level(1))).toBe(
      SKILL_LOSE,
    )
    expect(rebirth(fakeContext({ rolls: [0] }).ctx, self({ hp: 0 }), foe(), event(), 0, level(1))).toBe(
      SKILL_LOSE,
    )
  })
})

describe('3804 Hot Blood (skill_rexue_3804.js)', () => {
  it('adds Hot Blood for 2100 units (SkillAdd0 bonus) once per duel', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ skillAdd: [200, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
    expect(hotBlood(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11814, 2142]])
    expect(caster.mp).toBe(33)
    expect(caster.buffs![0]!.saveData1).toBe(10)
    caster.mp = 100
    expect(hotBlood(ctx, caster, foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
  })

  it('upgrades a one-shot Excitement (SaveData 1) to the long one', () => {
    const { ctx } = fakeContext()
    const excitement = buff(11880, 1)
    hotBlood(ctx, self({ buffs: [buff(8888), excitement] }), foe(), event(), 0, level(1))
    expect(excitement).toMatchObject({ saveData: 999997, lifeTime: 999997 })
  })
})

describe('3805 Seduction (skill_seyoushu_3805.js)', () => {
  it('charms for 1500 units when the target rolls an overlying-0 buff', () => {
    const { ctx, calls } = fakeContext({ rolls: [1] })
    const caster = self()
    const target = foe({ buffs: [buff(8888), buff(11814)] })
    expect(seduction(ctx, caster, target, event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 1, 11815, 1500]])
    expect(caster.mp).toBe(30)
    expect(target.buffs![0]!.saveData).toBe(1000000)
  })

  it('fails when the roll lands on an overlying buff', () => {
    const { ctx, calls } = fakeContext({ rolls: [0] })
    const target = foe({ buffs: [buff(8888), buff(11814)] })
    expect(seduction(ctx, self(), target, event(), 0, level(1))).toBe(SKILL_LOSE)
    expect(calls).toEqual([])
  })
})

describe('3806 Earth Wall (skill_tuliubi_3806.js)', () => {
  it('raises the wall below a 19 % roll but always reports a failure', () => {
    const { ctx, calls } = fakeContext({ rolls: [18, 19] })
    expect(earthWall(ctx, self(), foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
    expect(earthWall(ctx, self(), foe(), event(), 0, level(1))).toBe(SKILL_LOSE)
    expect(calls).toEqual([['addBuff', 0, 11824, 0]])
  })
})

describe('3807 Net (skill_wang_3807.js)', () => {
  it('nets the target for -25 dodge at level 1 and -4 at level 6', () => {
    const { ctx, calls } = fakeContext()
    expect(net(ctx, self(), foe(), event(), 0, level(1))).toBe(SKILL_SUCCESS)
    expect(net(ctx, self(), foe(), event(), 0, level(6))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['addBuff', 1, 11816, 25],
      ['addBuff', 1, 11816, 4],
    ])
    expect(net(ctx, self(), foe({ buffs: [buff(11816)] }), event(), 0, level(1))).toBe(SKILL_LOSE)
  })
})

describe('ninjutsu trigger buffs', () => {
  const fv = event()

  it('11810 Slow doubles AtkTime for SaveData units', () => {
    const { ctx, calls } = fakeContext()
    const b = buff(11810, 1200)
    BUFFS[11810]!.onAdd!(ctx, self(), b, fv, 0)
    expect(b).toMatchObject({ lifeTime: 1200, saveData1: 50 })
    BUFFS[11810]!.onRemove!(ctx, self({ atkTimeMul: -50 }), b, fv, 0)
    expect(calls).toEqual([
      ['changeAtkTime', 0, -50, 0],
      ['changeAtkTime', 0, 0, 0],
    ])
  })

  it('11814 Hot Blood adds 15 to every SkillAdd and ends Excitement with the other boosts', () => {
    const { ctx, calls } = fakeContext()
    const owner = self({ buffs: [buff(11880, 999997)] })
    const b = buff(11814, 2100)
    BUFFS[11814]!.onAdd!(ctx, owner, b, fv, 0)
    expect(owner.skillAdd).toEqual(Array(10).fill(15))
    expect(b.lifeTime).toBe(2100)
    BUFFS[11814]!.onRemove!(ctx, owner, b, fv, 0)
    expect(owner.skillAdd).toEqual(Array(10).fill(0))
    expect(calls).toEqual([['removeBuff', 0, 11880]])
  })

  it('11816 Net lowers dodge by SaveData', () => {
    const { ctx, calls } = fakeContext()
    BUFFS[11816]!.onAdd!(ctx, self(), buff(11816, 25), fv, 0)
    BUFFS[11816]!.onRemove!(ctx, self({ dodgeMulAdd: -25 }), buff(11816, 25), fv, 0)
    expect(calls).toEqual([
      ['changeDodge', 0, -25],
      ['changeDodge', 0, 0],
    ])
  })

  it('11825 Gale shortens AtkTime by SaveData and lowers attack by SaveData1', () => {
    const { ctx, calls } = fakeContext()
    BUFFS[11825]!.onAdd!(ctx, self(), buff(11825, 999, 35), fv, 0)
    BUFFS[11825]!.onRemove!(ctx, self({ atkTimeAdd: 999, minAtkMul: -35, maxAtkMul: -35 }), buff(11825, 999, 35), fv, 0)
    expect(calls).toEqual([
      ['changeAtkTime', 0, 0, 999],
      ['changeAtk', 0, -35, -35],
      ['changeAtkTime', 0, 0, 0],
      ['changeAtk', 0, 0, 0],
    ])
  })

  it('11834 Regeneration heals SaveData on two ticks and cures poison', () => {
    const { ctx, calls } = fakeContext()
    const owner = self({ hp: 80, buffs: [buff(11811)] })
    const b = buff(11834, 30)
    const tick: FightEvent = { actor: 0, event: 9 }
    BUFFS[11834]!.onActivation!(ctx, owner, b, tick, 0)
    expect(owner.hp).toBe(100)
    expect(tick.incHp).toBe(20)
    expect(b.lifeTime).toBe(-1)
    BUFFS[11834]!.onActivation!(ctx, owner, b, tick, 0)
    expect(b.lifeTime).toBe(0)
    // The fake context keeps the poison, so the second tick cures it again.
    expect(calls).toEqual([
      ['removeBuff', 0, 11811],
      ['removeBuff', 0, 11811],
    ])
  })

  it('11880 Excitement raises attack by SaveData1 for SaveData units', () => {
    const { ctx, calls } = fakeContext()
    const b = buff(11880, 1, 7)
    BUFFS[11880]!.onAdd!(ctx, self(), b, fv, 0)
    expect(b.lifeTime).toBe(1)
    expect(calls).toEqual([['changeAtk', 0, 7, 7]])
  })
})

describe('ninjutsu trigger batch A in a fight', () => {
  const skills = JSON.parse(
    readFileSync(new URL('../../../../server/data/game/skills.json', import.meta.url), 'utf8'),
  ) as Record<string, Omit<SkillInput, 'id'>>
  const row = (id: number): SkillInput => ({ id, ...skills[id]! })
  const ids = [1802, 1805, 1813, 1815, 1816, 1826, 1829, 1839, 3802, 3803, 3804, 3805, 3806, 3807]

  it('has every script registered and runs deterministic fights at levels 1 and 13', () => {
    for (const id of ids) expect(SKILL_SCRIPTS[row(id).javascript!]).toBeTypeOf('function')
    const fighter = (lvl: number): FighterInput => ({
      name: 'x',
      level: 40,
      hp: 3000,
      maxHp: 3000,
      mp: 3000,
      maxMp: 3000,
      minAttack: 80,
      maxAttack: 100,
      atkTime: 1000,
      hit: 0,
      dodge: 0,
      crit: 0,
      critAttach: 230,
      tough: 0,
      parry: 0,
      pierce: 0,
      defense: 150,
      neglectDefense: 0,
      counter: 0,
      priority: 0,
      skills: [7777, 8888, ...ids.map((id) => (lvl - 1) * 10000 + id)].map(row),
    })
    for (const lvl of [1, 13]) {
      const run = () =>
        simulateFight({ attackers: [fighter(lvl)], defenders: [fighter(lvl)], seed: 5 })
      const replay = run()
      const used = new Set(replay.events.map((e) => e.skillId))
      expect(ids.filter((id) => used.has(id)).length).toBeGreaterThan(3)
      expect(replay).toEqual(run())
    }
  })
})
