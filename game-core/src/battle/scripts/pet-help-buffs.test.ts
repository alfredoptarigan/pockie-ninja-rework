import { describe, expect, it } from 'vitest'
import { createRandom } from '../../random.js'
import { fakeContext, makeFighter } from '../testing.js'
import type { ActiveBuff, FightEvent } from '../types.js'
import { PET_HELP_BUFFS } from './pet-help-buffs.js'

const event = (): FightEvent => ({ actor: 0, event: 9 })
const buff = (id: number): ActiveBuff => ({ id, saveData: 0, lifeTime: -1, startTime: 0 })

describe('pet Help buffs: add, activation and expiry', () => {
  it.each([
    ['shuilongbo_11903', 'dodge', 500, 300],
    ['suanyefushi_11904', 'minAttack', 100, 70],
    ['huanhua_11906', 'defense', 100, 400],
  ] as const)(
    '%s restores its level-1 change on expiry with seed 7',
    (name, field, before, after) => {
      const random = createRandom(7)
      const { ctx } = fakeContext()
      ctx.randInt = (min, max) => random.between(min, max)
      const self = makeFighter({ [field]: before, maxAttack: 100, defense: 100 })
      const b = buff(0)
      const script = PET_HELP_BUFFS[`buff/buff_${name}.js`]!
      script.onAdd!(ctx, self, b, event(), 0)
      expect(self[field]).toBe(after)
      script.onRemove!(ctx, self, b, event(), 800)
      expect(self[field]).toBe(before)
    },
  )

  it('pet block gives complete parry and the counter rider only with 11881, then restores', () => {
    const self = makeFighter({ buffs: [buff(11881)] })
    const b = buff(40006)
    const { ctx } = fakeContext()
    const script = PET_HELP_BUFFS['buff/buff_chongdang_40006.js']!
    script.onAdd!(ctx, self, b, event(), 0)
    expect([self.parryPercent, self.counter, b.saveData]).toEqual([100, 10, 1])
    script.onRemove!(ctx, self, b, event(), 0)
    expect([self.parryPercent, self.counter]).toEqual([0, 0])
  })

  it('Dark Control drains current HP and MP once, with vessel damage doubling MP loss', () => {
    const self = makeFighter({ hp: 100, mp: 100, buffs: [buff(11839)] })
    const b = buff(11907)
    const fv = event()
    PET_HELP_BUFFS['buff/buff_anheizhangkong_11907.js']!.onActivation!(
      fakeContext().ctx,
      self,
      b,
      fv,
      0,
    )
    expect([self.hp, self.mp, fv.selfDamage, fv.decMp, b.lifeTime]).toEqual([85, 70, 15, 30, 0])
  })
})

it('Devour recomputes attack using the minimum multiplier for both weapon bounds', () => {
  const self = makeFighter({ minAtkMul: 20, maxAtkMul: 40 })
  const { ctx, calls } = fakeContext()
  PET_HELP_BUFFS['buff/buff_tunshi_11897.js']!.onAdd!(ctx, self, buff(11897), event(), 0)
  expect(calls).toEqual([['changeAtk', 0, 20, 20]])
})
