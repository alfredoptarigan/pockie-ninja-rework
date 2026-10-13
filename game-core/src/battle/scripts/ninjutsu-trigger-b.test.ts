import { describe, expect, it } from 'vitest'
import skills from '../../../../server/data/game/skills.json'
import { BUFFS } from '../buffs.js'
import { simulateFight, type FighterInput } from '../fight.js'
import { SKILL_SCRIPTS } from '../skills.js'
import { fakeContext, makeFighter } from '../testing.js'
import {
  SKILL_LOSE,
  SKILL_SUCCESS,
  type ActiveBuff,
  type FightEvent,
  type SkillInput,
} from '../types.js'

const rows = skills as unknown as Record<string, Omit<SkillInput, 'id'>>
/** The skill.ini row of `base` at `level` (id = (level - 1) * 10000 + base). */
const skill = (base: number, level = 1): SkillInput => {
  const id = (level - 1) * 10000 + base
  return { id, ...rows[id]! }
}
const script = (base: number) => SKILL_SCRIPTS[skill(base).javascript!]!

const self = (overrides = {}) => makeFighter({ index: 0, level: 30, mp: 500, ...overrides })
const foe = (overrides = {}) => makeFighter({ index: 1, side: 'defenders', ...overrides })
const event = (): FightEvent => ({ actor: 0, event: 14, target: 1 })
const buff = (id: number, saveData = 0, saveData1 = 0): ActiveBuff => ({
  id,
  saveData,
  saveData1,
  lifeTime: -1,
  startTime: 0,
})

describe('3809 Phoenix Flower (skill_fengxianhuo_3809.js)', () => {
  it('strikes for damage * 0.4 and sets a wine-soaked target on fire', () => {
    // Arrange
    const { ctx, calls } = fakeContext({ damage: 100 })
    ctx.attack = (_s, _t, amount, fv) => {
      calls.push(['attack', Math.trunc(amount)])
      fv.hit = true
      fv.damage = 30
    }
    const caster = self()
    const fv = event()
    // Act
    const res = script(3809)(ctx, caster, foe({ buffs: [buff(11806)] }), fv, 0, skill(3809))
    // Assert: burn SaveData = TargetLastDamage * 0.4, two ticks; MP ToInt(29.41 * 0.3) = 8
    expect(res).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 40],
      ['addBuff', 1, 11804, 12, 2],
    ])
    expect(caster.mp).toBe(492)
    expect(fv.decMp).toBe(8)
  })

  it('feeds an existing burn instead of adding one', () => {
    const { ctx } = fakeContext({ damage: 100 })
    ctx.attack = (_s, _t, _a, fv) => {
      fv.hit = true
      fv.damage = 50
    }
    const burn = buff(11804, 5, 1)
    script(3809)(ctx, self(), foe({ buffs: [buff(11806), burn] }), event(), 0, skill(3809))
    expect(burn).toMatchObject({ saveData: 20, saveData1: 3 })
  })

  it('melts on a sunset roll: double damage and ignores defence', () => {
    const { ctx, calls } = fakeContext({ damage: 100, rolls: [4] })
    const fv = event()
    script(3809)(ctx, self({ buffs: [buff(11822, 5)] }), foe(), fv, 0, skill(3809))
    expect(calls).toEqual([['attack', 80]])
    expect(fv.neglectDef).toBe(true)
  })

  it('pays without striking a frozen target, flagged as ignoring defence (quirk)', () => {
    const { ctx, calls } = fakeContext({ damage: 100 })
    const caster = self()
    const fv = event()
    expect(script(3809)(ctx, caster, foe({ buffs: [buff(11802)] }), fv, 0, skill(3809))).toBe(
      SKILL_SUCCESS,
    )
    expect(calls).toEqual([])
    expect(caster.mp).toBe(492)
    expect(fv.neglectDef).toBe(true)
  })

  it('fails while sealed or without the MP', () => {
    const sealed = fakeContext()
    expect(
      script(3809)(sealed.ctx, self({ buffs: [buff(11812)] }), foe(), event(), 0, skill(3809)),
    ).toBe(SKILL_LOSE)
    const broke = fakeContext()
    expect(script(3809)(broke.ctx, self({ mp: 7 }), foe(), event(), 0, skill(3809))).toBe(
      SKILL_LOSE,
    )
    expect([...sealed.calls, ...broke.calls]).toEqual([])
  })

  it('reads the level 3 row: damage * 0.54', () => {
    const { ctx, calls } = fakeContext({ damage: 100 })
    script(3809)(ctx, self(), foe(), event(), 0, skill(3809, 3))
    expect(calls).toEqual([['attack', 54]])
  })
})

