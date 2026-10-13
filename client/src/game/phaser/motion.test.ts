import { describe, expect, it } from 'vitest'
import { fighterLooks, lookArt, monsterArt, outfitArt } from './motion'

const fighters = (...sides: ('attackers' | 'defenders')[]) => sides.map((side) => ({ side }))

describe('fighterLooks', () => {
  it('gives every attacker the attacker outfit and defenders their looks in order', () => {
    const me = { clothing: 3, weaponItemId: 'i1' }
    expect(
      fighterLooks(fighters('attackers', 'defenders', 'defenders'), me, [
        { clothing: 2 },
        { npcId: 'n33017' },
      ]),
    ).toEqual([me, { clothing: 2 }, { npcId: 'n33017' }])
  })

  it('leaves a defender without a look as unknown monster art', () => {
    expect(fighterLooks(fighters('attackers', 'defenders'), { clothing: 3 }, [])).toEqual([
      { clothing: 3 },
      { npcId: '' },
    ])
  })
})

describe('lookArt', () => {
  it('draws outfits as outfit art and npcs as monster art', () => {
    expect(lookArt({ clothing: 2 })).toEqual(outfitArt(2))
    expect(lookArt({ npcId: 'n300111' })).toEqual(monsterArt('n300111'))
  })

  it('falls back to the default outfit when the backup has no art for it', () => {
    expect(lookArt({ clothing: 999_999 })).toEqual(outfitArt(1))
  })
})
