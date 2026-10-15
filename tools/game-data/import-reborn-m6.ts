// M6 "Companions & Collection" part of the Reborn import: pets, pet skills and foods, wings and
// auras, cards and the Kennel shop, plus their item.ini overlay rows and names. Decisions cite
// .claude/plans/m6-companions.plan.md. Reborn numbers are 1:1; 2011 numbers come from the pet ini
// files of the original server (Resource/pet) and the already imported server/data/game tables.
import type { Ini } from './ini.ts'

type JsonItem = [string, ...unknown[]]
type Row = Record<string, number | string>
type Name = { key: string; kind: 'item' | 'skill' | 'title'; name: string }

export interface M6Inputs {
  items: Record<string, JsonItem>
  petFamilies: Record<string, number>
  wingLines: Record<string, [number, number][][]>
  /** Reborn main.js as text; only parsed with regular expressions, never executed. */
  mainJs: string
  /** Pet avatars with battle art (assets/entities/pets/<avatar>/data.json). */
  petArt: number[]
  /** 2011 Resource/pet/*.ini, by file name without the extension. */
  pet2011: Record<string, Ini>
  /** 2011 tables already imported into server/data/game. */
  original: {
    items: Record<string, Row>
    skills: Record<string, Row>
    skillAdds: Record<string, Record<string, number>>
  }
}

type StatMapper = (stat: number, value: number) => { stat: number; field: string; value: number }

const props = (raw: JsonItem) => (raw[7] ?? {}) as Record<string, number | string>
const level = (raw: JsonItem) => Number(raw[1])
const ids = (items: Record<string, JsonItem>, test: (id: number, raw: JsonItem) => boolean) =>
  Object.keys(items)
    .filter((id) => /^\d+$/.test(id))
    .map(Number)
    .filter((id) => test(id, items[String(id)]!))
    .sort((a, b) => a - b)

// --- Pets (decisions 8-19) --------------------------------------------------------------------

const KINDS = ['halo', 'help', 'pass'] as const
type Kind = (typeof KINDS)[number]
const iniKey = (kind: Kind) => `${kind[0]!.toUpperCase()}${kind.slice(1)}Skill`
const BASE_PROPS = ['attack', 'defence', 'disturb', 'active', 'savvy'] as const
/** Decision 9: growth of species without a 2011 link, by nature; +20 for an evolved form. */
const UNLINKED_GROWTH: Record<number, number> = { 1: 100, 2: 100, 3: 100, 4: 120, 5: 150, 6: 120 }
const EVOLVED_GROWTH = 20

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2)
}
const union = (lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b)
const iniNumbers = (section: Record<string, string | string[]> | undefined) =>
  Object.values(section ?? {}).map(Number)

/** Decision 9: Reborn 3200NN is 2011 i2830NN; linked when 2011 has its PetSrcPro row. */
function petLink(pet2011: Record<string, Ini>, id: number) {
  const link = `i283${String(id).slice(3)}`
  return id >= 320000 && id < 320100 && pet2011.PetSrcPro![link] ? link : null
}

type PetNumbers = {
  growth: number
  base: Record<string, number>
  pool: Record<Kind, number[]>
  depot: { skill: number; mul: number }[]
}

function linkedNumbers(pet2011: Record<string, Ini>, link: string): PetNumbers {
  const [growth = 0, ...bases] = iniNumbers(pet2011.PetSrcPro![link])
  const libs = pet2011.PetSkillSrc![link] ?? {}
  const pool = Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      iniNumbers(pet2011.PetSkillLib![String(libs[iniKey(kind)] ?? '')]).sort((a, b) => a - b),
    ]),
  ) as Record<Kind, number[]>
  const depot = [pet2011.PetSkillDepot![link]?.r ?? []].flat().map((line) => {
    const [skill = 0, mul = 0] = String(line).split(',').map(Number)
    return { skill, mul }
  })
  return {
    growth,
    base: Object.fromEntries(BASE_PROPS.map((prop, i) => [prop, bases[i] ?? 0])),
    pool,
    depot,
  }
}

