// Read-only access to the imported original game data (server/data/game, see tools/game-data).
// Files are loaded on first use and cached for the life of the process.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  AvatarStats,
  Bonuses,
  EnhanceFailRates,
  EquipPropDefines,
  EquipSuits,
  EquipTables,
  IdentifyGroups,
  IdentifyList,
  IdentifyProps,
  IdentifyTables,
  InscribeLevels,
  SealOdds,
  SkillInput,
} from '@pockie/game-core'
import type { OutfitBoost } from '@pockie/shared'
import { z } from 'zod'

type Row = Record<string, number | string | (number | string)[]>

const dataDir = fileURLToPath(new URL('../../data/game/', import.meta.url))
const cache = new Map<string, unknown>()

function load<T>(name: string): T {
  if (!cache.has(name)) {
    cache.set(name, JSON.parse(readFileSync(`${dataDir}${name}.json`, 'utf8')))
  }
  return cache.get(name) as T
}

export function avatarStats(avatarId: number): AvatarStats {
  const row = load<Record<string, AvatarStats>>('avatar-stats')[String(avatarId)]
  if (!row) throw new Error(`Unknown avatar ${avatarId}`)
  return row
}

/** Stat the creation screen says an outfit boosts (CreatRoleBase.SetRoleSelectDes). */
function outfitBoost({ Strength, Agility, Stamina }: AvatarStats): OutfitBoost {
  if (Strength > Agility && Strength > Stamina) return 'strength'
  if (Agility > Strength && Agility > Stamina) return 'agility'
  return 'stamina'
}

/** The 10 outfits the original creation screen offers (creatrole.tab, first rows). */
export function creationOutfits() {
  return load<Row[]>('creation-outfits').map((row) => ({
    clothing: Number(row.Cloth),
    gender: Number(row.Sex) as 0 | 1,
    weaponClass: Number(row.Pos),
    boost: outfitBoost(avatarStats(Number(row.AvatarID))),
  }))
}

/**
 * Clothing (visual id) → its outfit item (avatarclothingmap.ini AvatarConfig, the AvatarLevel 1
 * AvatarItem) and that item's AvatarID.
 */
export function outfitForClothing(clothing: number) {
  const map = load<Record<string, Row>>('avatar-clothing')[String(clothing)]
  const itemId = map && String(map.AvatarConfig)
  const item = itemId && load<Record<string, Row>>('items')[itemId]
  if (!item) throw new Error(`Unknown clothing ${clothing}`)
  return { itemId, avatarId: Number(item.AvatarID) }
}

/** Village (castle), first field and login scene per nation (nationscene.ini). */
export function nationScenes() {
  return load<Record<string, { castle: number; field: number; login: number }>>('nation-scenes')
}

/** First rookie (tutorial) task per nation (RookieTaskSystem.java). */
export const FIRST_TUTORIAL_TASK: Record<number, number> = {
  0: 90000,
  1: 91000,
  2: 94000,
  3: 93000,
  4: 92000,
}

export function subTasks(taskId: number) {
  return withReborn<Row[]>('sub-tasks')[String(taskId)] ?? []
}

const list = (value: Row[string] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]

export const npc = (id: string) => load<Record<string, Row>>('npcs')[id]

/** skill.ini row of one skill id (without the id), including the Reborn scroll skills. */
export const skill = (id: number) => withReborn<Omit<SkillInput, 'id'>>('skills')[String(id)]

/** skilladd.ini: the properties a passive skill adds (`SkillAdd0Skill`, `MaxHP`, ...). */
export const skillAddRow = (id: number) =>
  load<Record<string, Record<string, number>>>('skill-adds')[String(id)]

/** AvatarSkill.ini SkillID1-4 of an outfit (`i29NNNN`), 0 = empty slot. */
export function avatarSkillIds(avatarId: number) {
  const row =
    load<Record<string, Record<string, number>>>('avatar-skills')[
      `i29${String(avatarId).padStart(4, '0')}`
    ]
  return row ? [row.SkillID1, row.SkillID2, row.SkillID3, row.SkillID4].map(Number) : undefined
}

/** NpcRecord AttackSkill + TriggerSkill ids, resolved through the record values. */
export function npcSkillIds(npcId: string) {
  const record = load<Record<string, Record<string, number>>>('npc-records')[npcId]
  if (record?.AttackSkill === undefined && record?.TriggerSkill === undefined) return undefined
  const values =
    load<Record<string, { r: number | string | (number | string)[] }>>('npc-record-values')
  return [record.AttackSkill, record.TriggerSkill].flatMap((rec) =>
    rec === undefined ? [] : [values[String(rec)]?.r ?? []].flat().map(Number),
  )
}

