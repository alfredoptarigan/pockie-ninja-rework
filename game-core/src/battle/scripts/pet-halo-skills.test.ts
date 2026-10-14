import { describe, expect, it } from 'vitest'
import { createRandom } from '../../random.js'
import { fakeContext, makeFighter } from '../testing.js'
import { BUFFS } from '../buffs.js'
import type { ActiveBuff, FightEvent } from '../types.js'
import { PET_HALO_SKILLS, PET_HALO_BUFFS } from './pet-halo-skills.js'

const buff = (id: number): ActiveBuff => ({
  id,
  saveData: 0,
  saveData1: 0,
  lifeTime: -1,
  startTime: 0,
})
const added = [
  ['skill/skill_chongguanghuanceshi_40057.js', 11852, 0],
  ['skill/skill_shaluguanghuan0_40058.js', 11853, 0],
  ['skill/skill_shaluguanghuan1_40059.js', 11854, 0],
  ['skill/skill_shaluguanghuan2_40060.js', 11855, 0],
  ['skill/skill_jingjiguanghuan0_40062.js', 11857, 0],
  ['skill/skill_jingjiguanghuan1_40063.js', 11858, 0],
  ['skill/skill_jingjiguanghuan2_40064.js', 11859, 0],
  ['skill/skill_zaishengguanghuan0_40066.js', 11861, 0],
  ['skill/skill_zaishengguanghuan1_40067.js', 11862, 0],
  ['skill/skill_zaishengguanghuan2_40068.js', 11863, 0],
  ['skill/skill_shenshengguanghuan0_40070.js', 11865, 0],
  ['skill/skill_shenshengguanghuan1_40071.js', 11866, 0],
  ['skill/skill_shenshengguanghuan2_40072.js', 11867, 0],
  ['skill/skill_zhihuiguanghuan0_40074.js', 11869, 0],
  ['skill/skill_zhihuiguanghuan1_40075.js', 11870, 0],
  ['skill/skill_zhihuiguanghuan2_40076.js', 11871, 0],
  ['skill/skill_kangti_40106.js', 11875, 3],
  ['skill/skill_qingxing_40108.js', 11876, 3],
  ['skill/skill_jieyin_40110.js', 11877, 3],
  ['skill/skill_zhufu_40113.js', 11878, 3],
  ['skill/skill_chonggaoguanghuan0_40122.js', 11898, 0],
  ['skill/skill_chonggaoguanghuan1_40123.js', 11899, 0],
  ['skill/skill_chonggaoguanghuan2_40124.js', 11900, 0],
] as const
const modifiers = [
  ['skill/skill_xuezhou_40078.js', 11853, 'vampiricHp', 3],
  ['skill/skill_roubo_40079.js', 11853, 'skillAdd5', 300],
  ['skill/skill_kangfen_40080.js', 11853, 'saveData', 6],
  ['skill/skill_jiancihuti_40082.js', 11857, 'rebound', 3],
  ['skill/skill_guanghezuoyong_40083.js', 11857, 'saveData', 3],
  ['skill/skill_hanlengbowen_40084.js', 11857, 'skillAdd1', 300],
  ['skill/skill_xisheng_40086.js', 11861, 'saveData1', 15],
  ['skill/skill_quxie_40087.js', 11861, 'saveData', 9],
  ['skill/skill_muoushi_40088.js', 11861, 'skillAdd6', 300],
  ['skill/skill_longzuxuetong_40090.js', 11865, 'decDamage', 3],
  ['skill/skill_bukeqinfan_40091.js', 11865, 'counter', 6],
  ['skill/skill_shenshengyinji_40092.js', 11865, 'skillAdd7', 300],
  ['skill/skill_shenmishu_40094.js', 11869, 'saveData', 9],
  ['skill/skill_ganzhi_40095.js', 11869, 'saveData1', 12],
] as const