/** Decision 9: unlinked species take the median bases and the union pools of their nature. */
function unlinkedNumbers(peers: PetNumbers[], growth: number): PetNumbers {
  const depotIds = union(peers.map((p) => p.depot.map((d) => d.skill)))
  return {
    growth,
    base: Object.fromEntries(
      BASE_PROPS.map((prop) => [prop, median(peers.map((p) => p.base[prop]!))]),
    ),
    pool: Object.fromEntries(
      KINDS.map((kind) => [kind, union(peers.map((p) => p.pool[kind]))]),
    ) as Record<Kind, number[]>,
    depot: depotIds.map((skill) => ({
      skill,
      mul: Math.max(
        ...peers.flatMap((p) => p.depot.filter((d) => d.skill === skill).map((d) => d.mul)),
      ),
    })),
  }
}

/** NewPetCfg row of the linked species; every 2011 row is the same, so the first is the default. */
function newPetCfg(pet2011: Record<string, Ini>, link: string | null) {
  const rows = pet2011.NewPetCfg!
  const row = (link && rows[link]) || Object.values(rows)[0]!
  return {
    feedType: Number(row.FeedType),
    foodMul: [0, 1, 2, 3, 4, 5].map((n) => Number(row[`FoodMul${n}`])),
    skillWeights: Object.fromEntries(
      KINDS.map((kind) => [kind, Number(row[iniKey(kind)])]),
    ) as Record<Kind, number>,
  }
}

function buildPets(input: M6Inputs) {
  const art = new Set(input.petArt)
  const species = ids(input.items, (_, raw) => String(raw[0]).startsWith('pets/')).map((id) => {
    const raw = input.items[String(id)]!
    const { avatar, nature, food } = props(raw) as { avatar: number; nature: number; food: number }
    const parent = input.petFamilies[String(id)]
    const link = petLink(input.pet2011, id)
    return {
      id,
      raw,
      avatar,
      nature,
      food,
      parent,
      link,
      numbers: link ? linkedNumbers(input.pet2011, link) : undefined,
    }
  })
  const avatarOf = (id: number) => species.find((s) => s.id === id)?.avatar

  return species.map((s) => {
    const peers = species.filter((p) => p.numbers && p.nature === s.nature).map((p) => p.numbers!)
    const growth = UNLINKED_GROWTH[s.nature]! + (s.parent ? EVOLVED_GROWTH : 0)
    // Answer 5: no Reborn art -> the family base pet's art, else the item icon only.
    const parentAvatar = s.parent ? avatarOf(s.parent) : undefined
    const artAvatar = art.has(s.avatar)
      ? s.avatar
      : parentAvatar !== undefined && art.has(parentAvatar)
        ? parentAvatar
        : null
    return {
      item: `i${s.id}`,
      nameKey: `reborn_item_${s.id}`,
      avatar: s.avatar,
      artAvatar,
      icon: `reborn/${s.raw[0]}`,
      nature: s.nature,
      food: s.food,
      /** 11b: the Reborn item's required level (field 1), 30/40/50; scales the base props. */
      requiredLevel: level(s.raw),
      parent: s.parent ? `i${s.parent}` : null,
      link: s.link,
      ...(s.numbers ?? unlinkedNumbers(peers, growth)),
      ...newPetCfg(input.pet2011, s.link),
    }
  })
}

// --- Pet skills (decisions 14, 16) ------------------------------------------------------------

