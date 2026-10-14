import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import type { ActiveBuff, FightEvent, SkillInput } from '../types.js'
import { petPassBonuses, regenAuraResist } from './pet-core.js'

const skillRows = JSON.parse(
  readFileSync(new URL('../../../../server/data/game/skills.json', import.meta.url), 'utf8'),
) as Record<string, Omit<SkillInput, 'id'>>
const row = (id: number): SkillInput => ({ ...skillRows[id]!, id })
const buff = (id: number, saveData = 0, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: -1,
  startTime: 0,
})

const ninja = (overrides: Partial<FighterInput> = {}): FighterInput => ({
  name: 'Ninja',
  level: 50,
  hp: 5000,
  maxHp: 5000,
  mp: 0,
  maxMp: 0,
  minAttack: 100,
  maxAttack: 100,
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
  skills: [],
  ...overrides,
})
const pet = {
  species: 'i320002',
  avatar: 10050,
  level: 50,
  totals: { attack: 610, defence: 488, disturb: 610, active: 610, savvy: 488 },
  skills: [row(40001)],
}

describe('PET_ATTACK 40001 in a seeded fight', () => {
  const replay = simulateFight({
    attackers: [ninja({ pet })],
    defenders: [ninja({ name: 'Dummy', minAttack: 1, maxAttack: 1 })],
    seed: 7,
  })
  const petHits = replay.events.filter((e) => e.skillId === 40001)

  it('strikes after the master hits, for 75% of the damage, flagged isPet', () => {
    expect(petHits.length).toBeGreaterThan(0)
    for (const hit of petHits) {
      expect(hit).toMatchObject({ actor: 0, target: 1, event: 14, isPet: true, damage: 75 })
    }
    const normal = replay.events.find((e) => e.actor === 0 && e.skillId === 1)
    expect(normal).toMatchObject({ damage: 100 })
    expect(normal?.isPet).toBeUndefined()
  })

  it('puts the pet on its master in the replay', () => {
    expect(replay.fighters[0]!.pet).toEqual({ species: 'i320002', avatar: 10050 })
    expect(replay.fighters[1]!).not.toHaveProperty('pet')
  })
})

describe('skill_chonggong_40001.js', () => {
  const script = SKILL_SCRIPTS['skill/skill_chonggong_40001.js']!
  const fv = (): FightEvent => ({ actor: 0, event: 14, target: 1 })

  it('attacks for 75% of GetDamage and does nothing else without Ice Breath', () => {
    const { ctx, calls } = fakeContext({ damage: 101 })
    script(ctx, makeFighter(), makeFighter({ index: 1 }), fv(), 0)
    expect(calls).toEqual([['attack', 75]])
  })

  it('freezes with Ice Breath (11879) when RandInt(0, 99) < SaveData, keeping the parry', () => {
    const self = makeFighter({ buffs: [buff(11879, 30)] })
    self.skillAdd[1] = 5000
    const target = makeFighter({ index: 1, buffs: [buff(11804), buff(11841)] })
    const { ctx, calls } = fakeContext({ rolls: [29], damage: 100 })
    script(ctx, self, target, fv(), 0)
    // 200 x (1 + 0.01 x ToInt(5000 x 0.01)) = 300.
    expect(calls).toEqual([
      ['attack', 75],
      ['removeBuff', 1, 11804],
      ['addBuff', 1, 11802, 300],
      ['addBuff', 1, 11841, 0],
    ])
  })

  it('does not freeze on a miss, through a substitute, or when the roll fails', () => {
    const self = makeFighter({ buffs: [buff(11879, 30)] })
    const missed = fakeContext({ miss: true })
    script(missed.ctx, self, makeFighter({ index: 1 }), fv(), 0)
    expect(missed.calls).toEqual([['attack', 7]])
    const pegged = fakeContext()
    script(pegged.ctx, self, makeFighter({ index: 1, buffs: [buff(11840)] }), fv(), 0)
    expect(pegged.calls).toEqual([['attack', 7]])
    const failed = fakeContext({ rolls: [30] })
    script(failed.ctx, self, makeFighter({ index: 1 }), fv(), 0)
    expect(failed.calls).toEqual([['attack', 7]])
  })
})

describe('regeneration auras 11861-11863', () => {
  it('shorten control buffs by SaveData % 100 percent and add 11888', () => {
    const self = makeFighter({ buffs: [buff(11862, 125)] })
    const { ctx, calls } = fakeContext()
    expect(regenAuraResist(ctx, self, 600, { actor: 0, event: 14 }, 0)).toBe(450)
    expect(calls).toEqual([['addBuff', 0, 11888, 0]])
    expect(regenAuraResist(ctx, makeFighter(), 600, { actor: 0, event: 14 }, 0)).toBe(600)
  })

  it('make a stun last its full SaveData without an aura, less with one', () => {
    const fight = (buffs: ActiveBuff[]) => {
      const self = makeFighter({ buffs })
      const stun = buff(11813, 900)
      BUFFS[11813]!.onAdd!(fakeContext().ctx, self, stun, { actor: 0, event: 14 }, 0)
      return stun.lifeTime
    }
    expect(fight([])).toBe(900)
    expect(fight([buff(11861, 40)])).toBe(540)
  })

  it('reset SaveData on add (the aura skills raise it later)', () => {
    const aura = buff(11862, 7, 7)
    BUFFS[11862]!.onAdd!(fakeContext().ctx, makeFighter(), aura, { actor: 0, event: 9 }, 0)
    expect([aura.saveData, aura.saveData1]).toEqual([0, 0])
  })

  it('heal SaveData1 percent of MaxHP once below 20% HP, then end', () => {
    const self = makeFighter({ hp: 19, maxHp: 100 })
    const fv: FightEvent = { actor: 0, event: 9 }
    const { ctx, calls } = fakeContext()
    BUFFS[11862]!.onActivation!(ctx, self, buff(11862, 0, 30), fv, 0)
    expect(self.hp).toBe(49)
    expect(fv.incHp).toBe(30)
    expect(calls).toEqual([['removeBuff', 0, 11862]])
  })

  it('11861 waits until SaveData1 is set', () => {
    const self = makeFighter({ hp: 10, maxHp: 100 })
    const { ctx, calls } = fakeContext()
    BUFFS[11861]!.onActivation!(ctx, self, buff(11861), { actor: 0, event: 9 }, 0)
    expect(self.hp).toBe(10)
    expect(calls).toEqual([])
  })
})

describe('petPassBonuses (skilladd rows of Pass skills)', () => {
  it('adds the *Skill terms like equipment', () => {
    expect(
      petPassBonuses([{ MinAtkSkill: 18 }, { DefenseSkill: 10, MaxHPMulSKill: 5 }, { MaxHP: 9 }]),
    ).toMatchObject({ minAttack: 18, defense: 10, hpMul: 5 })
  })
})