/** item.ini row, including the Reborn scroll items. */
export const item = (id: string) => withReborn<Row>('items')[id]
/** en.json key of an item's name (`lg_<Name>`), or `lg_<id>` for items without a row. */
export const itemNameKey = (id: string) => `lg_${item(id)?.Name ?? id}`
export const levels = () =>
  load<{ levelexp: Record<string, number>; role: { maxlevel: number } }>('levels')

/** RefresNpc.ini spawn lines: npcId,picX,picY,scale. */
export function sceneSpawns(sceneId: number) {
  const scene = load<Record<string, Row>>('scene-npcs')[String(sceneId)]
  return list(scene?.r).map((line) => {
    const [id = '', x = 0, y = 0, scale = 100] = line.split(',')
    return { id, x: Number(x), y: Number(y), scale: Number(scale) }
  })
}

/** scenequeue.ini: linked scenes, empty slots (-1) dropped. */
export function sceneLinks(sceneId: number) {
  const scene = load<Record<string, Row>>('scene-links')[String(sceneId)]
  return list(scene?.r)
    .flatMap((line) => line.split(','))
    .map(Number)
    .filter((id) => id !== -1)
}

export function exploreSpotIds(sceneId: number) {
  return Object.entries(load<Record<string, Row>>('explore-spots'))
    .filter(([, spot]) => Number(spot.SceneID) === sceneId)
    .map(([id]) => id)
}

export const dropLib = (id: number) => load<Record<string, Row>>('drop-libs')[String(id)]
export const dropItems = (id: number) => load<Record<string, Row[]>>('drop-items')[String(id)] ?? []
export const taskMonsterDrops = (taskId: number) =>
  withReborn<Row[]>('task-monster-drops')[String(taskId)] ?? []

export const task = (id: number) => withReborn<Row>('tasks')[String(id)]
let offeredTaskIds: number[] | undefined
/** Quests taken at an NPC: not auto-accepted and with a quest giver (Task.ini AcceptNpcConfig). */
export function npcOfferedTaskIds() {
  offeredTaskIds ??= Object.entries(withReborn<Row>('tasks'))
    .filter(
      ([, row]) => Number(row.AutoAcceptTask) !== 1 && typeof row.AcceptNpcConfig === 'string',
    )
    .map(([id]) => Number(id))
  return offeredTaskIds
}
export const scene = (id: number) => load<Record<string, Row>>('scenes')[String(id)]
export const sceneSwitchRule = (id: number) =>
  load<Record<string, Row>>('scene-switch-rules')[String(id)]

export interface ExploreFactoryEntry {
  Config: string
  BindingStatus: number
  ID: number
  Odds: number
}
export type ExploreFactory = 'baby' | 'boss' | 'item' | 'key'

/** RoleOutSearch.ini row (one explore spot). */
export const exploreSpot = (id: string) => load<Record<string, Row>>('explore-spots')[id]

/** roleoutsearch.tab ClipName: the field scene element that opens the spot, or null. */
export function exploreClipName(id: string) {
  const clip = load<Record<string, string | number>>('explore-clips')[id]
  return typeof clip === 'string' ? clip : null
}

/** OutSearchCommon.ini: the global cooldown between searches, in seconds. */
export const exploreCooldownSeconds = () =>
  load<{ r: { OutSearchTimeSpace: number } }>('explore-common').r.OutSearchTimeSpace

/** BabyFactory / BossFactory / ItemFactory / KeyFactory.ini rows of one factory id, in order. */
export const exploreFactory = (kind: ExploreFactory, id: number) =>
  Object.values(load<Record<string, ExploreFactoryEntry>>(`explore-${kind}-factory`)).filter(
    (entry) => entry.ID === id,
  )

/** GostFactory.ini: monster configs of one factory id. */
export const exploreMonsters = (id: number) =>
  load<Record<string, { Item: string[] }>>('explore-gost-factory')[String(id)]?.Item ?? []

/** The tables every equipped item's stat list needs (EquipSystem; game-core/equipment). */
export function equipTables(): EquipTables & { suits: EquipSuits } {
  return {
    propDefines: load<EquipPropDefines>('equip-props'),
    identifyProps: load<IdentifyProps>('identify-props'),
    inscribeLevels: load<{ levels: InscribeLevels }>('inscribe-levels').levels,
    enhanceFactor: load<{ config: { ConsolidateEquipFatcor: number } }>('equip-config').config
      .ConsolidateEquipFatcor,
    suits: load<EquipSuits>('equip-suits'),
  }
}

