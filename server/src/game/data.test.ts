import { describe, expect, it } from 'vitest'
import {
  arenaConfig,
  arenaHonorShop,
  arenaTier,
  arenaTiers,
  item,
  mailConfig,
  MAIL_CATEGORIES,
  marketCategories,
  marketCategoryKey,
  npc,
  rankings,
  tollGateRankReward,
} from './data.js'

describe('arena data (M4)', () => {
  it('has 22 tiers with 20 opponents each, every one an existing NPC', () => {
    const tiers = arenaTiers()
    expect(tiers).toHaveLength(22)
    for (const tier of tiers) expect(tier.npcs).toHaveLength(20)
    const missing = tiers.flatMap((tier) => tier.npcs).filter((id) => !npc(id))
    expect(missing).toEqual([])
    expect(new Set(tiers.flatMap((tier) => tier.npcs)).size).toBe(374)
  })

  it('keeps the first, a middle and the top tier as in pvp-rankings.md 2.1', () => {
    expect(arenaTier(0)).toMatchObject({
      beginscore: 93500,
      endscore: 94900,
      honor: 9,
      ranknpchonor: 0,
      item0: 61,
      item3: 91,
      HonorExp: { honor: 90, exp: 70 },
    })
    expect(arenaTier(0)?.npcs.slice(18)).toEqual(['n320319', 'n310019'])
    expect(arenaTier(12)).toMatchObject({ beginscore: 213000, honor: 21, ranknpchonor: 2200 })
    expect(arenaTier(21)).toMatchObject({
      beginscore: 339000,
      endscore: -1,
      honor: 33,
      ranknpchonor: 3100,
      HonorExp: { honor: 330, exp: 18000 },
    })
    expect(arenaTier(21)?.npcs.slice(18)).toEqual(['n320529', 'n310229'])
    expect(arenaTier(22)).toBeUndefined()
  })

  it('keeps compete.ini', () => {
    expect(arenaConfig()).toMatchObject({
      initscore: 93500,
      competemaxcount: 20,
      competemaxcountGold: 15,
      onemoney: 8,
      backmoney: 10,
      competefriendfightcount: 10,
      friendonemoney: 2,
      refurbishtime: 3600,
      refurbishmoney: 20,
      savaselffightcount: 15,
      competerank: 2,
    })
  })

  it('sells 36 Honor shop armours, all existing items', () => {
    const shop = arenaHonorShop()
    expect(Object.keys(shop)).toHaveLength(36)
    expect(Object.keys(shop).filter((id) => !item(id))).toEqual([])
    expect(shop.i292101).toEqual({ c1: 79, c2: 20, c3: 1, c4: 0, honor: 180, rank: 0 })
    expect(shop.i295124).toMatchObject({ honor: 200, rank: 12 })
  })
})

describe('weekly toll gate rank rewards (M4)', () => {
  it('has 50 places for 16 gates', () => {
    const gates = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => 100000 + n),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => 100020 + n),
    ]
    for (let place = 1; place <= 50; place++) {
      for (const gate of gates) expect(tollGateRankReward(gate, place)).toBeDefined()
    }
    expect(tollGateRankReward(100001, 51)).toBeUndefined()
    expect(tollGateRankReward(100000, 1)).toBeUndefined()
  })

  it('pays rank 1 and rank 50 as in pvp-rankings.md 7', () => {
    expect(tollGateRankReward(100001, 1)).toEqual({
      exp: 6000,
      capitalType: 0,
      money: 16908,
      item: 0,
    })
    expect(tollGateRankReward(100008, 1)).toMatchObject({ exp: 92000, money: 28986 })
    expect(tollGateRankReward(100001, 50)).toMatchObject({ exp: 848, money: 2391 })
    expect(tollGateRankReward(100008, 50)).toMatchObject({ exp: 13009, money: 4098 })
  })
})

describe('rankings (M4)', () => {
  it('only has the lists of decision 13 and the 8 ranked toll gates', () => {
    const { lists, tollGates } = rankings()
    expect(lists.map(({ ID, key }) => [ID, key])).toEqual([
      [0, 'level'],
      [8, 'stone'],
      [10, 'lasNoches'],
      [26, 'arena'],
    ])
    expect(lists[1]).toMatchObject({ Type: 'Peringkat Arena', Name: 'Batu', label: 'Stone' })
    expect(tollGates.gates).toEqual([
      100001, 100002, 100003, 100004, 100005, 100006, 100007, 100008,
    ])
  })
})

describe('Market categories (M4)', () => {
  it('has the six top types in client order', () => {
    expect(marketCategories().map((node) => [node.Name, node.Path])).toEqual([
      [0, '0'],
      [2, '2'],
      [5, '5'],
      [3, '3'],
      [4, '4'],
      [1, '1'],
    ])
  })

  it('maps items to categories through MartType and the property count', () => {
    // Weapon class 1, level 71-80 (MartType 0_0_7): 2 / 4 properties = blue / gold.
    expect(marketCategoryKey('i250115', 2)).toBe('0_0_7_1')
    expect(marketCategoryKey('i250115', 4)).toBe('0_0_7_3')
    expect(marketCategoryKey('i250115', 1)).toBeUndefined()
    expect(marketCategoryKey('i290001')).toBe('5_0_1_2')
    expect(marketCategoryKey('i120001')).toBe('1_0_2')
    expect(marketCategoryKey('i110110')).toBeUndefined() // level 10 gem: no tree node
    expect(marketCategoryKey('i190001')).toBeUndefined() // MartType 0 is not a leaf
    expect(marketCategoryKey('missing-item')).toBeUndefined()
  })
})

describe('mail and team constants (M4)', () => {
  it('keeps the MailPropConfig lengths and 11 categories', () => {
    expect(mailConfig()).toMatchObject({ PlayerMailMaxTitleWord: 20, PlayerMailMaxTextWord: 200 })
    expect(MAIL_CATEGORIES.map(({ type }) => type)).toEqual([0, 2, 8, 10, 5, 4, 7, 6, 9, 3, 1])
  })
})
