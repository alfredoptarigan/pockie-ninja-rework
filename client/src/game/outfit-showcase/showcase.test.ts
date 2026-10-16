import { describe, expect, it } from 'vitest'
import { gameMotions } from '../../generated/game-assets'
import { outfitName } from '../text'
import { outfitReplay, showcaseOutfits } from './showcase'

const player = { name: 'QA_Madara', level: 90 }

describe('showcaseOutfits', () => {
  it('lists every outfit with motion art once, by clothing id, Hashirama included', () => {
    const ids = showcaseOutfits.map((o) => o.clothing)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    expect(ids.length).toBe(Object.keys(gameMotions.outfits).length)
    expect(showcaseOutfits.find((o) => o.clothing === 188)?.motions).toContain('999')
  })

  it('pairs each outfit with the ultimates its own art plays', () => {
    expect(showcaseOutfits.find((o) => o.clothing === 170)?.ultimates).toContain(2270)
    expect(showcaseOutfits.find((o) => o.clothing === 188)?.ultimates).toEqual([])
  })
})

describe('outfitReplay', () => {
  it('has the outfit attack the dummy, take a hit back, then cast each ultimate', () => {
    const { replay, defenderLooks } = outfitReplay({ clothing: 170, ultimates: [2270] }, player)
    expect(replay.fighters).toHaveLength(2)
    expect(defenderLooks).toHaveLength(1)
    const strikes = replay.events.filter((e) => e.event === 14)
    expect(strikes.map((e) => [e.actor, e.target, e.skillId])).toEqual([
      [0, 1, 1],
      [1, 0, 1],
      [0, 1, 2270],
    ])
  })
})

describe('outfit names', () => {
  it('names every outfit by its clothing id, not by 2011 AvatarID', () => {
    expect(outfitName(3)).toBe('Ggio Vega')
    expect(outfitName(77)).toBe('Aaroniero Arruruerie')
    expect(outfitName(103)).toBe('Kakuzu')
    expect(outfitName(188)).toBe('Hashirama Senju')
    const unnamed = showcaseOutfits.filter((o) => /^Outfit \d+$/.test(outfitName(o.clothing)))
    expect(unnamed.map((o) => o.clothing)).toEqual([])
  })
})