describe('pet Halo Rhino scripts, seeded level 1', () => {
  it.each(added)('%s adds its permanent marker and respects stronger tiers', (path, id, result) => {
    const self = makeFighter()
    const { ctx, calls } = fakeContext()
    ctx.randInt = createRandom(7).between
    expect(
      PET_HALO_SKILLS[path]!(ctx, self, makeFighter({ index: 1 }), { actor: 0, event: 14 }, 0, {
        id: 0,
        type: 2,
        level: 1,
      }),
    ).toBe(result)
    expect(calls).toEqual([['addBuff', 0, id, 0]])
    expect(BUFFS[id]!.lifeTime).toBe(-1)
  })
  it.each(modifiers)(
    '%s changes the base aura value and loses without its aura',
    (path, id, field, value) => {
      const aura = buff(id)
      const self = makeFighter({ buffs: [aura] })
      const target = makeFighter({ index: 1 })
      const { ctx } = fakeContext()
      ctx.randInt = createRandom(7).between
      expect(PET_HALO_SKILLS[path]!(ctx, self, target, { actor: 0, event: 14 }, 0)).toBe(3)
      const actual =
        field === 'saveData' || field === 'saveData1'
          ? aura[field]
          : field.startsWith('skillAdd')
            ? self.skillAdd[Number(field.slice(8))]
            : self[field as 'rebound']
      expect(actual).toBe(value)
      if (path.includes('roubo')) expect(target.skillAdd[8]).toBe(300)
      if (path.includes('hanleng')) expect(target.skillAdd[0]).toBe(300)
      if (path.includes('muoushi')) expect(aura.saveData).toBe(1500)
      const empty = makeFighter()
      PET_HALO_SKILLS[path]!(ctx, empty, target, { actor: 0, event: 14 }, 0)
      expect(empty.skillAdd).toEqual(Array(10).fill(0))
      expect(empty.rebound + empty.counter + empty.decDamage + empty.vampiricHp).toBe(0)
    },
  )
  it('40125 protects on a seeded roll for 200 units, expires, and caps at three uses', () => {
    const init = buff(8888)
    const self = makeFighter({ buffs: [buff(11898), init, buff(11836)] })
    const { ctx, calls } = fakeContext()
    ctx.randInt = (min, max) => createRandom(7).between(min, max)
    const script = PET_HALO_SKILLS['skill/skill_renzhuli_40125.js']!
    const fv: FightEvent = { actor: 0, event: 14 }
    for (let n = 0; n < 3; n++) expect(script(ctx, self, makeFighter(), fv, 0)).toBe(0)
    expect(script(ctx, self, makeFighter(), fv, 0)).toBe(3)
    expect(calls.filter((c) => c[0] === 'addBuff')).toHaveLength(3)
    const hooks = PET_HALO_BUFFS['buff/buff_renzhuli_11901.js']!
    hooks.onAdd!(ctx, self, buff(11901), fv, 0)
    expect(self.decDamage).toBe(100)
    expect(BUFFS[11901]!.lifeTime).toBe(200)
    hooks.onRemove!(ctx, self, buff(11901), fv, 201)
    expect(self.decDamage).toBe(0)
  })
  it('40126 restores 20% MP below 10% on a seeded roll and cleanses listed statuses', () => {
    const self = makeFighter({ mp: 5, maxMp: 100, buffs: [buff(11898), buff(11813)] })
    const { ctx, calls } = fakeContext()
    ctx.randInt = createRandom(7).between
    const fv: FightEvent = { actor: 0, event: 14 }
    expect(
      PET_HALO_SKILLS['skill/skill_shouxuefeiteng_40126.js']!(ctx, self, makeFighter(), fv, 0),
    ).toBe(0)
    expect(self.mp).toBe(25)
    expect(fv.incMp).toBe(25) // The original writes total MP, not delta.
    expect(calls).toContainEqual(['removeBuff', 0, 11813])
    expect(calls.filter((c) => c[0] === 'removeBuff')).toHaveLength(38)
  })
  it('40127 applies on a seeded roll the original additive formula and permanent marker', () => {
    const self = makeFighter({ atkTimeAdd: 100, buffs: [buff(11898)] })
    const { ctx, calls } = fakeContext()
    ctx.randInt = createRandom(7).between
    expect(
      PET_HALO_SKILLS['skill/skill_shouhuakuangbao_40127.js']!(
        ctx,
        self,
        makeFighter(),
        { actor: 0, event: 14 },
        0,
      ),
    ).toBe(0)
    expect(calls).toEqual([
      ['changeAtkTime', 0, 0, 80],
      ['changeAtk', 0, 0, 0],
      ['addBuff', 0, 11902, 0],
    ])
    expect(BUFFS[11902]!.lifeTime).toBe(-1)
  })
})

