// The 12 active learnable ninjutsu (skill_<name>_18xx.js), against a scripted FightContext.
import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput } from '../fight.js'
import { fakeContext, makeFighter } from '../testing.js'
import { SKILL_LOSE, SKILL_SUCCESS, type ActiveBuff, type FightEvent } from '../types.js'
import { baseMpCost, NINJUTSU_ATTACK } from './ninjutsu-attack.js'

const script = (name: string) => NINJUTSU_ATTACK[`skill/skill_${name}.js`]!
const crystal = script('jiejing_1803')
const combo = script('lianji_1807')
const fireball = script('huoqiu_1808')
const rasengan = script('luoxuanwan_1810')
const reaper = script('shiguifengjin_1814')
const mighty = script('guaili_1822')
const fiveSeal = script('wuxingfengyin_1823')
const chidori = script('qianniao_1825')
const assassin = script('ansha_1827')
const bomb = script('zhadan_1828')
const scalpel = script('chakelashoushudao_1830')
const palm = script('baguazhang_1832')

/** A skill.ini row at `level` (only the level matters to the scripts). */
const lv = (level: number) => ({ id: 1800, type: 1, level })
const buff = (id: number, saveData = 0): ActiveBuff => ({
  id,
  saveData,
  lifeTime: -1,
  startTime: 0,
})
/** The status-immunity buff 8888 that skill 8888 gives every fighter at fight begin. */
const immunity = (saveData = 0) => buff(8888, saveData)
// Level 10: base MP cost 13.158...
const caster = (overrides = {}) => makeFighter({ index: 0, level: 10, mp: 500, ...overrides })
const foe = (overrides = {}) => makeFighter({ index: 1, side: 'defenders', ...overrides })
const event = (): FightEvent => ({ actor: 0, event: 14, target: 1 })

describe('base MP cost of the ninjutsu', () => {
  it('follows the level formula of the scripts', () => {
    expect(baseMpCost(1)).toBeCloseTo(6.6667, 4)
    expect(baseMpCost(10)).toBeCloseTo(13.1583, 4)
    expect(baseMpCost(30)).toBeCloseTo(29.4102, 4)
  })
})

describe('1803 Crystal Blade (skill_jiejing_1803.js)', () => {
  it('freezes on a hit (SaveData 200) for 2.6 base MP, clearing burn and warm blood first', () => {
    const { ctx, calls } = fakeContext()
    const self = caster()
    const target = foe({ buffs: [buff(11802), buff(11804), buff(11814)] })
    const fv = event()
    expect(crystal(ctx, self, target, fv, 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 1],
      ['removeBuff', 1, 11802],
      ['removeBuff', 1, 11804],
      ['removeBuff', 1, 11814],
      ['addBuff', 1, 11802, 200],
    ])
    expect(self.mp).toBe(500 - 34)
    expect(fv.decMp).toBe(34)
  })

  it('gives back a parry the hit consumed (with SaveData 0) and removes its own drain', () => {
    const { ctx, calls } = fakeContext()
    const self = caster({ buffs: [buff(11836)] })
    crystal(ctx, self, foe({ buffs: [buff(11841, 600)] }), event(), 0, lv(1))
    expect(calls).toEqual([
      ['attack', 1],
      ['addBuff', 1, 11802, 200],
      ['addBuff', 1, 11841, 0],
      ['removeBuff', 0, 11836],
    ])
  })

  it('does not freeze through a substitution, but still pays', () => {
    const { ctx, calls } = fakeContext()
    const self = caster()
    crystal(ctx, self, foe({ buffs: [buff(11840)] }), event(), 0, lv(1))
    expect(calls).toEqual([['attack', 1]])
    expect(self.mp).toBe(466)
  })

  it('falls back to the normal attack when sealed or short of MP (doubled by vessel damage)', () => {
    const sealed = fakeContext()
    crystal(sealed.ctx, caster({ buffs: [buff(11812)] }), foe(), event(), 0, lv(1))
    expect(sealed.calls).toEqual([['normalAttack']])

    const poor = fakeContext()
    crystal(poor.ctx, caster({ mp: 67, buffs: [buff(11839)] }), foe(), event(), 0, lv(1))
    expect(poor.calls).toEqual([['normalAttack']])
  })
})