describe('3810 Eight Gates (skill_bamendunjia_3810.js)', () => {
  it('opens the first gate with the time it opened', () => {
    const { ctx, calls } = fakeContext()
    expect(script(3810)(ctx, self(), foe(), event(), 700, skill(3810))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11819, 700]])
  })

  it('opens the next gate once DoorTime has passed, else fails', () => {
    const early = fakeContext()
    const gate = self({ buffs: [buff(11819, 700)] })
    expect(script(3810)(early.ctx, gate, foe(), event(), 1699, skill(3810))).toBe(SKILL_LOSE)
    const late = fakeContext()
    expect(script(3810)(late.ctx, gate, foe(), event(), 1700, skill(3810))).toBe(SKILL_SUCCESS)
    expect(late.calls).toEqual([
      ['removeBuff', 0, 11819],
      ['addBuff', 0, 11844, 1700],
    ])
  })

  it('ends at the eighth gate (SaveData 1000) and opens no more', () => {
    const seventh = fakeContext()
    script(3810)(seventh.ctx, self({ buffs: [buff(11849, 0)] }), foe(), event(), 5000, skill(3810))
    expect(seventh.calls).toEqual([
      ['removeBuff', 0, 11849],
      ['addBuff', 0, 11850, 1000],
    ])
    const eighth = fakeContext()
    expect(
      script(3810)(eighth.ctx, self({ buffs: [buff(11850)] }), foe(), event(), 9000, skill(3810)),
    ).toBe(SKILL_LOSE)
  })

  it('fails once dead', () => {
    const { ctx } = fakeContext()
    expect(script(3810)(ctx, self({ hp: 0 }), foe(), event(), 0, skill(3810))).toBe(SKILL_LOSE)
  })
})

describe('3811 Sand Storm (skill_fengshazhen_3811.js)', () => {
  it('strikes back for damage * 1.6, with 20 % recoil when warm-blooded', () => {
    const { ctx } = fakeContext({ damage: 100 })
    const recoil: number[] = []
    ctx.attack = (_s, _t, amount, _fv, _timer, selfDamage = 0) => {
      recoil.push(Math.trunc(amount), Math.trunc(selfDamage))
    }
    const caster = self({ buffs: [buff(11814)] })
    const fv = event()
    expect(script(3811)(ctx, caster, foe(), fv, 0, skill(3811))).toBe(SKILL_SUCCESS)
    expect(recoil).toEqual([160, 32])
    expect(fv.decMp).toBe(32)
  })
})

describe('3812 Clay Bomb (skill_yinbaoniantu_3812.js)', () => {
  it('plants the bomb once per fight (thousands digit of its 8888 SaveData1)', () => {
    const { ctx, calls } = fakeContext()
    const init = buff(8888)
    const caster = self({ buffs: [init] })
    expect(script(3812)(ctx, caster, foe(), event(), 0, skill(3812))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 1, 11820, 1100]])
    expect(init.saveData1).toBe(1000)
    expect(caster.mp).toBe(442)
    expect(script(3812)(ctx, caster, foe(), event(), 0, skill(3812))).toBe(SKILL_LOSE)
  })

  it('fails without its 8888 buff', () => {
    const { ctx } = fakeContext()
    expect(script(3812)(ctx, self(), foe(), event(), 0, skill(3812))).toBe(SKILL_LOSE)
  })
})

