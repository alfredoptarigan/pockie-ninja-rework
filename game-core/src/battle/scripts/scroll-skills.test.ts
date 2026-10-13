import { describe, expect, it } from 'vitest'
import rows from '../../../../server/data/game/reborn/skills.json'
import metadata from '../../../../server/data/game/reborn/scroll-skills.json'
import { simulateFight } from '../fight.js'
import { GENERIC_SKILLS, SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import { BUFFS } from '../buffs.js'
import { SCROLL_BUFF as B } from './scroll-buffs.js'
import { skillChance } from '../ninjutsu.js'
import {
  SKILL_LOSE,
  type ActiveBuff,
  type FightEvent,
  type FighterInput,
  type SkillInput,
} from '../types.js'

const row = (id: number): SkillInput => ({ id, ...rows[String(id) as keyof typeof rows] })
const fighter = (skills: SkillInput[]): FighterInput => ({
  ...makeFighter(),
  name: 'Scroll ninja',
  level: 30,
  hp: 5000,
  maxHp: 5000,
  mp: 5000,
  maxMp: 5000,
  minAttack: 100,
  maxAttack: 100,
  atkTime: 500,
  skillAdd: Array(10).fill(99),
  skills,
})

describe('scroll skills', () => {
  for (const [key, meta] of Object.entries(metadata)) {
    const id = Number(key)
    it(`${id}: registers the overlay name and runs a seeded fight at its imported trigger`, () => {
      const skill = row(id)
      expect(SKILL_SCRIPTS[skill.javascript!]).toBeTypeOf('function')
      expect(skillChance(skill, Array(10).fill(99))).toBe(meta.castChance[1])
      const run = () =>
        simulateFight({ attackers: [fighter([skill])], defenders: [fighter([])], seed: 5 })
      const replay = run()
      expect(replay).toEqual(run())
      const index = replay.events.findIndex((e) => e.skillId === id)
      expect(index).toBeGreaterThanOrEqual(0)
      const prior = replay.events.slice(0, index)
      if (meta.trigger === 'before_attack' || meta.trigger === 'before_enemy_turn') {
        expect(prior.findLast((e) => e.event === 1)?.actor).toBe(
          meta.trigger === 'before_attack' ? 0 : 1,
        )
      } else if (meta.trigger === 'after_damage') {
        expect(prior.some((e) => e.actor === 1 && (e.damage ?? 0) > 0)).toBe(true)
      } else if (meta.trigger === 'additional_attack') {
        expect(prior.some((e) => e.actor === 0 && e.skillId === 1)).toBe(true)
      }
      const { ctx, calls } = fakeContext()
      SKILL_SCRIPTS[skill.javascript!]!(
        ctx,
        makeFighter({ mp: 0 }),
        makeFighter(),
        { actor: 0, event: 14 },
        0,
        skill,
      )
      if (meta.chakra > 0) expect(calls).toEqual(skill.type === 1 ? [['normalAttack']] : [])
      else expect(calls).toContainEqual(['attack', 9])
    })
  }
})

const buff = (id: number, saveData = 0, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: -1,
  startTime: 0,
})
function fixture(rolls: number[] = []) {
  const { ctx, calls } = fakeContext({ damage: 100, rolls })
  const self = makeFighter({ level: 30, hp: 500, maxHp: 1000, mp: 5000, maxMp: 5000, buffs: [] })
  const target = makeFighter({ index: 1, hp: 1000, maxHp: 1000, buffs: [] })
  const attack = ctx.attack
  ctx.attack = (...args) => {
    attack(...args)
    args[3].damage = Math.trunc(args[2])
  }
  const add = ctx.addBuff
  ctx.addBuff = (owner, id, timer, fv, data = 0, data1 = 0) => {
    add(owner, id, timer, fv, data, data1)
    const def = BUFFS[id]!
    if (def.replace) {
      for (const existing of [...(owner.buffs ?? [])]) {
        if (BUFFS[existing.id]?.replace === def.replace)
          ctx.removeBuff(owner, existing.id, timer, fv)
      }
    }
    const state = { ...buff(id, Math.trunc(data), data1), lifeTime: def.lifeTime, startTime: timer }
    ;(owner.buffs ??= []).push(state)
    def.onAdd?.(ctx, owner, state, fv, timer)
  }
  const remove = ctx.removeBuff
  ctx.removeBuff = (owner, id, timer, fv) => {
    remove(owner, id, timer, fv)
    const state = ctx.getBuff(owner, id)
    owner.buffs = owner.buffs?.filter((b) => b !== state) ?? []
    if (state) BUFFS[id]?.onRemove?.(ctx, owner, state, fv, timer)
  }
  const cast = (id: number, timer = 0) => {
    const fv: FightEvent = { actor: 0, target: 1, event: 14 }
    const result = SKILL_SCRIPTS[row(id).javascript!]!(ctx, self, target, fv, timer, row(id))
    return { fv, result }
  }
  return { ctx, calls, self, target, cast }
}