describe('1807 Combo (skill_lianji_1807.js)', () => {
  it('strikes 5 times for damage * 2.5 * 0.8 or 9 times for * 1.2, then weakens itself', () => {
    const low = fakeContext({ rolls: [49], damage: 10 })
    const fv = event()
    expect(combo(low.ctx, caster(), foe(), fv, 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(low.calls).toEqual([
      ['attack', 20],
      ['addBuff', 0, 11833, 800],
    ])
    expect(fv.attackCount).toBe(5)

    const high = fakeContext({ rolls: [50], damage: 10 })
    const fv2 = event()
    combo(high.ctx, caster(), foe(), fv2, 0, lv(1))
    expect(high.calls[0]).toEqual(['attack', 30])
    expect(fv2.attackCount).toBe(9)
  })

  it('hits for 30 % under the death seal; level 3+ rows deal nothing (original table)', () => {
    const sealed = fakeContext({ rolls: [0], damage: 100 })
    combo(sealed.ctx, caster({ buffs: [buff(11808)] }), foe(), event(), 0, lv(1))
    expect(sealed.calls[0]).toEqual(['attack', 60])

    const level3 = fakeContext({ rolls: [0], damage: 100 })
    combo(level3.ctx, caster(), foe(), event(), 0, lv(3))
    expect(level3.calls).toEqual([
      ['attack', 0],
      ['addBuff', 0, 11833, 2],
    ])
  })
})

/** fakeContext whose attacks also report `damage` as the target's HP loss. */
function landing(damage: number, options: Parameters<typeof fakeContext>[0] = {}) {
  const fake = fakeContext(options)
  const attack = fake.ctx.attack
  fake.ctx.attack = (self, target, amount, fv, timer, selfDamage) => {
    attack(self, target, amount, fv, timer, selfDamage)
    fv.damage = damage
  }
  return fake
}

describe('1808 Fireball (skill_huoqiu_1808.js)', () => {
  it('hits for damage * 1.3, breaks an earth wall and costs 1 base MP', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const self = caster()
    const fv = event()
    expect(fireball(ctx, self, foe({ buffs: [buff(11824)] }), fv, 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['removeBuff', 1, 11824],
      ['attack', 13],
    ])
    expect(fv.decMp).toBe(13)
  })

  it('sets a wine-soaked target on fire: 40 % of the HP lost, 2 ticks', () => {
    const { ctx, calls } = landing(25, { damage: 10 })
    fireball(ctx, caster(), foe({ buffs: [buff(11806)] }), event(), 0, lv(1))
    expect(calls).toEqual([
      ['attack', 13],
      ['addBuff', 1, 11804, 10, 2],
    ])
  })

  it('stokes an existing fire: higher damage wins, ticks add up; fog stops it', () => {
    const fire = { ...buff(11804, 5), saveData1: 1 }
    const { ctx } = landing(25, { damage: 10 })
    fireball(ctx, caster(), foe({ buffs: [buff(11806), fire] }), event(), 0, lv(1))
    expect(fire).toMatchObject({ saveData: 10, saveData1: 3 })

    const foggy = landing(25, { damage: 10 })
    fireball(
      foggy.ctx,
      caster({ buffs: [buff(11821)] }),
      foe({ buffs: [buff(11806)] }),
      event(),
      0,
      lv(1),
    )
    expect(foggy.calls).toEqual([['attack', 13]])
  })

  it('does nothing to a frozen target but still costs MP', () => {
    const { ctx, calls } = fakeContext()
    const self = caster()
    expect(fireball(ctx, self, foe({ buffs: [buff(11802)] }), event(), 0, lv(1))).toBe(
      SKILL_SUCCESS,
    )
    expect(calls).toEqual([])
    expect(self.mp).toBe(487)
  })

  it('melts (double damage, ignores defence flag) on a sunset roll; warm blood hurts itself', () => {
    const { ctx, calls } = fakeContext({ rolls: [29], damage: 10 })
    const fv = event()
    fireball(ctx, caster({ buffs: [buff(11822, 30), buff(11814)] }), foe(), fv, 0, lv(1))
    // 10 * 1.3 * 2 = 26, self damage 26 * 0.2 = 5.2
    expect(calls).toEqual([['attack', 26]])
    expect(fv.neglectDef).toBe(true)
  })

  it('cannot be used without CanAttack', () => {
    const { ctx } = fakeContext()
    expect(fireball(ctx, caster({ canAttack: 0 }), foe(), event(), 0, lv(1))).toBe(SKILL_LOSE)
  })
})

describe('1810 Rasengan (skill_luoxuanwan_1810.js)', () => {
  it('hits for damage * 1.8 and takes 30 % of it itself', () => {
    const fake = fakeContext({ damage: 10 })
    const selfDamages: number[] = []
    const attack = fake.ctx.attack
    fake.ctx.attack = (self, target, amount, fv, timer, selfDamage = 0) => {
      selfDamages.push(Math.trunc(selfDamage))
      attack(self, target, amount, fv, timer)
    }
    const self = caster()
    expect(rasengan(fake.ctx, self, foe(), event(), 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(fake.calls).toEqual([['attack', 18]])
    expect(selfDamages).toEqual([5])
    expect(self.mp).toBe(482)
  })

  it('only has numbers for level 1 (higher rows strike for 0)', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    rasengan(ctx, caster(), foe(), event(), 0, lv(2))
    expect(calls).toEqual([['attack', 0]])
  })
})

describe('1814 Reaper Death Seal (skill_shiguifengjin_1814.js)', () => {
  it('seals attack (-70 %) for 2500 units once per duel, for 3.1 base MP', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const init = immunity()
    const self = caster()
    expect(reaper(ctx, self, foe({ buffs: [init] }), event(), 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 10],
      ['addBuff', 1, 11808, 2500],
    ])
    expect(init.saveData).toBe(10000)
    expect(self.mp).toBe(460)

    const again = fakeContext()
    reaper(again.ctx, caster(), foe({ buffs: [init] }), event(), 0, lv(1))
    expect(again.calls).toEqual([['normalAttack']])
  })

  it('lasts half as long on a cursed target; needs the immunity buff', () => {
    const cursed = fakeContext()
    reaper(cursed.ctx, caster(), foe({ buffs: [immunity(), buff(11823)] }), event(), 0, lv(1))
    expect(cursed.calls[1]).toEqual(['addBuff', 1, 11808, 1250])

    const bare = fakeContext()
    reaper(bare.ctx, caster(), foe(), event(), 0, lv(1))
    expect(bare.calls).toEqual([['normalAttack']])
  })
})