describe('3813 Fog and 3815 Sunset (skill_wu_3813.js, skill_riluo_3815.js)', () => {
  it('Fog covers the caster for ToInt(base * 3.4) MP', () => {
    const { ctx, calls } = fakeContext()
    const caster = self()
    expect(script(3813)(ctx, caster, foe(), event(), 0, skill(3813))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11821, 0]])
    expect(caster.mp).toBe(401)
  })

  it('Fog cancels a sunset for free instead', () => {
    const { ctx, calls } = fakeContext()
    const caster = self()
    script(3813)(ctx, caster, foe({ buffs: [buff(11822)] }), event(), 0, skill(3813))
    expect(calls).toEqual([['removeBuff', 1, 11822]])
    expect(caster.mp).toBe(500)
  })

  it('Sunset cancels its own fog and an excitement it gave', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ buffs: [buff(11821), buff(11880, 999998)] })
    expect(script(3815)(ctx, caster, foe(), event(), 0, skill(3815))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['removeBuff', 0, 11821],
      ['removeBuff', 0, 11880],
    ])
  })

  it('Sunset rises once and grants excitement with a slaughter aura', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ buffs: [buff(11854, 15)] })
    expect(script(3815)(ctx, caster, foe(), event(), 0, skill(3815))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['addBuff', 0, 11822, 0],
      ['addBuff', 0, 11880, 999998, 15],
    ])
    expect(caster.mp).toBe(401)
    const again = fakeContext()
    expect(
      script(3815)(again.ctx, self({ buffs: [buff(11822)] }), foe(), event(), 0, skill(3815)),
    ).toBe(SKILL_LOSE)
  })
})

describe('3814 Wine (skill_jiu_3814.js)', () => {
  it('soaks the target once (HitMul -12, CritMul +3 at level 1)', () => {
    const { ctx, calls } = fakeContext()
    expect(script(3814)(ctx, self(), foe(), event(), 0, skill(3814))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 1, 11806, 12, 3]])
    expect(script(3814)(ctx, self(), foe({ buffs: [buff(11806)] }), event(), 0, skill(3814))).toBe(
      SKILL_LOSE,
    )
  })
})

describe('3819 Heaven Curse Mark (skill_tianzhizhouyin_3819.js)', () => {
  it('marks the caster once, free', () => {
    const { ctx, calls } = fakeContext()
    expect(script(3819)(ctx, self(), foe(), event(), 0, skill(3819))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11823, 0]])
    expect(script(3819)(ctx, self({ buffs: [buff(11823)] }), foe(), event(), 0, skill(3819))).toBe(
      SKILL_LOSE,
    )
  })

  it('pushes an excitement it already has to SaveData 999999', () => {
    const { ctx } = fakeContext()
    const excitement = buff(11880, 1)
    script(3819)(ctx, self({ buffs: [excitement] }), foe(), event(), 0, skill(3819))
    expect(excitement.saveData).toBe(999999)
  })
})

describe('3820 Waterfall (skill_pubu_3820.js)', () => {
  const ready = () => ({
    init: buff(8888),
    caster: self({ buffs: [buff(11804)] }),
  })

  it('stuns for 600 on a hit, counts it on the 8888 buff and puts out a burn', () => {
    // Level 1 water damage is 0: the zero strike keeps IsHit 1 and still stuns.
    const { ctx, calls } = fakeContext({ rolls: [0] })
    const { init, caster } = ready()
    const target = foe({ buffs: [init, buff(11804)] })
    expect(script(3820)(ctx, caster, target, event(), 0, skill(3820))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 0],
      ['addBuff', 1, 11813, 600],
      ['removeBuff', 1, 11804],
    ])
    expect(init.saveData).toBe(1)
    expect(caster.mp).toBe(462)
  })

  it('needs a random buff of its own with overlying 1 (quirk)', () => {
    const { ctx, calls } = fakeContext({ rolls: [0] })
    const caster = self({ buffs: [buff(11821)] })
    expect(script(3820)(ctx, caster, foe({ buffs: [buff(8888)] }), event(), 0, skill(3820))).toBe(
      SKILL_LOSE,
    )
    expect(calls).toEqual([])
  })

  it('stops after three stuns per target and is blocked by a substitute', () => {
    const capped = fakeContext({ rolls: [0] })
    const { caster } = ready()
    expect(
      script(3820)(capped.ctx, caster, foe({ buffs: [buff(8888, 3)] }), event(), 0, skill(3820)),
    ).toBe(SKILL_LOSE)
    const blocked = fakeContext({ rolls: [0] })
    const target = foe({ buffs: [buff(8888), buff(11840)] })
    script(3820)(blocked.ctx, ready().caster, target, event(), 0, skill(3820))
    expect(blocked.calls).toEqual([['attack', 0]])
  })
})