describe('level-one scroll formulas and state', () => {
  it('Izanagi halves incoming damage and adds 13% illusion damage without stacking itself', () => {
    const { self, cast } = fixture()
    expect(cast(1831).fv.decMp).toBe(58)
    cast(1831)
    const state = self.buffs![0]!
    expect(self.buffs).toHaveLength(1)
    expect(BUFFS[state.id]!.incomingDamage!(state, 0)).toBe(0.5)
    expect(BUFFS[state.id]!.outgoingDamage!(state, 8)).toBe(1.13)
    expect(BUFFS[state.id]!.outgoingDamage!(state, 0)).toBe(1)
  })

  it('Rinne cleans one random debuff, preserves an undispellable burn, or heals 10% max HP', () => {
    const { self, cast } = fixture([1])
    self.buffs = [buff(11811), buff(11839), buff(B.burn)]
    cast(1833)
    expect(self.buffs.map((b) => b.id)).toEqual([11811, B.burn])
    self.buffs = [buff(B.burn)]
    expect(cast(1833).fv.incHp).toBe(100)
    expect(self.hp).toBe(600)
  })

  it('Izanami accumulates actual damage and restores 70% at expiry, including after death', () => {
    const { self, ctx, cast } = fixture()
    cast(1834)
    const state = ctx.getBuff(self, B.izanami)!
    expect(state.lifeTime).toBe(2000)
    BUFFS[state.id]!.onDamage!(self, state, 400)
    BUFFS[state.id]!.onDamage!(self, state, 100)
    self.hp = 0
    const fv: FightEvent = { actor: 0, event: 9 }
    BUFFS[state.id]!.onRemove!(ctx, self, state, fv, 2000)
    expect(self.hp).toBe(0)
    BUFFS[state.id]!.onRemove!(ctx, self, state, fv, 2001)
    expect(self.hp).toBe(350)
    expect(fv.incHp).toBe(350)
  })

  it('Kirin strikes for 150%, stuns for six seconds and adds 50% only to lightning', () => {
    const { ctx, self, target, cast } = fixture()
    expect(cast(1835).fv.damage).toBe(150)
    expect(ctx.getBuff(target, 11813)?.lifeTime).toBe(600)
    const state = ctx.getBuff(self, B.kirin)!
    expect(BUFFS[state.id]!.outgoingDamage!(state, 3)).toBe(1.5)
    expect(BUFFS[state.id]!.outgoingDamage!(state, 0)).toBe(1)
  })

  it('Sprenger strikes for 130%, caps at two 17% damage/healing penalties and prevents revival', () => {
    const { ctx, target, cast } = fixture()
    for (let i = 0; i < 3; i++) expect(cast(1836).fv.damage).toBe(130)
    const state = ctx.getBuff(target, B.sprenger)!
    expect(state.saveData).toBe(2)
    expect(BUFFS[state.id]!.outgoingDamage!(state, 0)).toBeCloseTo(0.66)
    expect(BUFFS[state.id]!.healingMultiplier!(state)).toBeCloseTo(0.66)
    expect(BUFFS[state.id]!.preventsRevive).toBe(true)
  })

  it('Water Colliding Wave strikes for 130%, ignores blessings and rolls 25% partial defense bypass', () => {
    const { ctx, target, cast } = fixture([24, 25])
    target.defense = 200
    target.decDamage = 50
    target.absorb = 20
    target.parryPercent = 40
    const seen: number[][] = []
    const attack = ctx.attack
    ctx.attack = (...args) => {
      seen.push([target.defense, target.decDamage, target.absorb, target.parryPercent])
      attack(...args)
    }
    expect(cast(18041).fv.damage).toBe(130)
    cast(18041)
    expect(seen).toEqual([
      [150, 0, 0, 0],
      [200, 0, 0, 0],
    ])
    expect(target).toMatchObject({ defense: 200, decDamage: 50, absorb: 20, parryPercent: 40 })
  })

  it('Sand Burial strikes for 150%, slows speed 60%, adds earth damage and temporary 10% lifesteal', () => {
    const { ctx, calls, self, target, cast } = fixture()
    const attack = ctx.attack
    ctx.attack = (...args) => {
      expect(self.vampiricHp).toBe(10)
      attack(...args)
    }
    expect(cast(18042).fv.damage).toBe(150)
    expect(self.vampiricHp).toBe(0)
    expect(calls).toContainEqual(['changeAtkTime', 1, -60, 0])
    const state = ctx.getBuff(self, B.earth)!
    expect(BUFFS[state.id]!.outgoingDamage!(state, 2)).toBe(1.15)
    ctx.removeBuff(target, B.sand, 100, { actor: 1, event: 9 })
    expect(calls).toContainEqual(['changeAtkTime', 1, 60, 0])
  })

  it('Reverse Lotus opens three original gates at once and deals 32% per total open gate', () => {
    const { ctx, self, cast } = fixture()
    expect(cast(18043).fv.damage).toBe(96)
    expect(ctx.getBuff(self, 11845)).toBeDefined()
    expect(cast(18043).fv.damage).toBe(192)
    expect(ctx.getBuff(self, 11848)).toBeDefined()
    expect(cast(18043).fv.damage).toBe(256)
    expect(ctx.getBuff(self, 11850)).toBeDefined()
  })

  it('Black Coffin deals 120% plus 7% enemy max HP, stuns for 12s and ignores rebound', () => {
    const { ctx, target, cast } = fixture()
    target.rebound = 70
    const attack = ctx.attack
    ctx.attack = (...args) => {
      expect(target.rebound).toBe(0)
      attack(...args)
    }
    expect(cast(18044).fv.damage).toBe(190)
    expect(ctx.getBuff(target, 11813)?.lifeTime).toBe(1200)
    expect(target.rebound).toBe(70)
  })

  it('Cremation deals 120% and grants 15% of dodge as defense break, reversibly and without stacking', () => {
    const { self, ctx, cast } = fixture()
    self.dodge = 200
    cast(18045)
    expect(cast(18045).fv.damage).toBe(120)
    expect(self.neglectDefense).toBe(30)
    ctx.removeBuff(self, B.cremation, 100, { actor: 0, event: 9 })
    expect(self.neglectDefense).toBe(0)
  })

  it('Royal Hollow Flash adds 60% per debuff, cleanses, leaves undispellable burn and stops at three uses', () => {
    const { self, ctx, cast } = fixture()
    self.buffs = [buff(11811), buff(11839), buff(B.burn)]
    expect(cast(18046).fv.damage).toBe(360)
    expect(ctx.getBuff(self, 11811)).toBeUndefined()
    expect(ctx.getBuff(self, B.burn)).toBeDefined()
    cast(18046)
    cast(18046)
    const mp = self.mp
    expect(cast(18046).result).toBe(SKILL_LOSE)
    expect(self.mp).toBe(mp)
  })

  it('Amaterasu deals 160%, caps vulnerability at eight 5% stacks and burns for 40% twice', () => {
    const { ctx, target, cast, calls } = fixture()
    for (let i = 0; i < 9; i++) expect(cast(18091).fv.damage).toBe(160)
    const vulnerability = ctx.getBuff(target, B.fireVulnerability)!
    expect(vulnerability.saveData).toBe(8)
    expect(BUFFS[vulnerability.id]!.incomingDamage!(vulnerability, 0)).toBe(1.4)
    expect(BUFFS[vulnerability.id]!.incomingDamage!(vulnerability, 1)).toBe(1)
    const burn = ctx.getBuff(target, B.burn)!
    const fv: FightEvent = { actor: 1, event: 9 }
    BUFFS[burn.id]!.onActivation!(ctx, target, burn, fv, 100)
    BUFFS[burn.id]!.onActivation!(ctx, target, burn, fv, 200)
    expect(calls.filter((call) => call[0] === 'damage')).toEqual([
      ['damage', 1, 64],
      ['damage', 1, 64],
    ])
    expect(ctx.getBuff(target, B.burn)).toBeUndefined()
  })

  it('dizzy and charm block Kirin and Sprenger without spending MP', () => {
    for (const id of [1835, 1836])
      for (const state of [11813, 11815]) {
        const { self, calls, cast } = fixture()
        self.canMove = 0
        self.buffs = [buff(state)]
        expect(cast(id).result).toBe(SKILL_LOSE)
        expect(self.mp).toBe(5000)
        expect(calls).toEqual([])
      }
  })
})

