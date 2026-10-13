import { describe, expect, it } from 'vitest'
import { createRandom } from '@pockie/game-core'
import { monsterDrops } from './combat.js'
import { rollLibDrops, shopGearState } from './gear.js'

const plain = { canIdentify: false, identifyCount: 0, identifyTimes: 0, props: [] }
describe('refresh shop identify state (SetEquipIdentifyPropCount)', () => {
  it('keeps plain equipment appraised without inventing a roll', () => {
    expect(shopGearState('i250101', 0, true)).toEqual(plain)
  })
  it('refuses identify counts without a list, including old persisted stock', () => {
    expect(shopGearState('i220110', 4, false)).toEqual(plain)
    expect(shopGearState('i220110', 1, true, [{ propId: 1001, value: 3000 }])).toEqual(plain)
  })
  it('leaves Mystery and Dark equipment hidden until appraisal', () => {
    expect(shopGearState('i250101', 3, false)).toEqual({
      canIdentify: true,
      identifyCount: 3,
      identifyTimes: 0,
      props: [],
    })
  })
  it('preserves the Item Shop roll on purchase', () => {
    const props = [{ propId: 1001, value: 3000 }]
    expect(shopGearState('i250101', 1, true, props)).toEqual({
      canIdentify: true,
      identifyCount: 1,
      identifyTimes: 1,
      props,
    })
  })
})

describe('withheld treasure scroll drops', () => {
  it.each(Array.from({ length: 13 }, (_, i) => 1000351 + i))(
    'withholds all four scrolls in monster library %i while keeping other loot',
    (libId) => {
      const random = createRandom(0)
      random.int = () => 0 // Force every positive-probability entry, including all four scrolls.
      const drops = rollLibDrops(libId, random)
      expect(drops.some((drop) => /^i15900[0-3]$/.test(drop.itemId))).toBe(false)
      expect(drops.length).toBeGreaterThan(0)
    },
  )
  it('removes withheld scrolls from monster drop previews', () => {
    const drops = monsterDrops('n8000001')
    expect(drops.some((drop) => /^i15900[0-3]$/.test(drop.itemId))).toBe(false)
    expect(drops.length).toBeGreaterThan(0)
  })
})