describe('1822 Mighty Strike (skill_guaili_1822.js)', () => {
  it('hits for damage + 7 % of the target MaxHP and stuns for 600, three times per duel', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const init = immunity(2)
    const self = caster()
    expect(
      mighty(ctx, self, foe({ maxHp: 1000, buffs: [init, buff(11813)] }), event(), 0, lv(1)),
    ).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 80],
      ['removeBuff', 1, 11813],
      ['addBuff', 1, 11813, 600],
    ])
    expect(init.saveData).toBe(3)
    expect(self.mp).toBe(500)

    const fourth = fakeContext()
    mighty(fourth.ctx, caster(), foe({ buffs: [init] }), event(), 0, lv(1))
    expect(fourth.calls).toEqual([['normalAttack']])
  })

  it('hits for 30 % under the death seal', () => {
    const { ctx, calls } = fakeContext({ damage: 100 })
    mighty(
      ctx,
      caster({ buffs: [buff(11808)] }),
      foe({ maxHp: 1000, buffs: [immunity()] }),
      event(),
      0,
      lv(1),
    )
    // 100 * 0.3 + 2.1 % of 1000
    expect(calls[0]).toEqual(['attack', 51])
  })
})

describe('1823 Five Elements Seal (skill_wuxingfengyin_1823.js)', () => {
  it('seals ninjutsu for 2300 units once per duel, for 2.8 base MP', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const init = immunity()
    const self = caster()
    fiveSeal(ctx, self, foe({ buffs: [init, buff(11812)] }), event(), 0, lv(1))
    expect(calls).toEqual([
      ['attack', 10],
      ['removeBuff', 1, 11812],
      ['addBuff', 1, 11812, 2300],
    ])
    expect(init.saveData).toBe(1000)
    expect(self.mp).toBe(464)

    const again = fakeContext()
    fiveSeal(again.ctx, caster(), foe({ buffs: [init] }), event(), 0, lv(1))
    expect(again.calls).toEqual([['normalAttack']])
  })
})

