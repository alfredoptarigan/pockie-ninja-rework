import { describe, expect, it } from 'vitest'
import { shopGearState } from './gear.js'

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