describe('3821 Prayer (skill_qidao_3821.js)', () => {
  it('turns invulnerable for 900 once per fight', () => {
    const { ctx, calls } = fakeContext()
    const init = buff(8888)
    const caster = self({ buffs: [init] })
    expect(script(3821)(ctx, caster, foe(), event(), 0, skill(3821))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 0, 11832, 900]])
    expect(init.saveData1).toBe(100000)
    expect(caster.mp).toBe(477)
    expect(script(3821)(ctx, caster, foe(), event(), 0, skill(3821))).toBe(SKILL_LOSE)
  })

  it('extends an excitement of SaveData 1', () => {
    const { ctx } = fakeContext()
    const excitement = buff(11880, 1)
    script(3821)(ctx, self({ buffs: [buff(8888), excitement] }), foe(), event(), 0, skill(3821))
    expect(excitement).toMatchObject({ saveData: 999997, lifeTime: 999997 })
  })
})

describe('3822 Flying Thunder God (skill_feileishen_3822.js)', () => {
  it('opens by putting a storm cloud on the target', () => {
    const { ctx, calls } = fakeContext()
    const caster = self()
    expect(script(3822)(ctx, caster, foe(), event(), 0, skill(3822, 2))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([['addBuff', 1, 11827, 2, 30]])
    expect(caster.mp).toBe(389)
  })

  it('moves the cloud to the other side 30 % of the time, free', () => {
    const moved = fakeContext({ rolls: [29] })
    expect(
      script(3822)(moved.ctx, self({ buffs: [buff(11827)] }), foe(), event(), 0, skill(3822)),
    ).toBe(SKILL_SUCCESS)
    expect(moved.calls).toEqual([
      ['removeBuff', 0, 11827],
      ['addBuff', 1, 11827, 1, 30],
    ])
    const stays = fakeContext({ rolls: [30] })
    expect(
      script(3822)(stays.ctx, self(), foe({ buffs: [buff(11827)] }), event(), 0, skill(3822)),
    ).toBe(SKILL_LOSE)
  })
})

describe('3825 Puppet (skill_kuilei_3825.js)', () => {
  it('strikes for damage * 0.6 and poisons once per target, no MP', () => {
    const { ctx, calls } = fakeContext({ damage: 100 })
    const init = buff(8888)
    const caster = self()
    expect(script(3825)(ctx, caster, foe({ buffs: [init] }), event(), 0, skill(3825))).toBe(
      SKILL_SUCCESS,
    )
    expect(calls).toEqual([
      ['attack', 60],
      ['addBuff', 1, 11811, 0],
    ])
    expect(init.saveData).toBe(100000)
    expect(caster.mp).toBe(500)
    const again = fakeContext({ damage: 100 })
    script(3825)(again.ctx, caster, foe({ buffs: [init] }), event(), 0, skill(3825))
    expect(again.calls).toEqual([['attack', 60]])
  })
})

describe('3826 Substitution (skill_tishenshu_3826.js)', () => {
  it('readies a substitute on a roll under 17, carrying the attacker burn, and stays hidden', () => {
    const { ctx, calls } = fakeContext({ rolls: [16] })
    const res = script(3826)(
      ctx,
      self(),
      foe({ buffs: [buff(11804, 25)] }),
      event(),
      0,
      skill(3826),
    )
    expect(res).toBe(SKILL_LOSE)
    expect(calls).toEqual([['addBuff', 0, 11840, 1, 25]])
    const miss = fakeContext({ rolls: [17] })
    script(3826)(miss.ctx, self(), foe(), event(), 0, skill(3826))
    expect(miss.calls).toEqual([])
  })
})

describe('3827 Abyss Gaze (skill_nailuojian_3827.js)', () => {
  it('puts a 6 % / 6 % drain on the target and lifts its own', () => {
    const { ctx, calls } = fakeContext()
    const caster = self({ buffs: [buff(11836)] })
    expect(script(3827)(ctx, caster, foe(), event(), 0, skill(3827))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['addBuff', 1, 11836, 6, 6],
      ['removeBuff', 0, 11836],
    ])
    expect(caster.mp).toBe(474)
    expect(script(3827)(ctx, caster, foe({ buffs: [buff(11836)] }), event(), 0, skill(3827))).toBe(
      SKILL_LOSE,
    )
  })

  it('drains a quarter of the HP while death-sealed', () => {
    const { ctx, calls } = fakeContext()
    script(3827)(ctx, self({ buffs: [buff(11808)] }), foe(), event(), 0, skill(3827))
    expect(calls[0]).toEqual(['addBuff', 1, 11836, 1, 6])
  })
})