/** Reborn tooltip stat words -> skilladd.ini key and factor (read off the 2011 rows 50001-50055). */
const PASS_STATS: [RegExp, string, number][] = [
  [/^max health %$/, 'MaxHPMulSKill', 10],
  [/^max health$/, 'MaxHPSkill', 1],
  [/^speed %$/, 'AtkTimeMulSkill', 10],
  [/^attack %$/, 'AbsAddAtkMulSkill', 10],
  [/^(block bypass|pierce)$/, 'PierceSkill', 1],
  [/^(protection|fortress|constitution)$/, 'ToughSkill', 1],
  [/^defense break$/, 'NeglectDefAttachSkill', 1],
  [/^max chakra$/, 'MaxMPSkill', 1],
  [/^block$/, 'ParryMulSkill', 1],
  [/^min attack$/, 'MinAtkSkill', 1],
  [/^max attack$/, 'MaxAtkSkill', 1],
  [/^(critical|critical hit|crit)$/, 'CritMulSkill', 1],
  [/^hit$/, 'HitMulSkill', 1],
  [/^dodge$/, 'DodgeMulSkill', 1],
  [/^defense$/, 'DefenseSkill', 1],
  [/^strength$/, 'StrengthSkill', 100],
  [/^agility$/, 'AgilitySkill', 100],
  [/^stamina$/, 'StaminaSkill', 100],
]
const REBORN_PASS_FIRST = 50056
const REBORN_PASS_LAST = 50086

/** Decision 16: a Reborn-only Pass skill as a skilladd row, from its level-1 tooltip. */
/**
 * Ours: neither 50057 nor 50071 exists in the 2011 skill.ini/skilladd.ini/scripts.
 * Continue Sharpness's 5%, 10%, 15% tier progression with 20% [S] and 25% Frenzied.
 * Only these known placeholders are substituted; other missing tooltips remain omitted.
 */
const SHARPNESS_SPEED_PERCENT: Record<number, number> = { 50057: 20, 50071: 25 }

export function passRowFromTooltip(
  lines: string[],
  skillId?: number,
): Record<string, number> | null {
  const percent = skillId === undefined ? undefined : SHARPNESS_SPEED_PERCENT[skillId]
  const tooltip = lines.join(' ')
  const text = percent === undefined ? tooltip : tooltip.replace('@1@', String(percent))
  const match = /Increases? ([a-z ]+?) by (\d+(?:\.\d+)?)(%?)/i.exec(text)
  if (!match) return null
  const words = `${match[1]!.toLowerCase()}${match[3] ? ' %' : ''}`
  const entry = PASS_STATS.find(([pattern]) => pattern.test(words))
  if (!entry) throw new Error(`Unknown Reborn pet skill stat "${words}": add it to PASS_STATS`)
  return { [entry[1]]: Math.trunc(Number(match[2]) * entry[2]) }
}

/** Reborn book ids that would overwrite a different 2011 item move up by this much. */
const REMAP_OFFSET = 100

function buildPetSkills(input: M6Inputs, locale: Record<string, unknown>) {
  const { skills, skillAdds, items } = input.original
  const rows: Record<string, unknown> = {}
  for (const [id, row] of Object.entries(skills)) {
    if (!row.ispet) continue
    const add = row.skilladd === undefined ? undefined : skillAdds[String(row.skilladd)]
    rows[id] = {
      kind: Number(row.ispet),
      source: '2011',
      script: typeof row.javascript === 'string' ? row.javascript : null,
      skillAdd: add ?? null,
    }
  }
  const omitted: { skill: number; reason: string }[] = []
  for (let id = REBORN_PASS_FIRST; id <= REBORN_PASS_LAST; id++) {
    if (rows[id]) continue // Prefer an original skill row when the 2011 table supplies one.
    const tooltip = locale[`skill__${id}--tooltip`]
    const skillAdd = Array.isArray(tooltip) ? passRowFromTooltip(tooltip as string[], id) : null
    if (skillAdd) rows[id] = { kind: 3, source: 'reborn', script: null, skillAdd }
    else omitted.push({ skill: id, reason: 'The Reborn tooltip has no value.' })
  }
  // Book type 0/1/2 = kind 1/2/3. A Reborn id whose 2011 item teaches the same skill reuses it.
  const books = ids(input.items, (_, raw) => props(raw).petSkill !== undefined).map((id) => {
    const { petSkill, type } = props(input.items[String(id)]!) as { petSkill: number; type: number }
    const original = items[`i${id}`]
    const reuse = original?.AddPetSkillId === petSkill
    const ours = original && !reuse ? id + REMAP_OFFSET : id
    return { item: `i${ours}`, rebornItem: `i${id}`, skill: petSkill, kind: type + 1, reuse }
  })
  return { skills: rows, omitted, books }
}

