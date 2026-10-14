import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  arenaConfig,
  arenaHonorShop,
  arenaTier,
  arenaTiers,
  item,
  itemNameKey,
  mailConfig,
  MAIL_CATEGORIES,
  marketCategories,
  marketCategoryKey,
  npc,
  rankings,
  rebornBloodlines,
  rebornCards,
  rebornEvents,
  rebornKennelShop,
  rebornPetFoods,
  rebornPets,
  rebornPetSkills,
  rebornNonfightBuffs,
  rebornScrollSkills,
  rebornSouls,
  rebornTalents,
  rebornWingLines,
  rebornWings,
  skill,
  subTasks,
  task,
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

describe('Reborn overlay (M5 task 1)', () => {
  const dir = fileURLToPath(new URL('../../data/game/', import.meta.url))
  const base = (name: string) =>
    JSON.parse(readFileSync(`${dir}${name}.json`, 'utf8')) as Record<string, unknown>
  const overlay = (name: string) => base(`reborn/${name}`)

  it('validates and counts every overlay file', () => {
    expect(rebornTalents().talents).toHaveLength(8)
    expect(rebornTalents().costs).toHaveLength(80)
    expect(rebornBloodlines().limits).toHaveLength(44)
    expect(rebornSouls().types).toHaveLength(13)
    expect(Object.keys(rebornScrollSkills())).toHaveLength(12)
    expect(Object.keys(rebornNonfightBuffs().buffs)).toEqual(['80101', '80102', '80201', '80202'])
    expect(rebornEvents().weekly.activities.reduce((sum, a) => sum + a.points, 0)).toBe(245)
  })

  it('merges scroll skills into skill() and scroll items into item()', () => {
    expect(skill(1831)).toMatchObject({ type: 2, quomodo: 2, skilladdtype: 8, probability: 3 })
    expect(skill(18042)).toMatchObject({ type: 1, quomodo: 2, skilladdtype: 2 })
    expect(skill(1802)).toMatchObject({ javascript: 'skill/skill_luolei_1802.js' })
    expect(item('i540001')).toMatchObject({ CanUse: 1, AddSkillId: 1831, ScrollDays: 7 })
    expect(item('i540112')).toMatchObject({ CanUse: 1, AddSkillId: 18046, ScrollDays: 0 })
    expect(itemNameKey('i540001')).toBe('lg_reborn_item_540001')
    expect(item('i250115')).toBeDefined()
  })

  it('keeps the task hooks working with an empty quest overlay', () => {
    expect(task(10001)).toBeDefined()
    expect(subTasks(10001).length).toBeGreaterThan(0)
  })

  it('never reuses an original skill, fight buff, item or task id', () => {
    const clash = (name: string, ids: string[]) => {
      const original = base(name)
      return ids.filter((id) => id in original)
    }
    expect(clash('skills', Object.keys(overlay('skills')))).toEqual([])
    expect(clash('fight-buffs', Object.keys(overlay('skills')))).toEqual([])
    expect(clash('items', Object.keys(overlay('items')))).toEqual([])
    expect(clash('tasks', Object.keys(overlay('tasks')))).toEqual([])
  })

  it('overrides only the original Dice of Fate buffs (same ids and flags, decision 25)', () => {
    const original = JSON.parse(
      readFileSync(new URL('./nonfight-buff-data.json', import.meta.url), 'utf8'),
    ) as { buffs: Record<string, unknown>; properties: Record<string, Record<string, number>> }
    const { buffs, properties } = rebornNonfightBuffs()
    for (const [id, row] of Object.entries(buffs)) {
      expect(row).toEqual(original.buffs[id])
      expect(Object.keys(properties[id]!).sort()).toEqual(
        Object.keys(original.properties[id]!).sort(),
      )
    }
  })

  it('only points at items that exist', () => {
    const events = rebornEvents()
    const ids = [
      ...rebornBloodlines().limits.flatMap((limit) => [limit.unlockItem, limit.npcOutfit]),
      ...events.dailyLogin.cycle.map((reward) => reward.item),
      events.dailyLogin.bonus.item,
      ...events.weekly.weekdayRewards.map((reward) => reward.item),
      events.weekly.bonus.item,
      ...events.weekly.milestones.flatMap((m) => (m.item ? [m.item] : [])),
      ...events.tailedBeast.boxes.map((box) => box.item),
      ...events.tailedBeast.kageChoices,
      ...events.tailedBeast.shop.map((offer) => offer.item),
      ...events.teamStone.leagues.flatMap((league) => (league.item ? [league.item] : [])),
    ]
    expect(ids.filter((id) => !item(id))).toEqual([])
  })
})