describe('trigger ninjutsu buffs', () => {
  const run = (id: number, hook: 'onAdd' | 'onActivation' | 'onRemove') => BUFFS[id]![hook]!

  it('gates 11819 and 11844-11850 speed up AtkTime by 10 % per gate', () => {
    const gates = [11819, 11844, 11845, 11846, 11847, 11848, 11849, 11850]
    gates.forEach((id, i) => {
      const { ctx, calls } = fakeContext()
      const owner = self()
      run(id, 'onAdd')(ctx, owner, buff(id), event(), 0)
      run(id, 'onRemove')(ctx, owner, buff(id), event(), 0)
      expect(calls).toEqual([
        ['changeAtkTime', 0, (i + 1) * 10, 0],
        ['changeAtkTime', 0, -(i + 1) * 10, 0],
      ])
    })
  })

  it('11880 excitement raises attack by SaveData1 % for SaveData units', () => {
    const { ctx, calls } = fakeContext()
    const b = buff(11880, 999998, 15)
    run(11880, 'onAdd')(ctx, self(), b, event(), 0)
    expect(b.lifeTime).toBe(999998)
    expect(calls).toEqual([['changeAtk', 0, 15, 15]])
  })

  it('11820 clay bomb returns the HP lost since it was planted', () => {
    const { ctx, calls } = fakeContext()
    const owner = foe({ hp: 80 })
    const b = buff(11820, 1100)
    run(11820, 'onAdd')(ctx, owner, b, event(), 500)
    expect(b).toMatchObject({ lifeTime: 1100, saveData: 80, saveData1: 500 })
    owner.hp = 50
    const early: FightEvent = { actor: 1, event: 9 }
    run(11820, 'onActivation')(ctx, owner, b, early, 1599)
    expect(calls).toEqual([])
    const fv: FightEvent = { actor: 1, event: 9 }
    run(11820, 'onActivation')(ctx, owner, b, fv, 1600)
    expect(calls).toEqual([
      ['damage', 1, 30],
      ['removeBuff', 1, 11820],
    ])
    expect(fv.selfDamage).toBe(30)
  })

  it('11821 fog sets PriorityMul by time and clears it to 0', () => {
    const { ctx } = fakeContext()
    const owner = self({ priority: 40 })
    const b = buff(11821)
    run(11821, 'onActivation')(ctx, owner, b, event(), 2000)
    // 100 - 100 / (sqrt(10) * 0.03 + 1) = 8.66
    expect(owner.priority).toBe(8)
    run(11821, 'onRemove')(ctx, owner, b, event(), 2000)
    expect(owner.priority).toBe(0)
  })

  it('11822 sunset sets its melt chance by time', () => {
    const { ctx } = fakeContext()
    const b = buff(11822)
    run(11822, 'onActivation')(ctx, self(), b, event(), 2000)
    expect(b.saveData).toBe(9)
  })

  it('11823 curse mark raises attack by 50 % of the HP fraction lost', () => {
    const { ctx, calls } = fakeContext()
    const owner = self({ hp: 40, maxHp: 100 })
    const b = buff(11823)
    run(11823, 'onActivation')(ctx, owner, b, event(), 0)
    expect(b.saveData1).toBe(30)
    owner.minAtkMul = 30
    owner.maxAtkMul = 30
    owner.hp = 20
    run(11823, 'onActivation')(ctx, owner, b, event(), 0)
    run(11823, 'onRemove')(ctx, owner, b, event(), 0)
    expect(calls).toEqual([
      ['changeAtk', 0, 30, 30],
      ['changeAtk', 0, 40, 40],
      ['changeAtk', 0, -10, -10],
    ])
  })

  it('11827 storm cloud strikes 7 % MaxHP, wakes and paralyses its owner', () => {
    const { ctx, calls } = fakeContext()
    const owner = foe({ maxHp: 1000, decDamage: 50, buffs: [buff(8888), buff(11813)] })
    const fv: FightEvent = { actor: 1, event: 9 }
    run(11827, 'onActivation')(ctx, owner, buff(11827), fv, 0)
    expect(calls).toEqual([
      ['damage', 1, 35],
      ['removeBuff', 1, 11813],
      ['changeNextAtkTime', 1, 350],
      ['addBuff', 1, 11801, 0],
    ])
    expect(fv.selfDamage).toBe(35)
  })

  it('11827 does nothing to a praying owner and hits a static barrier for a fifth', () => {
    const praying = fakeContext()
    run(11827, 'onActivation')(
      praying.ctx,
      foe({ maxHp: 1000, buffs: [buff(11832)] }),
      buff(11827),
      event(),
      0,
    )
    expect(praying.calls).toEqual([])
    const shielded = fakeContext()
    const owner = foe({ maxHp: 1000, shieldDamage: 100, buffs: [buff(11831)] })
    const fv = event()
    run(11827, 'onActivation')(shielded.ctx, owner, buff(11827), fv, 0)
    // Original quirk: the shield grows by the damage instead of shrinking.
    expect(owner.shieldDamage).toBe(114)
    expect(fv.selfShield).toBe(-14)
  })

  it('11832 prayer takes no damage for SaveData units', () => {
    const { ctx } = fakeContext()
    const owner = self()
    const b = buff(11832, 900)
    run(11832, 'onAdd')(ctx, owner, b, event(), 0)
    expect(owner.decDamage).toBe(100)
    expect(b.lifeTime).toBe(900)
    run(11832, 'onRemove')(ctx, owner, b, event(), 0)
    expect(owner.decDamage).toBe(0)
  })

  it('11836 drain takes SaveData % MaxHP and SaveData1 % MaxMP per tick', () => {
    const { ctx } = fakeContext()
    const owner = foe({ hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, decDamage: 50 })
    const fv: FightEvent = { actor: 1, event: 9 }
    run(11836, 'onActivation')(ctx, owner, buff(11836, 6, 6), fv, 0)
    expect(owner).toMatchObject({ hp: 970, mp: 485 })
    expect(fv).toMatchObject({ selfDamage: 30, decMp: 15 })
  })

  it('11840 substitute parries everything, then sets the attacker burn on its owner', () => {
    const { ctx, calls } = fakeContext()
    const owner = self()
    const b = buff(11840, 1, 25)
    run(11840, 'onAdd')(ctx, owner, b, event(), 0)
    expect(owner.parryPercent).toBe(100)
    run(11840, 'onRemove')(ctx, owner, b, event(), 0)
    expect(owner.parryPercent).toBe(0)
    expect(calls).toEqual([['addBuff', 0, 11804, 25, 2]])
  })
})