let setPieces: Map<number, number> | undefined
/** How many items of item.ini belong to a set (SuitID). */
export function setPieceCount(suitId: number) {
  setPieces ??= Object.values(load<Record<string, Row>>('items')).reduce((counts, row) => {
    const id = Number(row.SuitID ?? 0)
    return id > 0 ? counts.set(id, (counts.get(id) ?? 0) + 1) : counts
  }, new Map<number, number>())
  return setPieces.get(suitId) ?? 0
}

/** equipPropConfig.ini costs and factors (blacksmith.md "Config"). */
export const equipConfig = () =>
  load<{ config: Record<string, number | string> }>('equip-config').config
/** ConsolidateFailRate.ini, section = target level. */
export const enhanceFailRates = () => load<EnhanceFailRates>('enhance-fail-rates')
/** SealOdds.ini with the seal item ids. */
export const sealOdds = () =>
  load<{ seals: SealOdds & { LowSeal: string; HighSeal: string } }>('inscribe-levels').seals
/** EquipIdentifyIDList.ini row of an item; items without one never get properties. */
export const identifyList = (itemId: string) =>
  load<Record<string, IdentifyList>>('identify-lists')[itemId]
/** EquipIdentifyProp.ini groups and IdentifyPropLib.ini props. */
export const identifyTables = (): IdentifyTables => ({
  groups: load<IdentifyGroups>('identify-groups'),
  props: load<IdentifyProps>('identify-props'),
})

// --- M4: arena, rankings, Market, mail, teams (zod-checked on first load) ---

function loadChecked<T>(name: string, schema: z.ZodType<T>): T {
  const key = `checked:${name}`
  if (!cache.has(key)) cache.set(key, schema.parse(load<unknown>(name)))
  return cache.get(key) as T
}

const int = z.number().int()

const arenaTierSchema = z.object({
  beginscore: int,
  /** -1 on the top tier (no promotion). */
  endscore: int,
  /** Honor per arena fight, win or loss. */
  honor: int,
  /** Chest card libs (competeprize.ini, not imported: chests are deferred). */
  item0: int,
  item1: int,
  item2: int,
  item3: int,
  /** Honor paid on the boss win that promotes you to this tier. */
  ranknpchonor: int,
  /** competenpc.ini: 18 normal opponents, then the Fortune Cat, then the boss. */
  npcs: z.array(z.string().regex(/^n\d+$/)).length(20),
  /** HonorExp.ini: pay `honor`, gain `exp` per unit. */
  HonorExp: z.object({ exp: int, honor: int }),
})
export type ArenaTier = z.infer<typeof arenaTierSchema>

/** competerank.ini + competenpc.ini + HonorExp.ini, tiers 0-21 in order. */
export const arenaTiers = () =>
  loadChecked(
    'arena-tiers',
    z
      .record(z.string(), arenaTierSchema)
      .transform((tiers) => Object.keys(tiers).map((_, tier) => tiers[String(tier)]!)),
  )
export const arenaTier = (tier: number): ArenaTier | undefined => arenaTiers()[tier]

/** compete.ini (pvp-rankings.md 11). */
export const arenaConfig = () =>
  loadChecked(
    'arena-config',
    z.object({
      initscore: int,
      competecd: int,
      competemaxcount: int,
      competevipmaxcount: int,
      savaselffightcount: int,
      competelevel: int,
      competerank: int,
      topcount: int,
      onemoney: int,
      backmoney: int,
      fortunecatmul: int,
      expprizescore: int,
      competefriendfightcount: int,
      friendonemoney: int,
      savefightfriendcount: int,
      lookone: int,
      looktwo: int,
      refurbishtime: int,
      refurbishmoney: int,
      competemaxcountGold: int,
    }),
  )

const honorShopSchema = z.object({
  /** Weights for 1-4 identified properties. */
  c1: int,
  c2: int,
  c3: int,
  c4: int,
  honor: int,
  /** Minimum arena tier. */
  rank: int,
})
export type HonorShopOffer = z.infer<typeof honorShopSchema>
/** scoreprize.ini: the Honor shop armour by item id. */
export const arenaHonorShop = () =>
  loadChecked('arena-honor-shop', z.record(z.string(), honorShopSchema))