describe('pet Halo buff activation and removal', () => {
  it.each([
    ['buff/buff_shaluguanghuan0_11853.js', 40078, 'vampiricHp', 3],
    ['buff/buff_shaluguanghuan1_11854.js', 40078, 'vampiricHp', 4],
    ['buff/buff_shaluguanghuan2_11855.js', 40078, 'vampiricHp', 5],
    ['buff/buff_jingjiguanghuan0_11857.js', 40082, 'rebound', 3],
    ['buff/buff_jingjiguanghuan1_11858.js', 40082, 'rebound', 4],
    ['buff/buff_jingjiguanghuan2_11859.js', 40082, 'rebound', 5],
  ] as const)('%s reverses the dependent stat when removed', (path, skillId, field, rate) => {
    const self = makeFighter({ triggerSkills: [{ id: skillId, type: 2 }], [field]: rate })
    const hooks = PET_HALO_BUFFS[path]!
    const state = buff(Number(path.match(/_(\d+)\.js$/)![1]))
    state.saveData = 50
    hooks.onAdd!(fakeContext().ctx, self, state, { actor: 0, event: 9 }, 0)
    expect(state.saveData).toBe(0)
    hooks.onRemove!(fakeContext().ctx, self, state, { actor: 0, event: 9 }, 100)
    expect(self[field]).toBe(0)
  })
  it.each([11857, 11858, 11859])(
    'thorn aura %i heals at most three times on seeded rolls and caps at max HP',
    (id) => {
      const hooks =
        PET_HALO_BUFFS[Object.keys(PET_HALO_BUFFS).find((path) => path.endsWith(`_${id}.js`))!]!
      const self = makeFighter({ hp: 91 })
      const state = { ...buff(id), saveData: 4 }
      const { ctx } = fakeContext()
      ctx.randInt = createRandom(7).between
      const fv: FightEvent = { actor: 0, event: 9 }
      for (let n = 0; n < 100; n++) hooks.onActivation!(ctx, self, state, fv, n)
      expect(self.hp).toBe(100)
      expect(state.saveData1).toBe(3)
      expect(fv.incHp).toBe(1)
    },
  )
  it.each([
    [11869, 18],
    [11870, 24],
    [11871, 30],
  ])('wisdom aura %i grants its low-HP rider', (id, rate) => {
    const hooks =
      PET_HALO_BUFFS[Object.keys(PET_HALO_BUFFS).find((path) => path.endsWith(`_${id}.js`))!]!
    const self = makeFighter({ hp: 29, triggerSkills: [{ id: 40096, type: 2 }] })
    const { ctx, calls } = fakeContext()
    ctx.randInt = createRandom(7).between
    hooks.onActivation!(ctx, self, buff(id), { actor: 0, event: 9 }, 0)
    expect(calls).toEqual([['addBuff', 0, 11887, rate]])
    self.hp = 30
    hooks.onActivation!(ctx, self, buff(id), { actor: 0, event: 9 }, 0)
    expect(calls).toHaveLength(1)
  })
  it('preserves 40092 expert-tier and 40127 expert-only guard quirks', () => {
    const self = makeFighter({ buffs: [buff(11867), buff(11900)] })
    const { ctx, calls } = fakeContext()
    ctx.randInt = createRandom(7).between
    PET_HALO_SKILLS['skill/skill_shenshengyinji_40092.js']!(
      ctx,
      self,
      makeFighter(),
      { actor: 0, event: 14 },
      0,
    )
    expect(self.skillAdd[7]).toBe(0)
    expect(
      PET_HALO_SKILLS['skill/skill_shouhuakuangbao_40127.js']!(
        ctx,
        self,
        makeFighter(),
        { actor: 0, event: 14 },
        0,
      ),
    ).toBe(3)
    expect(calls).toEqual([])
  })
  it.each(
    added.filter(([, id]) =>
      [11853, 11854, 11857, 11858, 11861, 11862, 11865, 11866, 11869, 11870, 11898, 11899].includes(
        id,
      ),
    ),
  )('%s does not overwrite a stronger aura', (path, id) => {
    const self = makeFighter({ buffs: [buff(id + 1)] })
    const { ctx, calls } = fakeContext()
    ctx.randInt = createRandom(7).between
    expect(PET_HALO_SKILLS[path]!(ctx, self, makeFighter(), { actor: 0, event: 14 }, 0)).toBe(3)
    expect(calls).toEqual([])
  })
})

it('wisdom low-HP rider 11887 adds and reverses attack and speed on removal', () => {
  const hooks = PET_HALO_BUFFS['buff/buff_huiguangfanzhao_11887.js']!
  const self = makeFighter()
  const state = { ...buff(11887), saveData: 18 }
  const { ctx, calls } = fakeContext()
  ctx.randInt = createRandom(7).between
  hooks.onAdd!(ctx, self, state, { actor: 0, event: 9 }, 0)
  expect(calls).toEqual([
    ['changeAtk', 0, 18, 18],
    ['changeAtkTime', 0, 18, 0],
  ])
  self.minAtkMul = 18
  self.maxAtkMul = 18
  self.atkTimeMul = 18
  hooks.onRemove!(ctx, self, state, { actor: 0, event: 9 }, 100)
  expect(calls.slice(2)).toEqual([
    ['changeAtk', 0, 0, 0],
    ['changeAtkTime', 0, 0, 0],
  ])
})

it('40126 retries a higher coexisting noble tier when the lower tier roll fails', () => {
  const self = makeFighter({ mp: 5, maxMp: 100, buffs: [buff(11898), buff(11899)] })
  const { ctx } = fakeContext({ rolls: [30, 0] })
  const fv: FightEvent = { actor: 0, event: 14 }
  expect(
    PET_HALO_SKILLS['skill/skill_shouxuefeiteng_40126.js']!(ctx, self, makeFighter(), fv, 0),
  ).toBe(0)
  expect(self.mp).toBe(30)
})