// --- Foods and 2011 pet tables (decisions 10, 13, 14, 17) -------------------------------------

const PET_LEVEL_CAP = 50 // decision 10

const iniTable = (section: Record<string, string | string[]> | undefined) =>
  Object.entries(section ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]) => Number(value))

/** The Home farm's crops (Grass, Eggplant, Corn, Pepper): 2011 CropItem rows pets also eat. */
const HOME_CROPS = [170001, 170002, 170003, 170004]

function buildPetFoods(input: M6Inputs) {
  const { PetCfg, PetFeedLib, PetGrow, PetSkillCnt, PetActCapital } = input.pet2011
  const crops = HOME_CROPS.map((id) => {
    const row = input.original.items[`i${id}`]!
    return {
      item: `i${id}`,
      hunger: Number(row.AddPetHunger),
      type: Number(row.PetFeedType),
      level: Number(row.JudgeValueScore),
    }
  })
  const reborn = ids(input.items, (id) => id >= 170113 && id <= 170127).map((id) => {
    const raw = input.items[String(id)]!
    const { hunger, type } = props(raw) as { hunger: number; type: number }
    return { item: `i${id}`, hunger, type, level: level(raw) }
  })
  const foods = [...crops, ...reborn]
  const grow = Object.fromEntries(
    Object.entries(PetGrow!.PetGrow!).map(([key, value]) => [
      key,
      /^i\d+$/.test(String(value)) ? String(value) : Number(value),
    ]),
  )
  return {
    foods,
    maxLevel: Math.min(Number(PetCfg!.PetMaxLevel!.maxlevel), PET_LEVEL_CAP),
    /** exp[L - 1]: PetCfg [PetExp] row L, levels 1-50. */
    exp: iniTable(PetCfg!.PetExp).slice(0, PET_LEVEL_CAP),
    /** PetFeedLib: food-slot type weights (types 1-7) and multiplier-tier weights (tiers 0-3). */
    typeWeights: iniTable(PetFeedLib!.type),
    mulWeights: iniTable(PetFeedLib!.mul),
    grow,
    /** skillCount[level]: total skill slots (PetSkillCnt, levels 0-35; the last value after). */
    skillCount: iniTable(PetSkillCnt!.PetSkillCnt),
    /** slotCost[n]: stones to unlock slot n (PetActCapital). */
    slotCost: iniTable(PetActCapital!.PetActCapital),
  }
}

// --- Wings and auras (decisions 22-26) --------------------------------------------------------

/** Reborn item category of the talismans; names follow the locale (answer 2). */
const TALISMAN_CATEGORY: Record<number, 'integrity' | 'safety' | 'luck'> = {
  51: 'integrity',
  52: 'safety',
  53: 'luck',
}

function buildWings(items: M6Inputs['items']) {
  const pick = (from: number, to: number) =>
    ids(items, (id) => id >= from && id <= to).map((id) => {
      const raw = items[String(id)]!
      return { item: `i${id}`, raw, p: props(raw) }
    })
  return {
    wings: pick(218000, 218019).map(({ item, raw, p }) => ({
      item,
      icon: `reborn/${raw[0]}`,
      line: Number(p.stat),
      bonus: Number(p.bonus),
      wingSprite: String(p.wingSprite),
    })),
    auras: pick(218200, 218299).map(({ item, raw, p }) => ({
      item,
      icon: `reborn/${raw[0]}`,
      line: Number(p.stat),
      bonus: Number(p.bonus),
      battleAura: String(p.battleAura),
    })),
    stones: pick(218020, 218029).map(({ item, p }) => ({ item, levelJump: Number(p.levelJump) })),
    talismans: pick(218030, 218059).map(({ item, raw, p }) => {
      const family = TALISMAN_CATEGORY[Number(raw[3])]
      if (!family) throw new Error(`Unknown talisman category of ${item}`)
      return { item, family, value: Number(p.reduction ?? p.bonus) }
    }),
  }
}