const placeByGate = <T extends z.ZodType>(value: T) =>
  z.record(z.string(), z.record(z.string(), value))
const tollGateRankRewards = () =>
  loadChecked(
    'toll-gate-rank-rewards',
    z.object({
      exp: placeByGate(int),
      /** `capitalType,amount` (always 0 = Stone). */
      money: placeByGate(z.string().regex(/^\d+,\d+$/)),
      item: placeByGate(z.union([int, z.string()])),
    }),
  )
/** Rank{Exp,Money,Item}Reward.ini: the weekly reward for a place (1-50) at a toll gate. */
export function tollGateRankReward(gateId: number, place: number) {
  const tables = tollGateRankRewards()
  const exp = tables.exp[String(place)]?.[String(gateId)]
  const money = tables.money[String(place)]?.[String(gateId)]
  if (exp === undefined || money === undefined) return undefined
  const [capitalType = 0, amount = 0] = money.split(',').map(Number)
  return { exp, capitalType, money: amount, item: tables.item[String(place)]?.[String(gateId)] }
}

/** gametop.tab rows of the M4 lists (decision 13) with our English labels, plus the toll gates. */
export const rankings = () =>
  loadChecked(
    'rankings',
    z.object({
      lists: z.array(
        z.object({
          ID: int,
          Type: z.string(),
          Name: z.string(),
          key: z.enum(['level', 'stone', 'lasNoches', 'arena']),
          group: z.string(),
          label: z.string(),
        }),
      ),
      tollGates: z.object({
        key: z.literal('tollGateWeekly'),
        group: z.string(),
        label: z.string(),
        gates: z.array(int),
      }),
    }),
  )

export interface MarketCategory {
  /** StepName<n>: a language key, a literal ("1—10") or a number shown as is. */
  Name: number | string
  /** StepDes<n>: language key of the step's label. */
  Des: string
  /** Category key: top type, then the child index per step, joined with `_`. */
  Path: string
  children: MarketCategory[]
}
const marketCategorySchema: z.ZodType<MarketCategory> = z.lazy(() =>
  z.object({
    Name: z.union([int, z.string()]),
    Des: z.string(),
    Path: z.string(),
    children: z.array(marketCategorySchema),
  }),
)
/** The Market browse tree (martsellshow.tab, built like MarcketBuyShowPage.InitData). */
export const marketCategories = () =>
  loadChecked('market-categories', z.array(marketCategorySchema))

let marketLeaves: Set<string> | undefined
/**
 * Category of a listed item (MartSystem.GetDomainRec): item.ini `MartType`, plus
 * `_<properties - 1>` for weapons (type 0) and armour (type 2). Undefined when the item has no
 * browsable category.
 */
export function marketCategoryKey(itemId: string, identifiedProps = 0) {
  if (!marketLeaves) {
    const leaves = new Set<string>()
    const walk = (node: MarketCategory): void => {
      if (node.children.length === 0) leaves.add(node.Path)
      node.children.forEach(walk)
    }
    marketCategories().forEach(walk)
    marketLeaves = leaves
  }
  const martType = item(itemId)?.MartType
  if (martType === undefined) return undefined
  const base = String(martType)
  const key = /^[02]_/.test(base) ? `${base}_${identifiedProps - 1}` : base
  return marketLeaves.has(key) ? key : undefined
}

/** MailPropConfig.ini. Only the three length keys were read by the original MailServer. */
export const mailConfig = () =>
  loadChecked(
    'mail-config',
    z.object({
      PlayerMailMaxTitleWord: int,
      PlayerMailMaxTextWord: int,
      SystemHintMailMaxTextWord: int,
      PlayerMailMaxSaveTime: int,
      SystemHintMailMaxSaveTime: int,
      PlayerMailMaxCount: int,
      SystemHintMailMaxCount: int,
      SystemBRMailCount: int,
    }),
  )

/**
 * Mail categories in the client's tab order (UI_MailFrame._mailTypeAry) with their tab label
 * keys. Hard-coded in the client, no data file (friends-mail.md "Types and categories").
 */
export const MAIL_CATEGORIES = [
  { type: 0, key: 'Common_SystemNoticeMailTab' },
  { type: 2, key: 'Common_PlayerMailTab' },
  { type: 8, key: 'Common_MailArenaMailTab' },
  { type: 10, key: 'Common_MailMartMailTab' },
  { type: 5, key: 'Common_MailSlaveMailTab' },
  { type: 4, key: 'Common_MailInterMailTab' },
  { type: 7, key: 'Common_MailMatchMailTab' },
  { type: 6, key: 'Common_MailRaceMailTab' },
  { type: 9, key: 'Common_MailSGateMailTab' },
  { type: 3, key: 'Common_ArenaMsgMailTab' },
  { type: 1, key: 'Common_MailOtherMailTab' },
] as const