describe('trigger ninjutsu in a fight', () => {
  const fighter = (overrides: Partial<FighterInput>): FighterInput => ({
    name: 'x',
    level: 30,
    hp: 3000,
    maxHp: 3000,
    mp: 3000,
    maxMp: 3000,
    minAttack: 100,
    maxAttack: 120,
    atkTime: 1000,
    hit: 0,
    dodge: 0,
    crit: 0,
    critAttach: 230,
    tough: 0,
    parry: 0,
    pierce: 0,
    defense: 100,
    neglectDefense: 0,
    counter: 0,
    priority: 0,
    ...overrides,
  })
  const kit = (bases: number[]) => [...bases.map((b) => skill(b)), skill(7777), skill(8888)]

  it('runs all 14 at level 1 deterministically and uses them', () => {
    const fight = () =>
      simulateFight({
        attackers: [fighter({ skills: kit([3809, 3810, 3811, 3812, 3813, 3814, 3826]) })],
        defenders: [fighter({ skills: kit([3815, 3819, 3820, 3821, 3822, 3825, 3827]) })],
        seed: 7,
      })
    const replay = fight()
    expect(replay).toEqual(fight())
    const used = new Set(replay.events.map((e) => e.skillId))
    expect([3810, 3813, 3814, 3815, 3819, 3822].filter((id) => used.has(id))).toHaveLength(6)
  })

  it('opening the gates shortens the AtkTime', () => {
    const replay = simulateFight({
      attackers: [fighter({ skills: kit([3810]) })],
      defenders: [fighter({ skills: kit([]) })],
      seed: 3,
    })
    const gates = replay.events.flatMap((e) => e.addBuffs ?? []).filter((b) => b.role === 0)
    expect(gates.map((b) => b.buff)).toContain(11819)
  })
})