describe('scroll engine hooks in seeded fights', () => {
  it('revives at Izanami expiry after accumulating the triggering hit and lethal damage', () => {
    const caster = { ...fighter([row(1834)]), hp: 100, maxHp: 100, minAttack: 10, maxAttack: 10 }
    const foe = { ...caster, skills: [], minAttack: 60, maxAttack: 60 }
    const replay = simulateFight({ attackers: [caster], defenders: [foe], seed: 6 })
    const expiry = replay.events.findIndex(
      (e) => e.actor === 0 && e.delBuffs?.some((b) => b.buff === B.izanami),
    )
    expect(expiry).toBeGreaterThan(0)
    expect(replay.events[expiry]?.incHp).toBe(70)
    expect(
      replay.events
        .slice(0, expiry)
        .filter((e) => e.actor === 1 && e.damage)
        .map((e) => e.damage),
    ).toEqual([60, 60])
    expect(replay.events.slice(expiry + 1).some((e) => e.actor === 0 && e.event === 1)).toBe(true)
  })

  it('Sprenger lowers direct healing and suppresses the original death-trigger resurrection', () => {
    const attack = {
      ...fighter([{ ...row(1836), probability: 100 }]),
      minAttack: 20,
      maxAttack: 20,
    }
    const heal: SkillInput = {
      id: 3802,
      type: 2,
      quomodo: 2,
      probability: 100,
      level: 1,
      javascript: 'skill/skill_yinyushangmie_3802.js',
    }
    const defend = {
      ...fighter([...GENERIC_SKILLS, heal]),
      hp: 500,
      maxHp: 1000,
      minAttack: 1,
      maxAttack: 1,
    }
    const replay = simulateFight({ attackers: [attack], defenders: [defend], seed: 5 })
    expect(
      replay.events.filter((e) => e.actor === 1 && e.skillId === 3802).map((e) => e.incHp),
    ).toContain(19)
    const rebirth: SkillInput = {
      id: 3803,
      type: 2,
      quomodo: 5,
      probability: 100,
      level: 1,
      javascript: 'skill/skill_chuangzaozaisheng_3803.js',
    }
    const killed = simulateFight({
      attackers: [{ ...attack, minAttack: 1000, maxAttack: 1000 }],
      defenders: [{ ...defend, hp: 1000, atkTime: 100, skills: [rebirth] }],
      seed: 5,
    })
    expect(killed.events.some((e) => e.skillId === 3803)).toBe(false)
    expect(killed.fighters[1]?.hp).toBe(0)
  })

  it('applies incoming reduction and element bonuses to attacks without altering other elements', () => {
    const self = {
      ...fighter([{ ...row(1831), probability: 100 }]),
      minAttack: 100,
      maxAttack: 100,
    }
    const replay = simulateFight({ attackers: [self], defenders: [fighter([])], seed: 5 })
    expect(
      replay.events.filter((e) => e.actor === 1 && e.skillId === 1).map((e) => e.damage),
    ).toContain(50)
    expect(
      replay.events.filter((e) => e.actor === 0 && e.skillId === 1).map((e) => e.damage),
    ).toContain(100)
  })
})
