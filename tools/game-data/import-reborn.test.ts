import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { passRowFromTooltip } from './import-reborn-m6.ts'
import {
  buildOutfits,
  buildReborn,
  defaultPetIniDir,
  defaultRawDir,
  M5_REVIEWED,
  mapStat,
  mergeNames,
  readRaw,
  STAT_FIELDS,
} from './import-reborn.ts'

const root = resolve(import.meta.dirname, '../..')
const json = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const reborn = <T>(name: string) => json<T>(`server/data/game/reborn/${name}.json`)

type Bonus = { stat: number; field: string; value: number }
type Limit = { id: number; nameKey: string; npcNameKey: string; bonus: Bonus[] }
type Bloodlines = { limits: Limit[]; stats: Record<string, { label: string; field: string }> }
type SoulType = { id: number; nameKey: string; stat: number; field: string; valueByLevel: number[] }
type Souls = { types: SoulType[]; levelLimits: number[] }
type Talents = {
  talents: { id: number; nameKey: string }[]
  costs: [number, number][]
  expNeeded: number[]
}

describe('mapStat (decision 11)', () => {
  it('scales attributes x100 and keeps combat ratings 1:1', () => {
    expect(mapStat(1, 30)).toEqual({ stat: 1, field: 'strength', value: 3000 })
    expect(mapStat(17, 43)).toEqual({ stat: 17, field: 'tough', value: 43 })
    expect(mapStat(9, 37)).toEqual({ stat: 9, field: 'hpMul', value: 37 })
    expect(mapStat(31, 3)).toEqual({ stat: 31, field: 'skillAdd0', value: 3 })
  })

  it('fails loudly on a stat id it does not know', () => {
    expect(() => mapStat(14, 10)).toThrow(/Unknown Reborn stat id 14/)
    expect(() => mapStat(99, 1)).toThrow(/Unknown Reborn stat id 99/)
  })
})

