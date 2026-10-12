import { describe, expect, it } from 'vitest'
import { character } from '../test/game'
import { destinations, restCost } from './world'

const CHRISTMAS = [2104, 2204, 2304, 2404, 2504]
const ids = (list: { sceneId: number }[]) => list.map((d) => d.sceneId)

describe('destinations', () => {
  it('never offers the Christmas House, whose event is not in the game yet', () => {
    const roads = ids(destinations({ ...character, sceneId: 111 }))
    expect(roads).toContain(2101)
    for (const sceneId of CHRISTMAS) expect(roads).not.toContain(sceneId)
  })

  it('offers the world map from a scene no switch rule lists, as the server allows', () => {
    // SceneSwitchRuleSystem.CanChangeScene: a scene missing from the rules travels free.
    const roads = destinations({ ...character, sceneId: 2601, level: 40 })
    expect(roads.find((d) => d.sceneId === 111)).toMatchObject({ open: true })
    expect(roads.find((d) => d.sceneId === 2602)).toMatchObject({ open: true })
  })
})

describe('restCost', () => {
  it('is free up to level 10 and follows TeamStoneNpc.js above', () => {
    expect(restCost(10)).toBe(0)
    expect(restCost(40)).toBe(117)
  })
})