/** Team size; no data file (J/TeamModule/TeamDefine/TeamDefine.java:7-8). */
export const TEAM_MAX_MEMBERS = 3
export const TEAM_MIN_MEMBERS = 2

// --- M5: Reborn overlay (server/data/game/reborn, `pnpm game-data:reborn`, zod-checked) ---

const rowValue = z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))])
const rowSchema = z.record(z.string(), rowValue)
const itemId = z.string().regex(/^i\d+$/)
const BONUS_FIELDS = [
  'strength',
  'agility',
  'stamina',
  'hp',
  'hpMul',
  'mp',
  'minAttack',
  'maxAttack',
  'attackMul',
  'atkTimeMul',
  'dodge',
  'parry',
  'hit',
  'crit',
  'critAttach',
  'defense',
  'pierce',
  'tough',
  'neglectDefense',
  'skillAdd0',
  'skillAdd1',
  'skillAdd2',
  'skillAdd3',
  'skillAdd4',
  'skillAdd5',
  'skillAdd6',
  'skillAdd7',
  'skillAdd8',
  'skillAdd9',
] as const satisfies readonly (keyof Bonuses)[]
const bonusField = z.enum(BONUS_FIELDS)

const rebornName = z.string().regex(/^reborn_item_\d+$/)
const overlayRow = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ Name: rebornName, ...shape }).catchall(rowValue)
/** Reborn item rows in item.ini shape: M5 scrolls, M6 pets, wings, enhancement items, boxes, books. */
const overlayItem = z.discriminatedUnion('class', [
  overlayRow({
    class: z.literal('SkillScrollItem'),
    CanUse: z.literal(1),
    AddSkillId: int,
    /** M5 decision 18: 7-day scroll, 0 = permanent. */
    ScrollDays: z.union([z.literal(0), z.literal(7)]),
  }),
  overlayRow({
    class: z.literal('PetItem'),
    CanUse: z.literal(1),
    PetNat: int.min(1).max(6),
    PetFeedType: int.min(1).max(7),
  }),
  /** M6 decision 22: wings and auras share the Wing slot. */
  overlayRow({ class: z.literal('EquipItem'), EquipType: z.literal('Wing'), WingLine: int }),
  overlayRow({ class: z.literal('WingStone'), LevelJump: int.positive() }),
  overlayRow({
    class: z.literal('WingTalisman'),
    TalismanFamily: z.enum(['luck', 'safety', 'integrity']),
    TalismanValue: int.positive(),
  }),
  overlayRow({
    class: z.literal('CardBox'),
    CanUse: z.literal(1),
    CardRarity: z.enum(['GREEN', 'BLUE', 'PURPLE', 'RED', 'GOLD']),
  }),
  overlayRow({ class: z.literal('SkillBook'), AddPetSkillId: int, RebornItem: itemId }),
])

/** Overlays merged into the original lookups; their ids must not exist in the original files. */
const REBORN_OVERLAYS = {
  skills: z.record(
    z.string(),
    z
      .object({
        type: z.union([z.literal(1), z.literal(2)]),
        quomodo: int,
        probability: int.min(0).max(100),
        skilladdtype: int.min(0).max(9),
        effect: int,
        decmp: int,
        canbecounter: z.union([z.literal(0), z.literal(1)]),
        level: int,
        secondid: int,
        skillvalue: int,
        javascript: z.string(),
      })
      .strict(),
  ),
  items: z.record(itemId, overlayItem),
  tasks: z.record(z.string(), rowSchema),
  'sub-tasks': z.record(z.string(), z.array(rowSchema)),
  'task-monster-drops': z.record(z.string(), z.array(rowSchema)),
}

function withReborn<T>(name: keyof typeof REBORN_OVERLAYS): Record<string, T> {
  const key = `merged:${name}`
  if (!cache.has(key)) {
    const base = load<Record<string, T>>(name)
    const overlay = loadChecked<Record<string, unknown>>(`reborn/${name}`, REBORN_OVERLAYS[name])
    const clash = Object.keys(overlay).filter((id) => id in base)
    if (clash.length) throw new Error(`Reborn ${name} reuse original ids: ${clash.join(', ')}`)
    cache.set(key, { ...base, ...overlay })
  }
  return cache.get(key) as Record<string, T>
}