/** Decision 23: WING.Line[line][level], stat ids mapped to our fields (sum, then truncate). */
function buildWingLines(lines: M6Inputs['wingLines'], mapStat: StatMapper) {
  return Object.fromEntries(
    Object.entries(lines).map(([line, levels]) => [
      line,
      levels.map((stats) => stats.map(([stat, value]) => mapStat(stat, value))),
    ]),
  )
}

// --- Cards (decisions 27-30) ------------------------------------------------------------------

/** Parses the card collections (`dx`) and card names (`ox`) out of Reborn's main.js text. */
export function parseCards(mainJs: string) {
  const list = /\bdx=\[(\{name:".*?)\];/.exec(mainJs)?.[1]
  if (!list) throw new Error('Card collections (dx) not found in main.js')
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cardName = (folder: string, file: string) =>
    new RegExp(`"${escape(`${folder}/${file}`)}":"([^"]+)"`).exec(mainJs)?.[1] ??
    file.replace(/\.jpg$/, '')
  return [
    ...list.matchAll(/\{name:"([^"]+)",folder:"([^"]+)",cards:\[([^\]]*)\],rarity:lx\.(\w+)/g),
  ].map(([, name, folder, cards, rarity]) => ({
    name: name!,
    folder: folder!,
    rarity: rarity!,
    cards: [...cards!.matchAll(/"([^"]+)"/g)].map(([, file]) => ({
      file: file!,
      name: cardName(folder!, file!),
    })),
  }))
}

function buildCards(input: M6Inputs) {
  const boxes = ids(input.items, (id) => id >= 171001 && id <= 171005).map((id) => ({
    item: `i${id}`,
    rarity: String(props(input.items[String(id)]!).rarity),
  }))
  let cardId = 0
  const collections = parseCards(input.mainJs).map((c, i) => ({
    id: i + 1,
    nameKey: `reborn_card_collection_${i + 1}`,
    name: c.name,
    rarity: c.rarity,
    box: boxes.find((box) => box.rarity === c.rarity)?.item ?? null,
    cards: c.cards.map((card) => {
      cardId += 1
      return {
        id: cardId,
        nameKey: `reborn_card_${cardId}`,
        name: card.name,
        image: `icons/items/cards/${c.folder}/${card.file}`,
      }
    }),
  }))
  return { boxes, collections }
}

// --- Kennel shop (decision 21) ----------------------------------------------------------------

const FEATHER = 'i150319'
/** Item, price in Feathers, daily limit (ours); the level gate is the Reborn item level. */
const KENNEL_SHOP: [number, number, number][] = [
  [170114, 1, 20],
  [170120, 2, 20],
  [170117, 3, 20],
  [170116, 3, 20],
  [170124, 6, 20],
  [170123, 6, 20],
  [150406, 100, 1],
]

function buildKennelShop(items: M6Inputs['items']) {
  return {
    currency: FEATHER,
    offers: KENNEL_SHOP.map(([id, price, dailyLimit]) => ({
      item: `i${id}`,
      price,
      level: Math.max(1, level(items[String(id)]!)),
      dailyLimit,
    })),
  }
}

// --- Item overlay rows (item.ini shape) -------------------------------------------------------

type ItemRow = Record<string, number | string>

const baseRow = (id: string, raw: JsonItem): ItemRow => ({
  BindingType: 2,
  CanDrop: 1,
  CanTrade: 2,
  JudgeValueScore: 0,
  Name: `reborn_item_${id.slice(1)}`,
  ResourceID: `reborn/${raw[0]}`,
  UseLevel: Math.max(1, level(raw)),
})