describe('generated overlay (server/data/game/reborn)', () => {
  it('has 8 talents, 80 cost rows and 60 EXP steps', () => {
    const talents = reborn<Talents>('talents')
    expect(talents.talents.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(talents.costs).toHaveLength(80)
    expect(talents.costs[0]).toEqual([2, 10000])
    expect(talents.costs[9]).toEqual([11, 5120000])
    expect(talents.costs.slice(0, 40).reduce((sum, [gold]) => sum + gold, 0)).toBe(584)
    expect(talents.expNeeded).toHaveLength(60)
    expect(talents.expNeeded.slice(0, 3)).toEqual([100, 240, 410])
  })

  it('has 44 limits whose bonus ids are all mapped', () => {
    const { limits } = reborn<Bloodlines>('bloodlines')
    expect(limits).toHaveLength(44)
    const ids = new Set(limits.flatMap((limit) => limit.bonus.map((b) => b.stat)))
    expect(ids.size).toBe(24)
    for (const id of ids) expect(STAT_FIELDS[id]).toBeDefined()
    expect(limits[0]).toMatchObject({
      requiredLevel: 16,
      unlockItem: 'i148023',
      amity: 30,
      npcId: 81001,
      npcOutfit: 'i290016',
      base: { strength: 2300, agility: 1100, stamina: 2300 },
      bonus: [
        { stat: 36, field: 'skillAdd5', value: 2 },
        { stat: 17, field: 'tough', value: 43 },
        { stat: 1, field: 'strength', value: 3000 },
      ],
    })
  })

  it('has 13 soul types with level limits clamped to 90 (decision 13)', () => {
    const souls = reborn<Souls>('souls')
    expect(souls.types).toHaveLength(13)
    for (const type of souls.types) expect(type.valueByLevel).toHaveLength(11)
    expect(souls.levelLimits).toEqual([25, 25, 25, 36, 36, 51, 71, 71, 90, 90])
    expect(souls.types.map((t) => t.field)).toEqual([
      'defense',
      'neglectDefense',
      'dodge',
      'hit',
      'crit',
      'tough',
      'hp',
      'mp',
      'pierce',
      'parry',
      'minAttack',
      'maxAttack',
      'atkTimeMul',
    ])
  })

  it('has 12 scroll skills and 24 scroll items (7-day and permanent)', () => {
    const skills = reborn<Record<string, { type: number; probability: number }>>('skills')
    expect(Object.keys(skills).map(Number)).toEqual([
      1831, 1833, 1834, 1835, 1836, 18041, 18042, 18043, 18044, 18045, 18046, 18091,
    ])
    const items =
      reborn<Record<string, { CanUse: number; AddSkillId: number; Name: string; class: string }>>(
        'items',
      )
    const scrolls = Object.entries(items).filter(([, row]) => row.class === 'SkillScrollItem')
    expect(scrolls).toHaveLength(24)
    expect(items.i540001).toMatchObject({ CanUse: 1, AddSkillId: 1831, ScrollDays: 7 })
    expect(items.i540101).toMatchObject({ CanUse: 1, AddSkillId: 1831, ScrollDays: 0 })
    for (const [id, row] of Object.entries(items))
      expect(row.Name).toBe(`reborn_item_${id.slice(1)}`)
    for (const [, row] of scrolls) expect(skills[String(row.AddSkillId)]).toBeDefined()
  })

  it('has the four Dice of Fate buffs', () => {
    const buffs = reborn<{ buffs: Record<string, unknown>; properties: Record<string, unknown> }>(
      'nonfight-buffs',
    )
    expect(Object.keys(buffs.buffs)).toEqual(['80101', '80102', '80201', '80202'])
    expect(buffs.properties['80101']).toMatchObject({ ToughBuff: 211, DodgeMulBuff: 163 })
    expect(buffs.properties['80202']).toMatchObject({ ToughBuff: -802, DefenseBuff: -620 })
  })

  it('names every talent, limit, soul, scroll skill, scroll item and Ninja House NPC', () => {
    const names = json<Record<string, string>>('client/src/i18n/reborn.json')
    const keys = [
      ...reborn<Talents>('talents').talents.map((t) => t.nameKey),
      ...reborn<Bloodlines>('bloodlines').limits.flatMap((l) => [l.nameKey, l.npcNameKey]),
      ...reborn<Souls>('souls').types.map((t) => t.nameKey),
      ...Object.keys(reborn('skills')).map((id) => `lg_Skill_${id}`),
      ...Object.keys(reborn('items')).map((id) => `lg_reborn_item_${id.slice(1)}`),
    ]
    expect(keys.filter((key) => !names[key])).toEqual([])
    const glossary = json<Record<string, { en: string }>>('tools/i18n/glossary.json')
    expect(keys.filter((key) => glossary[key]?.en !== names[key])).toEqual([])
    expect(Object.values(names).filter((name) => /\p{Extended_Pictographic}/u.test(name))).toEqual(
      [],
    )
  })
})

type Pet = {
  item: string
  nameKey: string
  avatar: number
  artAvatar: number | null
  nature: number
  food: number
  requiredLevel: number
  parent: string | null
  link: string | null
  growth: number
  base: Record<string, number>
  foodMul: number[]
  skillWeights: Record<string, number>
  pool: Record<'halo' | 'help' | 'pass', number[]>
  depot: { skill: number; mul: number }[]
}
type PetSkills = {
  skills: Record<string, { kind: number; source: string; skillAdd: Record<string, number> | null }>
  omitted: { skill: number }[]
  books: { item: string; rebornItem: string; skill: number; kind: number; reuse: boolean }[]
}
type Wings = {
  wings: { item: string; line: number; bonus: number; wingSprite: string }[]
  auras: { item: string; line: number; battleAura: string }[]
  stones: { item: string; levelJump: number }[]
  talismans: { item: string; family: string; value: number }[]
}
type Cards = {
  boxes: { item: string; rarity: string }[]
  collections: {
    id: number
    nameKey: string
    rarity: string
    box: string
    cards: { id: number; nameKey: string; name: string }[]
  }[]
}

describe('Reborn outfits (serverConfig.avatars, avatarStars)', () => {
  const avatar = (art: number, skills: number[], weaponType?: string) => ({
    value: 42,
    ...(weaponType && { weaponType }),
    innate: { avatar: art, isv: [1.2, 0.65, 3.1], bmv: [13, 15, 11], skills },
  })
  const items = {
    i290001: { class: 'AvatarItem', AvatarLevel: 1, Clothing: 1 },
    i290093: { class: 'AvatarItem', AvatarLevel: 1, Clothing: 93 },
  }

  const items3 = { ...items, i290003: { class: 'AvatarItem', AvatarLevel: 1, Clothing: 3 } }

  it('keys Reborn 29xxxx by our clothing when its art is that clothing, in hundredths', () => {
    const config = {
      avatarStars: { maxStars: 5 },
      avatars: {
        '290001': avatar(1, [10000, 7777, 2002], 'Blunt'),
        // Reborn reuses 290093 for another outfit's art: not our clothing 93.
        '290093': avatar(10, [10000, 7777, 2052]),
        '290121': avatar(121, [10000, 7777, 2012]),
      },
    } as unknown as Parameters<typeof buildOutfits>[0]
    expect(buildOutfits(config, items)).toEqual({
      stars: { maxStars: 5 },
      outfits: {
        '1': {
          rebornItem: 290001,
          value: 42,
          isv: [120, 65, 310],
          bmv: [1300, 1500, 1100],
          imprint: 2002,
          weaponType: 'Blunt',
        },
      },
    })
  })

  it("reads a missing weaponType as Any, like Reborn's client", () => {
    const config = {
      avatarStars: { maxStars: 5 },
      avatars: { '290003': avatar(3, [10000, 7777, 2040]) },
    } as unknown as Parameters<typeof buildOutfits>[0]
    expect(buildOutfits(config, items3).outfits['3']?.weaponType).toBe('Any')
  })

  it('has the star rules and Ichigo as Reborn ships them', () => {
    const data = reborn<{ stars: Record<string, number>; outfits: Record<string, unknown> }>(
      'outfits',
    )
    expect(data.stars).toMatchObject({
      maxStars: 5,
      requiredEnhancement: 32,
      oneStarIsvBonusPercent: 5,
    })
    expect(data.outfits['1']).toEqual({
      rebornItem: 290001,
      value: 42,
      isv: [120, 120, 120],
      bmv: [1300, 1500, 1100],
      imprint: 2002,
      weaponType: 'Sharp',
    })
    expect(Object.keys(data.outfits)).toHaveLength(111)
  })
})

describe('M6 overlay: pets, pet skills, foods (task 2)', () => {
  const pets = reborn<Pet[]>('pets')
  const petSkills = reborn<PetSkills>('pet-skills')

  it('has 190 species and 74 families whose parents are species', () => {
    expect(pets).toHaveLength(190)
    expect(pets.at(-1)).toMatchObject({ item: 'i340710', nature: 5 })
    const items = new Set(pets.map((p) => p.item))
    const evolved = pets.filter((p) => p.parent)
    expect(evolved).toHaveLength(74)
    for (const pet of evolved) expect(items.has(pet.parent!)).toBe(true)
  })

  it('carries the Reborn required level (item field 1) of every species (11b)', () => {
    const count = (level: number) => pets.filter((p) => p.requiredLevel === level).length
    expect([count(30), count(40), count(50)]).toEqual([173, 16, 1])
    expect(pets.find((p) => p.requiredLevel === 50)!.parent).toBeNull()
    // The same field is the Synthesis Value Reborn's tooltip shows.
    const rows = reborn<Record<string, { JudgeValueScore: number }>>('items')
    for (const pet of pets) expect(rows[pet.item]!.JudgeValueScore).toBe(pet.requiredLevel)
  })

  it('links Reborn 3200NN to 2011 i2830NN with the 2011 growth (decision 9)', () => {
    const byItem = new Map(pets.map((p) => [p.item, p]))
    expect(byItem.get('i320002')).toMatchObject({ link: 'i283002', growth: 120 })
    expect(byItem.get('i320030')).toMatchObject({ link: 'i283030', growth: 160 })
    expect(byItem.get('i320015')!.pool.halo).toEqual([
      40062, 40082, 40083, 40084, 40106, 40108, 40110, 40113,
    ])
    expect(pets.filter((p) => p.link)).toHaveLength(26)
  })

  it('resolves all 11 explore pet bonuses (PetBonusAppend) to a Reborn species', () => {
    const spots = json<Record<string, { PetBonusAppend?: string }>>(
      'server/data/game/explore-spots.json',
    )
    const bonuses = new Set(Object.values(spots).flatMap((s) => s.PetBonusAppend ?? []))
    expect(bonuses.size).toBe(11)
    const linked = new Set(pets.map((p) => p.link))
    expect([...bonuses].filter((id) => !linked.has(id))).toEqual([])
  })

  it('gives unlinked species our growth by nature, +20 when evolved', () => {
    const unlinked = pets.filter((p) => !p.link)
    const expected: Record<number, number> = { 1: 100, 2: 100, 3: 100, 4: 120, 5: 150, 6: 120 }
    for (const pet of unlinked) {
      expect(pet.growth, pet.item).toBe(expected[pet.nature]! + (pet.parent ? 20 : 0))
    }
  })

  it('pools only skills of the matching kind, and every species can learn each kind', () => {
    const kinds = { halo: 1, help: 2, pass: 3 } as const
    for (const pet of pets) {
      for (const [kind, ids] of Object.entries(pet.pool)) {
        expect(ids.length, `${pet.item} ${kind}`).toBeGreaterThan(0)
        for (const id of ids) {
          expect(petSkills.skills[String(id)]?.kind, `${pet.item} ${id}`).toBe(
            kinds[kind as keyof typeof kinds],
          )
        }
      }
      expect(pet.foodMul).toHaveLength(6)
      expect(Object.keys(pet.base)).toEqual(['attack', 'defence', 'disturb', 'active', 'savvy'])
    }
  })

  it('records the art to use: own, else the family base, else the icon only (answer 5)', () => {
    const art = pets.filter((p) => p.artAvatar === p.avatar)
    expect(art).toHaveLength(156)
    for (const pet of pets.filter((p) => p.artAvatar !== p.avatar)) {
      const parent = pets.find((p) => p.item === pet.parent)
      expect(pet.artAvatar).toBe(
        parent && parent.artAvatar === parent.avatar ? parent.avatar : null,
      )
    }
  })

  it('has every ispet skill, Reborn-only Pass rows and 50 books (decisions 14, 16)', () => {
    const rows = Object.entries(petSkills.skills)
    expect(rows.filter(([, r]) => r.source === '2011')).toHaveLength(148)
    const reborn = rows.filter(([, r]) => r.source === 'reborn')
    expect(reborn.length + petSkills.omitted.length).toBe(31)
    expect(petSkills.skills['50056']).toMatchObject({ kind: 3, skillAdd: { PierceSkill: 130 } })
    expect(petSkills.skills['50060']).toMatchObject({ skillAdd: { MaxHPMulSKill: 200 } })
    expect(petSkills.skills['50086']).toMatchObject({ skillAdd: { StrengthSkill: 28500 } })
    expect(petSkills.skills['50057']).toMatchObject({ skillAdd: { AtkTimeMulSkill: 200 } })
    expect(petSkills.skills['50071']).toMatchObject({ skillAdd: { AtkTimeMulSkill: 250 } })
    expect(petSkills.omitted).toEqual([])
    expect(petSkills.books).toHaveLength(50)
    const omitted = new Set(petSkills.omitted.map((o) => o.skill))
    for (const book of petSkills.books) {
      const row = petSkills.skills[String(book.skill)]
      if (!omitted.has(book.skill)) expect(row?.kind, book.item).toBe(book.kind)
    }
  })

  it('has the 15 foods, the 4 Home crops and the 2011 pet tables (decisions 10, 13, 14)', () => {
    const foods = reborn<{
      foods: { item: string; hunger: number; type: number }[]
      exp: number[]
      maxLevel: number
      typeWeights: number[]
      mulWeights: number[]
      grow: Record<string, number | string>
      skillCount: number[]
      slotCost: number[]
    }>('pet-foods')
    expect(foods.foods).toHaveLength(19)
    expect(foods.foods.slice(0, 4)).toEqual([
      { item: 'i170001', hunger: 5, type: 7, level: 8 },
      { item: 'i170002', hunger: 80, type: 4, level: 8 },
      { item: 'i170003', hunger: 80, type: 4, level: 8 },
      { item: 'i170004', hunger: 180, type: 4, level: 23 },
    ])
    expect(foods.maxLevel).toBe(50)
    expect(foods.exp).toHaveLength(50)
    expect(foods.exp.slice(0, 3)).toEqual([5, 11, 25])
    expect(foods.typeWeights).toEqual([100, 100, 100, 100, 100, 100, 100])
    expect(foods.mulWeights).toEqual([90, 5, 3, 2])
    expect(foods.grow).toMatchObject({
      HungerMax: 7200,
      PetDigestTime: 7200,
      PetLockItem: 'i150406',
    })
    expect(foods.skillCount).toHaveLength(36)
    expect(foods.slotCost[7]).toBe(26000)
  })
})

describe('M6 overlay: wings, cards, Kennel shop, items (task 2)', () => {
  const wings = reborn<Wings>('wings')
  const items = reborn<Record<string, Record<string, number | string>>>('items')

  it('has 26 wing and aura items in the Wing slot and 18 lines x 31 levels', () => {
    expect(wings.wings.length + wings.auras.length).toBe(26)
    for (const { item } of [...wings.wings, ...wings.auras]) {
      expect(items[item]).toMatchObject({ EquipType: 'Wing', class: 'EquipItem' })
    }
    const lines =
      reborn<Record<string, { stat: number; field: string; value: number }[][]>>('wing-lines')
    expect(Object.keys(lines)).toHaveLength(18)
    for (const levels of Object.values(lines)) expect(levels).toHaveLength(31)
    for (const wing of [...wings.wings, ...wings.auras]) expect(lines[wing.line]).toBeDefined()
    expect(lines['10000']![0]).toEqual([
      { stat: 8, field: 'hp', value: 80 },
      { stat: 7, field: 'hit', value: 42 },
      { stat: 5, field: 'neglectDefense', value: 46 },
      { stat: 24, field: 'decDamage', value: 1.2 },
    ])
  })

  it('maps every WING stat id (decision 23)', () => {
    for (const id of [8, 15, 21, 23, 24]) expect(STAT_FIELDS[id]).toBeDefined()
    expect(STAT_FIELDS[21]!.field).toBe('counter')
    expect(STAT_FIELDS[23]!.field).toBe('vampiricHp')
  })

  it('has stones and talismans named by the locale (answer 2)', () => {
    expect(wings.stones.map((s) => s.levelJump)).toEqual([1, 1, 3, 4])
    const family = (item: string) => wings.talismans.find((t) => t.item === item)?.family
    expect(family('i218030')).toBe('integrity')
    expect(family('i218040')).toBe('safety')
    expect(family('i218050')).toBe('luck')
    expect(wings.talismans).toHaveLength(15)
  })

  it('has 74 cards in 10 collections and 5 boxes', () => {
    const cards = reborn<Cards>('cards')
    expect(cards.boxes.map((b) => b.rarity)).toEqual(['GREEN', 'BLUE', 'PURPLE', 'RED', 'GOLD'])
    expect(cards.collections).toHaveLength(10)
    const all = cards.collections.flatMap((c) => c.cards)
    expect(all.map((c) => c.id)).toEqual(Array.from({ length: 74 }, (_, i) => i + 1))
    expect(cards.collections[0]!.cards[0]!.name).toBe('Hidden Land')
    for (const c of cards.collections) expect(items[c.box]).toMatchObject({ class: 'CardBox' })
  })

  it('sells the decision 21 items for Feathers', () => {
    const shop = reborn<{
      currency: string
      offers: { item: string; price: number; level: number }[]
    }>('kennel-shop')
    expect(shop.currency).toBe('i150319')
    expect(shop.offers.map((o) => o.price)).toEqual([1, 2, 3, 3, 6, 6, 100])
    expect(shop.offers.map((o) => o.level)).toEqual([8, 23, 8, 8, 23, 23, 1])
  })

  it('never reuses a 2011 item, skill or fight buff id', () => {
    const original = (name: string) =>
      json<Record<string, unknown>>(`server/data/game/${name}.json`)
    const originalItems = original('items')
    expect(Object.keys(items).filter((id) => id in originalItems)).toEqual([])
    const rebornSkills = Object.entries(reborn<PetSkills>('pet-skills').skills)
      .filter(([, row]) => row.source === 'reborn')
      .map(([id]) => id)
    for (const name of ['skills', 'skill-adds', 'fight-buffs']) {
      const ids = original(name)
      expect(
        rebornSkills.filter((id) => id in ids),
        name,
      ).toEqual([])
    }
  })

  it('names every new item, Reborn pet skill, card and collection', () => {
    const names = json<Record<string, string>>('client/src/i18n/reborn.json')
    const cards = reborn<
      Cards & { collections: { nameKey: string; cards: { nameKey: string }[] }[] }
    >('cards')
    const keys = [
      ...Object.values(items).map((row) => `lg_${row.Name}`),
      ...Object.entries(reborn<PetSkills>('pet-skills').skills)
        .filter(([, row]) => row.source === 'reborn')
        .map(([id]) => `lg_Skill_${id}`),
      ...cards.collections.flatMap((c) => [c.nameKey, ...c.cards.map((card) => card.nameKey)]),
    ]
    expect(keys.filter((key) => !names[key])).toEqual([])
    expect(Object.values(names).filter((name) => name.includes('[['))).toEqual([])
  })
})

describe('mergeNames', () => {
  it('keeps reviewed names, adds missing ones and overwrites only owned keys', () => {
    const merged = mergeNames(
      { a: 'Reviewed', b: 'Old M6', q: 'Quest' },
      { a: 'Raw', b: 'New M6', c: 'Added' },
      new Set(['b']),
    )
    expect(merged).toEqual({ a: 'Reviewed', b: 'New M6', c: 'Added', q: 'Quest' })
  })
})

describe('passRowFromTooltip (decision 16)', () => {
  it('reads flat, percent and attribute values', () => {
    expect(passRowFromTooltip(['x: Increase block bypass by 130.'])).toEqual({ PierceSkill: 130 })
    expect(passRowFromTooltip(['x: Increase max health by 13.5%.'])).toEqual({ MaxHPMulSKill: 135 })
    expect(passRowFromTooltip(['x: Increase strength by 285.'])).toEqual({ StrengthSkill: 28500 })
    expect(passRowFromTooltip(['x: Increase max attack by 33.6.'])).toEqual({ MaxAtkSkill: 33 })
  })

  it('returns null without a value and fails on an unknown stat', () => {
    expect(passRowFromTooltip(['x: Increase speed by @1@%.'])).toBeNull()
    expect(() => passRowFromTooltip(['x: Increase luck by 3.'])).toThrow(/Unknown Reborn pet skill/)
  })
})

describe('stat id check against our element trees (task 1)', () => {
  const skills = json<Record<string, { skilladd?: number }>>('server/data/game/skills.json')
  const skillAdds = json<Record<string, Record<string, number>>>('server/data/game/skill-adds.json')
  const names = json<Record<string, string>>('client/src/i18n/skills-and-titles.json')
  // The element cast-chance passives 2801-2810 (one per SkillAdd tree) name each tree.
  const treeName = (tree: number) => {
    const passive = [2801, 2802, 2803, 2804, 2805, 2806, 2807, 2808, 2809, 2810].find(
      (id) => skillAdds[String(skills[String(id)]?.skilladd)]?.[`SkillAdd${tree}Skill`],
    )
    return names[`lg_Skill_${passive}`] ?? ''
  }
  const SYNONYM: Record<string, string> = { Lightning: 'Thunder' }

  it('maps Reborn ids 31-40 to the SkillAdd tree of the same element', () => {
    const { stats } = reborn<Bloodlines>('bloodlines')
    for (let id = 31; id <= 40; id++) {
      const { label, field } = stats[String(id)]!
      const element = label.split(' ')[0]!
      const tree = Number(field.replace('skillAdd', ''))
      expect(treeName(tree), `stat ${id} ${label}`).toContain(SYNONYM[element] ?? element)
    }
  })

  it('reads stat 18 as Block: the Guard soul uses it with the same ladder as Dodge', () => {
    const { types } = reborn<Souls>('souls')
    const guard = types.find((t) => t.stat === 18)!
    const deft = types.find((t) => t.stat === 6)!
    expect(guard.field).toBe('parry')
    expect(guard.valueByLevel).toEqual(deft.valueByLevel)
    expect(STAT_FIELDS[18]).toEqual({ field: 'parry', scale: 1 })
  })
})

describe.skipIf(!existsSync(defaultRawDir) || !existsSync(defaultPetIniDir))(
  'buildReborn on the local raw data',
  () => {
    it('reproduces the committed overlay (M5 files are reviewed and kept)', () => {
      const out = buildReborn(readRaw(defaultRawDir))
      for (const [name, data] of Object.entries(out.files)) {
        if (!M5_REVIEWED.has(name)) expect(data, name).toEqual(reborn(name))
      }
      const names = json<Record<string, string>>('client/src/i18n/reborn.json')
      for (const key of out.m6Names) expect(names[key], key).toBe(out.names[key])
    })

    it('rejects a limit with an unknown bonus id', () => {
      const raw = readRaw(defaultRawDir)
      const limits = structuredClone(raw.serverConfig.bloodline.Limits)
      limits['1']!.bonus[0] = [77, 5]
      expect(() =>
        buildReborn({
          ...raw,
          serverConfig: {
            ...raw.serverConfig,
            bloodline: { ...raw.serverConfig.bloodline, Limits: limits },
          },
        }),
      ).toThrow(/Unknown Reborn stat id 77/)
    })
  },
)

describe('Sharpness placeholders (ours)', () => {
  it.each([
    [50057, 200],
    [50071, 250],
  ])('resolves book %i to its marked speed value', (id, value) => {
    expect(passRowFromTooltip(['Increase speed by @1@%.'], id)).toEqual({ AtkTimeMulSkill: value })
  })
  it('keeps unknown placeholders omitted', () => {
    expect(passRowFromTooltip(['Increase speed by @1@%.'], 59999)).toBeNull()
  })
})