const talentsSchema = z.object({
  unlockLevel: int,
  /** Decision 6: talent level <= max(0, level - levelOffset). */
  levelOffset: int,
  maxActive: int,
  attemptsPerDay: int,
  expPerUpgrade: int,
  critPercent: int,
  critMultiplier: int,
  /** expNeeded[L - 1]: EXP to reach level L. */
  expNeeded: z.array(int.positive()).length(60),
  /** costs[n - 1] = [gold, stones] of the n-th upgrade of the day. */
  costs: z.array(z.tuple([int.nonnegative(), int.nonnegative()])).length(80),
  talents: z
    .array(
      z.object({
        id: int.min(1).max(8),
        nameKey: z.string(),
        stat: bonusField,
        counter: bonusField,
      }),
    )
    .length(8),
})
export type RebornTalents = z.infer<typeof talentsSchema>
export const rebornTalents = () => loadChecked('reborn/talents', talentsSchema)

const statBonus = z.object({ stat: int, field: bonusField, value: z.number() })
const bloodlinesSchema = z.object({
  itemsPerTurnIn: int,
  amityPerTurnIn: int,
  /** Decision 12: turn-ins per day, not items. */
  turnInsPerDay: int,
  maxActive: int,
  /** Reborn stat id -> its Reborn label, our field and the factor into our units. */
  stats: z.record(z.string(), z.object({ label: z.string(), field: bonusField, scale: int })),
  limits: z
    .array(
      z.object({
        id: int.min(1).max(44),
        nameKey: z.string(),
        requiredLevel: int.min(1).max(90),
        unlockItem: itemId,
        amity: int.positive(),
        avatar: int,
        npcId: int,
        npcNameKey: z.string(),
        npcOutfit: itemId,
        /** x100 internal units. */
        base: z.object({ strength: int, agility: int, stamina: int }),
        /** Values already in our units. */
        bonus: z.array(statBonus).length(3),
      }),
    )
    .length(44),
})
export type RebornBloodlines = z.infer<typeof bloodlinesSchema>
export const rebornBloodlines = () => loadChecked('reborn/bloodlines', bloodlinesSchema)

const soulsSchema = z.object({
  inventory: int,
  socketsPerLimit: int,
  /** Character level needed for soul level n at index n - 1 (clamped to 90, decision 13). */
  levelLimits: z.array(int.max(90)).length(10),
  discover: z.object({ perDay: int, perDayVip: int, levelOdds: z.array(int).length(3) }),
  synthesis: z.object({ count: int, maxLevel: int }),
  prayer: z.object({
    maxLevel: int,
    expBase: int,
    soulExpBase: int,
    soulExpFactor: int,
    /** Internal (x100) attribute points per prayer level (decision 16). */
    bonusPerLevel: int,
    attributes: z.array(z.enum(['strength', 'agility', 'stamina'])).length(3),
  }),
  types: z
    .array(
      z.object({
        id: int.min(1).max(13),
        nameKey: z.string(),
        stat: int,
        field: bonusField,
        /** Index = soul level 0-10; sum, then truncate. */
        valueByLevel: z.array(z.number()).length(11),
      }),
    )
    .length(13),
})
export type RebornSouls = z.infer<typeof soulsSchema>
export const rebornSouls = () => loadChecked('reborn/souls', soulsSchema)

const scrollSkillsSchema = z.record(
  z.string(),
  z.object({
    element: z.string(),
    trigger: z.string(),
    /** [low, high]; the SkillAdd bonus is capped at the high end (decision 17). */
    castChance: z.tuple([int, int]),
    /** Multiplier of the level-based MP amount; 0 = no chakra. */
    chakra: z.number().nonnegative(),
    sevenDayItem: itemId,
    permanentItem: itemId,
  }),
)
export type RebornScrollSkill = z.infer<typeof scrollSkillsSchema>[string]
/** The 12 scroll skills by skill id (their skill.ini rows are merged into `skill()`). */
export const rebornScrollSkills = () => loadChecked('reborn/scroll-skills', scrollSkillsSchema)

/** Dice of Fate buffs in nonfight-buff-data.json shape (decision 25 values for 80101-80202). */
export const rebornNonfightBuffs = () =>
  loadChecked(
    'reborn/nonfight-buffs',
    z.object({
      buffs: z.record(
        z.string(),
        z.object({
          buffadd: int,
          cleartype: int,
          deltype: int,
          overlying: int,
          replace: int,
          type: int,
          validity: int,
        }),
      ),
      properties: z.record(z.string(), z.record(z.string(), int)),
    }),
  )