describe('Reborn overlay (M6 task 2)', () => {
  it('validates and counts every M6 file', () => {
    expect(rebornPets()).toHaveLength(190)
    expect(rebornPets().filter((pet) => pet.parent)).toHaveLength(74)
    expect(rebornPetSkills().books).toHaveLength(50)
    expect(rebornPetFoods().foods).toHaveLength(15)
    const wings = rebornWings()
    expect(wings.wings.length + wings.auras.length).toBe(26)
    expect(Object.keys(rebornWingLines())).toHaveLength(18)
    for (const levels of Object.values(rebornWingLines())) expect(levels).toHaveLength(31)
    const cards = rebornCards()
    expect(cards.boxes).toHaveLength(5)
    expect(cards.collections).toHaveLength(10)
    expect(cards.collections.flatMap((c) => c.cards)).toHaveLength(74)
    expect(rebornKennelShop().offers).toHaveLength(7)
  })

  it('merges pets, wings, stones, talismans, boxes and books into item()', () => {
    expect(item('i320002')).toMatchObject({ class: 'PetItem', CanUse: 1, PetNat: 2 })
    expect(item('i218000')).toMatchObject({
      class: 'EquipItem',
      EquipType: 'Wing',
      WingLine: 10000,
    })
    expect(item('i218207')).toMatchObject({ EquipType: 'Wing', BattleAura: 'eight_gates' })
    expect(item('i218021')).toMatchObject({ class: 'WingStone', LevelJump: 1 })
    expect(item('i218030')).toMatchObject({ TalismanFamily: 'integrity' })
    expect(item('i218040')).toMatchObject({ TalismanFamily: 'safety' })
    expect(item('i171005')).toMatchObject({ class: 'CardBox', CanUse: 1, CardRarity: 'GOLD' })
    expect(itemNameKey('i218000')).toBe('lg_reborn_item_218000')
    // 2011 rows stay: foods and the books Reborn did not change.
    expect(item('i170114')).toMatchObject({ PetFeedType: 3, AddPetHunger: 5 })
    expect(item('i180035')).toMatchObject({ AddPetSkillId: 50020 })
  })

  it('only points at items, skills and lines that exist', () => {
    const skills = rebornPetSkills()
    const omitted = new Set(skills.omitted.map((o) => o.skill))
    for (const book of skills.books) {
      expect(item(book.item)?.AddPetSkillId, book.item).toBe(book.skill)
      if (!omitted.has(book.skill)) expect(skills.skills[String(book.skill)]).toBeDefined()
    }
    for (const pet of rebornPets()) {
      expect(item(pet.item), pet.item).toBeDefined()
      if (pet.parent) expect(item(pet.parent)).toBeDefined()
    }
    const ids = [
      ...rebornPetFoods().foods.map((food) => food.item),
      ...rebornKennelShop().offers.map((offer) => offer.item),
      rebornKennelShop().currency,
      ...rebornCards().boxes.map((box) => box.item),
    ]
    expect(ids.filter((id) => !item(id))).toEqual([])
    const lines = rebornWingLines()
    const { wings, auras } = rebornWings()
    for (const wing of [...wings, ...auras]) expect(lines[String(wing.line)]).toBeDefined()
  })
})