describe('1825 Chidori (skill_qianniao_1825.js)', () => {
  it('hits for damage * 1.6, clears a stun and paralyses (350 units) four times per duel', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const init = immunity(300)
    const self = caster()
    chidori(ctx, self, foe({ buffs: [init, buff(11813)] }), event(), 0, lv(1))
    expect(calls).toEqual([
      ['attack', 16],
      ['removeBuff', 1, 11813],
      ['changeNextAtkTime', 1, 350],
      ['addBuff', 1, 11801, 0],
    ])
    expect(init.saveData).toBe(400)
    expect(self.mp).toBe(474)

    const fifth = fakeContext({ damage: 10 })
    chidori(fifth.ctx, caster(), foe({ buffs: [init] }), event(), 0, lv(1))
    expect(fifth.calls).toEqual([['attack', 16]])
  })

  it('strikes 20 % harder with its own static barrier', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    chidori(ctx, caster({ buffs: [buff(11831)] }), foe({ buffs: [immunity()] }), event(), 0, lv(1))
    expect(calls[0]).toEqual(['attack', 19])
    expect(calls[1]).toEqual(['changeNextAtkTime', 1, 420])
  })

  it('pierces a static barrier with a sure hit and no paralysis', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const self = caster({ hitMulAdd: 5 })
    const target = foe({ buffs: [immunity(), buff(11831)], shieldDamage: 50 })
    const fv = { ...event(), targetShield: 0 }
    chidori(ctx, self, target, fv, 0, lv(1))
    expect(calls).toEqual([
      ['changeHit', 0, 1004],
      ['attack', 16],
      ['changeHit', 0, -994],
    ])
    // 1.6 / 3 is added to (and taken from) int fields, so both stay unchanged.
    expect(target.shieldDamage).toBe(50)
    expect(fv.targetShield).toBe(0)
  })
})

describe('1827 Assassinate (skill_ansha_1827.js)', () => {
  it('hits for damage * 1.2 with +50 vampiric HP and copies poison and wine to itself', () => {
    const fake = fakeContext({ damage: 10 })
    const vampiric: number[] = []
    const attack = fake.ctx.attack
    fake.ctx.attack = (self, ...rest) => {
      vampiric.push(self.vampiricHp)
      attack(self, ...rest)
    }
    const self = caster()
    const poison = { ...buff(11811), lifeTime: 6000 }
    assassin(fake.ctx, self, foe({ buffs: [poison, buff(11806)] }), event(), 0, lv(1))
    expect(vampiric).toEqual([50])
    expect(self.vampiricHp).toBe(0)
    expect(fake.calls).toEqual([
      ['attack', 12],
      ['addBuff', 0, 11811, 6000],
      ['addBuff', 0, 11806, -1],
    ])
    expect(self.mp).toBe(491)
  })
})

describe('1828 Bomb (skill_zhadan_1828.js)', () => {
  it('hits for damage * 2.1, breaking an earth wall, without MP', () => {
    const { ctx, calls } = fakeContext({ rolls: [0], damage: 10 })
    const self = caster()
    expect(bomb(ctx, self, foe({ buffs: [buff(11824)] }), event(), 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['removeBuff', 1, 11824],
      ['attack', 21],
    ])
    expect(self.mp).toBe(500)
  })

  it('is kicked back (event 6) by players and bomb-kicking NPCs, more often later on', () => {
    // timer 20000: 100 - 100 / (1 + 10 * 0.05) = 33.3
    const kicked = fakeContext({ rolls: [33], damage: 10 })
    const fv = event()
    bomb(kicked.ctx, caster(), foe({ kicksBombs: true }), fv, 20000, lv(1))
    expect(fv).toMatchObject({ actor: 1, event: 6, target: 0, skillId: 1828 })
    expect(kicked.calls).toEqual([['attack', 21]])

    const missed = fakeContext({ rolls: [34], damage: 10 })
    const fv2 = event()
    bomb(missed.ctx, caster(), foe({ kicksBombs: true }), fv2, 20000, lv(1))
    expect(fv2.event).toBe(14)

    const stunned = fakeContext({ rolls: [0], damage: 10 })
    const fv3 = event()
    bomb(stunned.ctx, caster(), foe({ kicksBombs: true, canMove: 0 }), fv3, 20000, lv(1))
    expect(fv3.event).toBe(14)
  })

  it('cannot be used without CanAttack', () => {
    const { ctx } = fakeContext()
    expect(bomb(ctx, caster({ canAttack: 0 }), foe(), event(), 0, lv(1))).toBe(SKILL_LOSE)
  })
})