const itemReward = z.object({ item: itemId, amount: int.positive() })
const eventsSchema = z.object({
  dailyLogin: z.object({ cycle: z.array(itemReward).length(7), bonus: itemReward }),
  weekly: z.object({
    activities: z.array(z.object({ id: z.string(), max: int.positive(), points: int.positive() })),
    milestones: z.array(
      z.object({
        points: int,
        item: itemId.optional(),
        amount: int.optional(),
        gold: int.optional(),
      }),
    ),
    weekdayThreshold: int,
    /** dayIndex 0 = Sunday. */
    weekdayRewards: z.array(itemReward.extend({ dayIndex: int.min(0).max(6) })).length(7),
    bonus: itemReward,
  }),
  dice: z.object({
    rollsPerDay: int,
    dice: int,
    replenishCost: int,
    clearCurseCost: int,
    /** Best first: the first tier with net lucky dice >= minNet applies. */
    tiers: z.array(z.object({ minNet: int, buff: int.nullable() })),
    durationSeconds: z.record(z.string(), int),
  }),
  twentyMinute: z.object({ cooldownSeconds: int, giftCoupons: int, claimsPerDay: int }),
  tailedBeast: z.object({
    beasts: z.array(z.object({ id: int, nameKey: z.string() })).length(9),
    ticketsPerDay: int,
    /** Per mode: normal, hard, rampage. */
    ticketCost: z.array(int).length(3),
    hp: z.array(int).length(3),
    /** level = base + perBeast * (id - 1) + perMode * mode. */
    level: z.object({ base: int, perBeast: int, perMode: int }),
    /** Honor = floor(damage / honorPerDamage); Essence = Honor. */
    honorPerDamage: int,
    boxes: z.array(z.object({ fights: int, item: itemId })),
    kageChoices: z.array(itemId),
    shop: z.array(z.object({ item: itemId, essence: int, limit: int.optional() })),
  }),
  teamStone: z.object({
    minLevel: int,
    attemptsPerDay: int,
    teamSize: int,
    botFillSeconds: z.tuple([int, int]),
    leagues: z
      .array(
        z.object({
          id: z.string(),
          nameKey: z.string(),
          minScore: int,
          battleCoins: int,
          item: itemId.optional(),
          amount: int.optional(),
        }),
      )
      .length(8),
  }),
})
export type RebornEvents = z.infer<typeof eventsSchema>
/** Daily Login, Weekly Rewards, Dice of Fate, Twenty-Minute Reward, Tailed Beast, Team Stone. */
export const rebornEvents = () => loadChecked('reborn/events', eventsSchema)

// --- M6: pets, wings, cards, Kennel shop (m6-companions.plan.md task 2) ---

const kindRecord = <T extends z.ZodType>(value: T) =>
  z.object({ halo: value, help: value, pass: value })
const petSchema = z.object({
  item: itemId,
  nameKey: z.string(),
  avatar: int,
  /** Battle art avatar: own, else the family base pet's, else null = icon only (answer 5). */
  artAvatar: int.nullable(),
  icon: z.string(),
  /** 1 Plant, 2 Beast, 3 Artificial, 4 Dragon, 5 Tailed Beast, 6 Spirits. */
  nature: int.min(1).max(6),
  /** Food type that earns the like bonus (decision 13). */
  food: int.min(1).max(7),
  /** Reborn item field 1 (11b): the master level needed to adopt; scales the base props. */
  requiredLevel: z.union([z.literal(30), z.literal(40), z.literal(50)]),
  /** Base species of an evolved form (petFamilies). */
  parent: itemId.nullable(),
  /** 2011 species (decision 9); null = numbers are ours. */
  link: itemId.nullable(),
  growth: int.positive(),
  base: z.object({ attack: int, defence: int, disturb: int, active: int, savvy: int }),
  /** Learnable skill ids by kind (PetSkillSrc -> PetSkillLib). */
  pool: kindRecord(z.array(int).min(1)),
  /** PetSkillDepot rows: skill id and its weight. */
  depot: z.array(z.object({ skill: int, mul: int })),
  /** NewPetCfg. */
  feedType: int,
  foodMul: z.array(int).length(6),
  skillWeights: kindRecord(int),
})
export type RebornPet = z.infer<typeof petSchema>
/** The 190 pet species (decision 8), in item id order. */
export const rebornPets = () => loadChecked('reborn/pets', z.array(petSchema).length(190))