function buildItemRows(
  items: M6Inputs['items'],
  parts: {
    pets: ReturnType<typeof buildPets>
    wings: ReturnType<typeof buildWings>
    books: ReturnType<typeof buildPetSkills>['books']
    boxes: ReturnType<typeof buildCards>['boxes']
  },
) {
  const row = (item: string, extra: ItemRow, rebornItem = item): [string, ItemRow] => [
    item,
    { ...baseRow(item, items[rebornItem.slice(1)]!), ...extra },
  ]
  const { wings, auras, stones, talismans } = parts.wings
  const stack = { CanUse: 0, ItemMaxFoldNum: 999, ItemShapeType: 1 }
  return Object.fromEntries([
    ...parts.pets.map((pet) =>
      row(pet.item, {
        // Explore grants pets at low levels (decision 9), so adopting has no level gate.
        UseLevel: 1,
        CanUse: 1,
        ItemMaxFoldNum: 1,
        ItemShapeType: 4,
        PetNat: pet.nature,
        PetFeedType: pet.food,
        class: 'PetItem',
      }),
    ),
    ...[...wings, ...auras].map((wing) =>
      row(wing.item, {
        CanUse: 0,
        EquipType: 'Wing',
        ItemMaxFoldNum: 1,
        ItemShapeType: 4,
        Sex: 2,
        UsePopsinger: -1,
        WingLine: wing.line,
        WingBonus: wing.bonus,
        ...('wingSprite' in wing
          ? { WingSprite: wing.wingSprite }
          : { BattleAura: wing.battleAura }),
        class: 'EquipItem',
      }),
    ),
    ...stones.map((stone) =>
      row(stone.item, { ...stack, LevelJump: stone.levelJump, class: 'WingStone' }),
    ),
    ...talismans.map((t) =>
      row(t.item, {
        ...stack,
        TalismanFamily: t.family,
        TalismanValue: t.value,
        class: 'WingTalisman',
      }),
    ),
    ...parts.boxes.map((box) =>
      row(box.item, { ...stack, CanUse: 1, CardRarity: box.rarity, class: 'CardBox' }),
    ),
    // Like the 2011 pet skill books (i180035): used from the Kennel, not the bag.
    ...parts.books
      .filter((book) => !book.reuse)
      .map((book) =>
        row(
          book.item,
          {
            AddPetSkillId: book.skill,
            AddSkillId: 0,
            CanUse: 0,
            ItemMaxFoldNum: 1,
            ItemShapeType: 1,
            RebornItem: book.rebornItem,
            class: 'SkillBook',
          },
          book.rebornItem,
        ),
      ),
  ])
}

// --- Entry point ------------------------------------------------------------------------------

export function buildM6(
  input: M6Inputs,
  locale: Record<string, unknown>,
  label: (key: string) => string,
  mapStat: StatMapper,
) {
  /** A Reborn name with its `[[key]]` references resolved (book names embed the skill name). */
  const resolved = (key: string): string =>
    label(key).replace(/\[\[([^\]]+)\]\]/g, (_, inner: string) => resolved(inner))
  const pets = buildPets(input)
  const petSkills = buildPetSkills(input, locale)
  const wings = buildWings(input.items)
  const cards = buildCards(input)
  const items = buildItemRows(input.items, {
    pets,
    wings,
    books: petSkills.books,
    boxes: cards.boxes,
  })

  const names: Name[] = [
    ...Object.entries(items).map(([item, row]) => ({
      key: `lg_${row.Name}`,
      kind: 'item' as const,
      name: resolved(`item__${String(row.RebornItem ?? item).slice(1)}--name`),
    })),
    ...Object.entries(petSkills.skills)
      .filter(([, row]) => (row as { source: string }).source === 'reborn')
      .map(([id]) => ({
        key: `lg_Skill_${id}`,
        kind: 'skill' as const,
        name: label(`skill__${id}--name`),
      })),
    ...cards.collections.flatMap((c) => [
      { key: c.nameKey, kind: 'title' as const, name: c.name },
      ...c.cards.map((card) => ({ key: card.nameKey, kind: 'item' as const, name: card.name })),
    ]),
  ]
  return {
    files: {
      pets,
      'pet-skills': petSkills,
      'pet-foods': buildPetFoods(input),
      wings,
      'wing-lines': buildWingLines(input.wingLines, mapStat),
      cards,
      'kennel-shop': buildKennelShop(input.items),
    } as Record<string, unknown>,
    items,
    names,
  }
}