describe('1830 Chakra Scalpel (skill_chakelashoushudao_1830.js)', () => {
  it('burns 15 % of its own MaxMP from the target on a hit, capped at the target MP', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    const self = caster({ maxMp: 500 })
    const target = foe({ mp: 100 })
    const fv = event()
    scalpel(ctx, self, target, fv, 0, lv(1))
    expect(calls).toEqual([['attack', 10]])
    expect(target.mp).toBe(25)
    expect(fv.targetDecMp).toBe(75)
    expect(self.mp).toBe(487)

    const capped = fakeContext()
    const dry = foe({ mp: 40, buffs: [buff(11839)] })
    scalpel(capped.ctx, caster({ maxMp: 500 }), dry, event(), 0, lv(1))
    expect(dry.mp).toBe(0)
  })

  it('burns nothing through a substitution and falls back to the normal attack without MP', () => {
    const { ctx } = fakeContext()
    const target = foe({ mp: 100, buffs: [buff(11840)] })
    scalpel(ctx, caster({ maxMp: 500 }), target, event(), 0, lv(1))
    expect(target.mp).toBe(100)

    const poor = fakeContext()
    scalpel(poor.ctx, caster({ mp: 12 }), foe(), event(), 0, lv(1))
    expect(poor.calls).toEqual([['normalAttack']])
  })
})

describe('1832 Eight Trigrams Palm (skill_baguazhang_1832.js)', () => {
  it('hits for damage * 1.5 and destroys the vessels (MP costs x2) once', () => {
    const { ctx, calls } = fakeContext({ damage: 10 })
    expect(palm(ctx, caster(), foe(), event(), 0, lv(1))).toBe(SKILL_SUCCESS)
    expect(calls).toEqual([
      ['attack', 15],
      ['addBuff', 1, 11839, 1],
    ])

    const again = fakeContext({ damage: 10 })
    palm(again.ctx, caster(), foe({ buffs: [buff(11839)] }), event(), 0, lv(1))
    expect(again.calls).toEqual([['attack', 15]])
  })
})

describe('ninjutsu in a fight', () => {
  const fighter = (overrides: Partial<FighterInput>): FighterInput => ({
    ...makeFighter(),
    level: 10,
    hp: 2000,
    maxHp: 2000,
    mp: 500,
    maxMp: 500,
    minAttack: 50,
    maxAttack: 60,
    ...overrides,
  })

  it('uses the skill rows by their javascript and records them under their secondid', () => {
    const row = { type: 1, quomodo: 2, effect: 1, probability: 100, secondid: 1832, level: 2 }
    const replay = simulateFight({
      attackers: [
        fighter({ skills: [{ id: 11832, javascript: 'skill/skill_baguazhang_1832.js', ...row }] }),
      ],
      defenders: [fighter({})],
      seed: 3,
    })
    const palms = replay.events.filter((e) => e.actor === 0 && e.skillId === 1832)
    expect(palms.length).toBeGreaterThan(0)
    expect(palms.some((e) => e.addBuffs?.some((b) => b.buff === 11839))).toBe(true)
  })

  it('records a kicked-back bomb as event 6 of the kicker, hurting the thrower', () => {
    const row = { type: 1, quomodo: 0, effect: 1, probability: 100, secondid: 1828, level: 1 }
    const replay = simulateFight({
      attackers: [
        fighter({
          maxAttack: 50,
          atkTime: 3000,
          skills: [{ id: 1828, javascript: 'skill/skill_zhadan_1828.js', ...row }],
        }),
      ],
      defenders: [fighter({ minAttack: 0, maxAttack: 0, kicksBombs: true, skills: [] })],
      seed: 5,
    })
    const kicks = replay.events.filter((e) => e.event === 6)
    expect(kicks.length).toBeGreaterThan(0)
    expect(kicks[0]).toMatchObject({ actor: 1, target: 0, skillId: 1828 })
    expect(replay.fighters[0]!.hp).toBeLessThan(2000)
  })
})