const petSkillsSchema = z.object({
  skills: z.record(
    z.string(),
    z.object({
      /** 1 Halo, 2 Help, 3 Pass (skill.ini `ispet`). */
      kind: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      source: z.enum(['2011', 'reborn']),
      script: z.string().nullable(),
      /** skilladd.ini row of a Pass skill. */
      skillAdd: z.record(z.string(), int).nullable(),
    }),
  ),
  /** Reborn-only skills left out (decision 16), so their books teach nothing yet. */
  omitted: z.array(z.object({ skill: int, reason: z.string() })),
  books: z
    .array(
      z.object({
        item: itemId,
        rebornItem: itemId,
        skill: int,
        kind: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        /** True when the 2011 item with the Reborn id already teaches the same skill. */
        reuse: z.boolean(),
      }),
    )
    .length(50),
})
export type RebornPetSkills = z.infer<typeof petSkillsSchema>
/** Every pet skill (2011 `ispet` rows and Reborn-only Pass rows) and the 50 skill books. */
export const rebornPetSkills = () => loadChecked('reborn/pet-skills', petSkillsSchema)

const petFoodsSchema = z.object({
  foods: z.array(z.object({ item: itemId, hunger: int.positive(), type: int, level: int })),
  maxLevel: int,
  /** exp[L - 1]: PetCfg [PetExp] row L. */
  exp: z.array(int.positive()).length(50),
  typeWeights: z.array(int).length(7),
  mulWeights: z.array(int).length(4),
  /** PetCfg [PetGrow]: HungerMax, combo and like multipliers, item ids, ... */
  grow: z.record(z.string(), z.union([int, itemId])),
  skillCount: z.array(int),
  slotCost: z.array(int),
})
export type RebornPetFoods = z.infer<typeof petFoodsSchema>
/** Foods 170113-170127 and the 2011 pet tables (decisions 10, 13, 14, 17). */
export const rebornPetFoods = () => loadChecked('reborn/pet-foods', petFoodsSchema)

const wingItem = z.object({ item: itemId, icon: z.string(), line: int, bonus: int })
const wingsSchema = z.object({
  wings: z.array(wingItem.extend({ wingSprite: z.string() })),
  auras: z.array(wingItem.extend({ battleAura: z.string() })),
  stones: z.array(z.object({ item: itemId, levelJump: int.positive() })),
  talismans: z.array(
    z.object({
      item: itemId,
      family: z.enum(['luck', 'safety', 'integrity']),
      /** Luck: success bonus %; Safety and Integrity: reduction %. */
      value: int.positive(),
    }),
  ),
})
export type RebornWings = z.infer<typeof wingsSchema>
/** Wings 218000-218018, auras 218200-218207, stones and talismans (decisions 22, 24). */
export const rebornWings = () => loadChecked('reborn/wings', wingsSchema)

const wingField = z.enum([...BONUS_FIELDS, 'counter', 'vampiricHp', 'decDamage'])
/** WING.Line by line id: 31 levels of stats in our units (decision 23: sum, then truncate). */
export const rebornWingLines = () =>
  loadChecked(
    'reborn/wing-lines',
    z.record(
      z.string(),
      z.array(z.array(z.object({ stat: int, field: wingField, value: z.number() }))).length(31),
    ),
  )

const rarity = z.enum(['GREEN', 'BLUE', 'PURPLE', 'RED', 'GOLD'])
const cardsSchema = z.object({
  boxes: z.array(z.object({ item: itemId, rarity })).length(5),
  collections: z
    .array(
      z.object({
        id: int.min(1).max(10),
        nameKey: z.string(),
        name: z.string(),
        rarity,
        box: itemId,
        cards: z.array(
          z.object({
            id: int.min(1).max(74),
            nameKey: z.string(),
            name: z.string(),
            image: z.string(),
          }),
        ),
      }),
    )
    .length(10),
})
export type RebornCards = z.infer<typeof cardsSchema>
/** The 10 card collections with their 74 cards, and the 5 boxes by rarity (decision 27). */
export const rebornCards = () => loadChecked('reborn/cards', cardsSchema)

/** Kennel shop offers in Feathers (decision 21). */
export const rebornKennelShop = () =>
  loadChecked(
    'reborn/kennel-shop',
    z.object({
      currency: itemId,
      offers: z.array(
        z.object({ item: itemId, price: int.positive(), level: int, dailyLimit: int.positive() }),
      ),
    }),
  )
