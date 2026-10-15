// Imports the M5 "Reborn" data (talents, bloodlines, souls, scroll skills, Dice of Fate buffs and
// event constants) into server/data/game/reborn/*.json, plus the names into
// client/src/i18n/reborn.json and tools/i18n/glossary.json. Numbers come 1:1 from Reborn's
// serverConfig and the normalized captures; where Reborn's server rule is unknown the value is our
// own design and cites its decision in .claude/plans/m5-reborn-update.plan.md. Only names are taken
// from Reborn's locale, never its sentences.
// M6 adds pets, wings, cards and the Kennel shop (import-reborn-m6.ts), which also read the 2011
// pet ini files (GAME_BACKUP_DIR, default ~/Privates/game-pockieninja).
// Run with `pnpm game-data:reborn [rawDir]` (default REBORN_RAW_DIR or <repo>/data/reborn-raw).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseIni } from './ini.ts'
import { buildM6, type M6Inputs } from './import-reborn-m6.ts'

const root = resolve(import.meta.dirname, '../..')
export const defaultRawDir = process.env.REBORN_RAW_DIR ?? join(root, 'data/reborn-raw')
export const defaultPetIniDir = join(
  process.env.GAME_BACKUP_DIR ?? join(homedir(), 'Privates/game-pockieninja'),
  'app/code/props/serv/game/Resource/pet',
)

/**
 * Reborn stat id -> our `Bonuses` field (decision 11), with the factor into our units. Attributes
 * are x100 internally. 9, 11 and 12 are already per-mille like `hpMul`/`attackMul`/`atkTimeMul`.
 * 31-40 follow Reborn's element order, which matches our SkillAdd trees (2801-2810 passives).
 * 18 is labelled "Defense Improvement %" in Reborn's locale, but the server gives it to the Guard
 * soul, the client panel shows that soul as block, and its values follow the Dodge ladder, so it is
 * the Block rating (`parry`), not `defenseMul` (task 1 check of decision 11).
 * 21, 23 and 24 are the wing ids of M6 decision 23 (Counter, Vampiric HP, Damage Reduction).
 */
export const STAT_FIELDS: Record<number, { field: string; scale: number }> = {
  1: { field: 'strength', scale: 100 },
  2: { field: 'agility', scale: 100 },
  3: { field: 'stamina', scale: 100 },
  4: { field: 'defense', scale: 1 },
  5: { field: 'neglectDefense', scale: 1 },
  6: { field: 'dodge', scale: 1 },
  7: { field: 'hit', scale: 1 },
  8: { field: 'hp', scale: 1 },
  9: { field: 'hpMul', scale: 1 },
  10: { field: 'maxAttack', scale: 1 },
  11: { field: 'attackMul', scale: 1 },
  12: { field: 'atkTimeMul', scale: 1 },
  13: { field: 'mp', scale: 1 },
  15: { field: 'crit', scale: 1 },
  16: { field: 'critAttach', scale: 1 },
  17: { field: 'tough', scale: 1 },
  18: { field: 'parry', scale: 1 },
  19: { field: 'pierce', scale: 1 },
  20: { field: 'minAttack', scale: 1 },
  21: { field: 'counter', scale: 1 },
  23: { field: 'vampiricHp', scale: 1 },
  24: { field: 'decDamage', scale: 1 },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, n) => [31 + n, { field: `skillAdd${n}`, scale: 1 }]),
  ),
}

function statField(stat: number) {
  const entry = STAT_FIELDS[stat]
  if (!entry) throw new Error(`Unknown Reborn stat id ${stat}: add it to STAT_FIELDS`)
  return entry
}

export function mapStat(stat: number, value: number) {
  const { field, scale } = statField(stat)
  return { stat, field, value: value * scale }
}

// --- Raw inputs -------------------------------------------------------------------------------

type ServerConfig = {
  TALENT: { expNeeded: Record<string, number>; costNeeded: Record<string, [number, number]> }
  bloodline: {
    Config: {
      itemsPerDay: number
      itemsPerTurnIn: number
      amityGainedPerTurnIn: number
      soulLevelLimits: number[]
    }
    Limits: Record<
      string,
      {
        level: number
        item: number
        amity: number
        avatar: number
        stats: [number, number, number]
        bonus: [number, number][]
      }
    >
    Souls: Record<string, { stat: number; levels: number[] }>
  }
  petFamilies: Record<string, number>
  WING: { Line: Record<string, [number, number][][]> }
  avatars: Record<string, RebornAvatar>
  avatarStars: Record<string, number | boolean>
}
type RebornAvatar = {
  value: number
  weaponType?: 'Sharp' | 'Blunt' | 'Fists' | 'Any'
  innate: { avatar: number; isv: number[]; bmv: number[]; skills: number[] }
}
type ScrollSkill = {
  id: number
  tooltipLines: string[]
  scrollItems: { sevenDay: { itemId: number }; permanent: { itemId: number } }
}
type Reward = { iid: number; amount?: number }
type Events = {
  dice: { rewards: { buffs: Record<string, string> } }
  daily_login: { rewards: { day_cycle: Reward[]; daily_bonus: Reward } }
  weekly_tasks: {
    rewards: {
      points_milestones: { points: number; item: string; iid?: number }[]
      day_rewards_need_50_points_and_must_be_that_weekday: (Reward & { dayIndex: number })[]
      weekly_bonus_after_all_7_day_rewards: Reward
    }
    limits: { tasks: { id: string; max: number; points: number }[] }
  }
  tailed_beast_event: {
    costs: { 'shop (essence)': { iid?: number; cost_essence?: number; limit?: number }[] }
    rewards: {
      'weekly_fight_boxes (tbClaimDamageReward {tierId})': { fights: number; iid: number }[]
      beasts: Record<string, string>
    }
  }
  team_stone: {
    rewards: { leagues_weekly_reward: { id: string; score: string; bc: number; items?: string }[] }
  }
}
type JsonItem = [string, ...unknown[]]

export interface RawInputs {
  serverConfig: ServerConfig
  locale: Record<string, unknown>
  items: Record<string, JsonItem>
  skills: { scrollSkills: { skills: ScrollSkill[] } }
  events: Events
  mainJs: string
  petArt: number[]
  pet2011: M6Inputs['pet2011']
  original: M6Inputs['original']
}

const PET_INI = [
  'NewPetCfg',
  'PetActCapital',
  'PetCfg',
  'PetFeedLib',
  'PetGrow',
  'PetSkillCnt',
  'PetSkillDepot',
  'PetSkillLib',
  'PetSkillSrc',
  'PetSrcPro',
]

export function readRaw(dir: string, petIniDir = defaultPetIniDir): RawInputs {
  const read = <T>(path: string) => JSON.parse(readFileSync(join(dir, path), 'utf8')) as T
  const game = <T>(name: string) =>
    JSON.parse(readFileSync(join(root, `server/data/game/${name}.json`), 'utf8')) as T
  const petDir = join(dir, 'assets/entities/pets')
  return {
    serverConfig: read('re/serverConfig.json'),
    locale: read('locales_en_translation.json'),
    items: read('json_items.json'),
    skills: read('re/normalized/skills.json'),
    events: read('re/normalized/events.json'),
    mainJs: readFileSync(join(dir, 're/main.js'), 'utf8'),
    petArt: readdirSync(petDir)
      .filter((avatar) => existsSync(join(petDir, avatar, 'data.json')))
      .map(Number),
    pet2011: Object.fromEntries(
      PET_INI.map((name) => [
        name,
        parseIni(readFileSync(join(petIniDir, `${name}.ini`), 'latin1')),
      ]),
    ),
    original: { items: game('items'), skills: game('skills'), skillAdds: game('skill-adds') },
  }
}

// --- Builders ---------------------------------------------------------------------------------

/** Decision 8: the enemy stat a talent narrows, and my stat it is compared with. */
const TALENT_STATS: [string, string][] = [
  ['pierce', 'parry'],
  ['parry', 'pierce'],
  ['neglectDefense', 'defense'],
  ['defense', 'neglectDefense'],
  ['crit', 'tough'],
  ['tough', 'crit'],
  ['hit', 'dodge'],
  ['dodge', 'hit'],
]

const LEVEL_CAP = 90 // decision 5
const ordered = <T>(record: Record<string, T>) =>
  Object.keys(record)
    .map(Number)
    .sort((a, b) => a - b)
    .map((key) => record[String(key)]!)

function buildTalents(config: ServerConfig) {
  return {
    unlockLevel: 51,
    /** Decision 6: talent level <= max(0, level - levelOffset). */
    levelOffset: 50,
    maxActive: 3,
    attemptsPerDay: 40,
    /** Decision 7. */
    expPerUpgrade: 100,
    critPercent: 10,
    critMultiplier: 3,
    /** expNeeded[L - 1]: EXP to reach level L. */
    expNeeded: ordered(config.TALENT.expNeeded),
    /** costs[n - 1] = [gold, stones] of the n-th upgrade of the day. */
    costs: ordered(config.TALENT.costNeeded),
    talents: TALENT_STATS.map(([stat, counter], i) => ({
      id: i + 1,
      nameKey: `reborn_talent_${i + 1}`,
      stat,
      counter,
    })),
  }
}

function buildBloodlines({ bloodline }: ServerConfig, label: (key: string) => string) {
  const limits = Object.entries(bloodline.Limits).map(([id, limit]) => ({
    id: Number(id),
    nameKey: `reborn_limit_${id}`,
    requiredLevel: limit.level,
    unlockItem: `i${limit.item}`,
    amity: limit.amity,
    avatar: limit.avatar,
    npcId: 81000 + Number(id),
    npcNameKey: `reborn_npc_${81000 + Number(id)}`,
    npcOutfit: `i${290000 + limit.avatar}`,
    base: {
      strength: limit.stats[0] * 100,
      agility: limit.stats[1] * 100,
      stamina: limit.stats[2] * 100,
    },
    bonus: limit.bonus.map(([stat, value]) => mapStat(stat, value)),
  }))
  const used = new Set([
    ...limits.flatMap((limit) => limit.bonus.map((b) => b.stat)),
    ...Object.values(bloodline.Souls).map((soul) => soul.stat),
  ])
  const stats = Object.fromEntries(
    [...used]
      .sort((a, b) => a - b)
      .map((stat) => [stat, { label: label(`stat__${stat}`), ...statField(stat) }]),
  )
  return {
    itemsPerTurnIn: bloodline.Config.itemsPerTurnIn,
    amityPerTurnIn: bloodline.Config.amityGainedPerTurnIn,
    /** Decision 12: counts turn-ins, not items. */
    turnInsPerDay: bloodline.Config.itemsPerDay,
    maxActive: 3,
    stats,
    limits,
  }
}

function buildSouls({ bloodline }: ServerConfig) {
  return {
    inventory: 250,
    socketsPerLimit: 5,
    /** Decision 13: levels that need 91 are clamped to our cap. */
    levelLimits: bloodline.Config.soulLevelLimits.map((level) => Math.min(level, LEVEL_CAP)),
    /** Decision 15: type uniform over 1-13; level odds in percent for levels 1, 2, 3. */
    discover: { perDay: 10, perDayVip: 30, levelOdds: [70, 25, 5] },
    synthesis: { count: 3, maxLevel: 10 },
    /** Decision 16 (prayerBonusPerLevel is ours: 8 Reborn points, x100 internal). */
    prayer: {
      maxLevel: 9,
      expBase: 5000,
      soulExpBase: 100,
      soulExpFactor: 3,
      bonusPerLevel: 800,
      attributes: ['strength', 'agility', 'stamina'],
    },
    /** valueByLevel[level], level 0-10, Reborn units (sum, then truncate). */
    types: Object.entries(bloodline.Souls).map(([id, soul]) => ({
      id: Number(id),
      nameKey: `reborn_soul_${id}`,
      stat: soul.stat,
      field: statField(soul.stat).field,
      valueByLevel: soul.levels,
    })),
  }
}

/** Reborn tooltip trigger -> skill.ini type/quomodo/effect, as our ninjutsu with the same tooltip. */
const TRIGGERS: Record<string, { type: number; quomodo: number; effect: number }> = {
  attack: { type: 1, quomodo: 2, effect: 1 },
  before_attack: { type: 2, quomodo: 2, effect: 2 },
  before_enemy_turn: { type: 2, quomodo: 3, effect: 2 },
  after_damage: { type: 2, quomodo: 4, effect: 2 },
  additional_attack: { type: 2, quomodo: 7, effect: 1 },
}
/** Damage type -> SkillAdd tree (2801-2810 order). */
const ELEMENTS = [
  'fire',
  'water',
  'earth',
  'lightning',
  'wind',
  'body',
  'tool',
  'sealing',
  'illusion',
  'healing',
]
/** Rinne (cleanse or heal) and Izanami (restore and revive) show no damage type: healing tree. */
const ELEMENT_OVERRIDES: Record<number, string> = { 1833: 'healing', 1834: 'healing' }

function scrollSkillInfo(skill: ScrollSkill) {
  const text = skill.tooltipLines.join('\n')
  const trigger = /tooltip__trigger--(\w+)/.exec(text)?.[1] ?? ''
  const element = ELEMENT_OVERRIDES[skill.id] ?? /tooltip__damage--(\w+)/.exec(text)?.[1] ?? ''
  const chance = /tooltip__cast_chance\]\]: (\d+)\D+(\d+)%/.exec(text)
  if (!TRIGGERS[trigger] || !ELEMENTS.includes(element) || !chance)
    throw new Error(`Cannot read the tooltip of scroll skill ${skill.id}`)
  return {
    trigger,
    element,
    castChance: [Number(chance[1]), Number(chance[2])] as [number, number],
    /** Decision 17: multiplies the level-based MP amount of the ninjutsu scripts; 0 = none. */
    chakra: Number(/\(\(([\d.]+)\)\)/.exec(text)?.[1] ?? 0),
  }
}

function buildScrollSkills(skills: ScrollSkill[]) {
  const rows: Record<string, Record<string, number | string>> = {}
  const info: Record<string, unknown> = {}
  for (const skill of skills) {
    const { trigger, element, castChance, chakra } = scrollSkillInfo(skill)
    const { type, quomodo, effect } = TRIGGERS[trigger]!
    rows[skill.id] = {
      canbecounter: type === 1 ? 1 : 0,
      decmp: 0,
      effect,
      javascript: `skill/skill_scroll_${skill.id}.js`,
      level: 1,
      probability: castChance[0],
      quomodo,
      secondid: skill.id,
      skilladdtype: ELEMENTS.indexOf(element),
      skillvalue: 100,
      type,
    }
    info[skill.id] = {
      element,
      trigger,
      /** [low, high] cast chance; the SkillAdd bonus is capped at the high end. */
      castChance,
      chakra,
      sevenDayItem: `i${skill.scrollItems.sevenDay.itemId}`,
      permanentItem: `i${skill.scrollItems.permanent.itemId}`,
    }
  }
  return { rows, info }
}

function buildItems(items: Record<string, JsonItem>) {
  const scrolls = Object.entries(items).filter(([id]) => /^5401\d\d$|^5400\d\d$/.test(id))
  return Object.fromEntries(
    scrolls.map(([id, [icon, ...rest]]) => {
      const extra = rest[6] as { skillId: number; permanent?: boolean }
      return [
        `i${id}`,
        {
          AddSkillId: extra.skillId,
          BindingType: 0,
          CanDrop: 1,
          CanTrade: 0,
          CanUse: 1,
          ItemMaxFoldNum: 99,
          ItemShapeType: 1,
          ItemType: 1,
          JavaScript: 'item/SkillScrollItem.js',
          JudgeValueScore: 0,
          Name: `reborn_item_${id}`,
          /** Reborn icon path (assets/icons/items/<path>.png), exported by task 3. */
          ResourceID: `reborn/${icon}`,
          /** Decision 18: 7-day scroll, 0 = permanent. */
          ScrollDays: extra.permanent ? 0 : 7,
          UseLevel: 1,
          class: 'SkillScrollItem',
        },
      ]
    }),
  )
}

/** Reborn's outfit imprint skills: 2000-2092, element * 10 + tier. */
const IMPRINT = /^20\d\d$/
const OUTFIT_TIERS_FROM = 1 // AvatarLevel of an outfit's +0 row

/**
 * Reborn's outfit data (serverConfig.avatars) by our clothing id: ISV and BMV in our hundredths,
 * the imprint skill, the outfit value and its Weapon Type. Reborn item 29xxxx is our clothing xxxx when its art
 * (`innate.avatar`) is that clothing and we have the outfit; other Reborn outfits are skipped.
 */
export function buildOutfits(config: ServerConfig, items: Record<string, Record<string, unknown>>) {
  const ours = new Set(
    Object.values(items)
      .filter((row) => row.class === 'AvatarItem' && Number(row.AvatarLevel) === OUTFIT_TIERS_FROM)
      .map((row) => Number(row.Clothing)),
  )
  const hundredths = (values: number[]) => values.map((n) => Math.round(n * 100))
  const outfits = Object.entries(config.avatars).flatMap(([id, avatar]) => {
    const clothing = Number(id) - 290000
    if (avatar.innate.avatar !== clothing || !ours.has(clothing)) return []
    const imprints = avatar.innate.skills.filter((skill) => IMPRINT.test(String(skill)))
    // Three value-0 outfits (59, 68, 73) have no imprint.
    if (imprints.length > 1) throw new Error(`Reborn outfit ${id} has ${imprints.length} imprints`)
    return [
      [
        String(clothing),
        {
          rebornItem: Number(id),
          value: avatar.value,
          isv: hundredths(avatar.innate.isv),
          bmv: hundredths(avatar.innate.bmv),
          imprint: imprints[0] ?? null,
          // Reborn's client reads a missing weaponType as Any (fits every weapon).
          weaponType: avatar.weaponType ?? 'Any',
        },
      ],
    ]
  })
  return { stars: config.avatarStars, outfits: Object.fromEntries(outfits) }
}

/** Decision 25: Con maps to `tough`, the other seven stats 1:1, as the original 80101-80202. */
const DICE_STATS = [
  'DodgeMulBuff',
  'ParryMulBuff',
  'HitMulBuff',
  'PierceBuff',
  'CritMulBuff',
  'NeglectDefAttachBuff',
  'DefenseBuff',
]
function buildDiceBuffs(events: Events) {
  const buffs: Record<string, unknown> = {}
  const properties: Record<string, Record<string, number>> = {}
  const durations: Record<string, number> = {}
  for (const [id, text] of Object.entries(events.dice.rewards.buffs)) {
    const [con, other] = (text.match(/[+-]\d+/g) ?? []).map(Number)
    const hours = Number(/(\d+)h\)/.exec(text)?.[1])
    if (con === undefined || other === undefined || !hours)
      throw new Error(`Cannot read Dice of Fate buff ${id}`)
    buffs[id] = {
      buffadd: Number(id),
      cleartype: 0,
      deltype: 0,
      overlying: 1,
      replace: 3,
      type: 1,
      validity: 3,
    }
    properties[id] = {
      ToughBuff: con,
      ...Object.fromEntries(DICE_STATS.map((name) => [name, other])),
    }
    durations[id] = hours * 3600
  }
  return { buffs: { buffs, properties }, durations }
}

const reward = ({ iid, amount }: Reward) => ({ item: `i${iid}`, amount: amount ?? 1 })
/** Decision 24: weekly activities we have; Valhalla becomes "Clear a toll gate". */
const WEEKLY_IDS: Record<string, string> = {
  arenaDuel: 'arenaDuel',
  duelFriend: 'duelFriend',
  valhalla: 'tollGate',
  slotMachine: 'pubFight',
  lasNoches: 'lasNoches',
  twentyMinReward: 'twentyMinReward',
  globalChat: 'globalChat',
  mission: 'mission',
}

function buildEvents(events: Events, scrollItems: string[], diceDurations: Record<string, number>) {
  const weekly = events.weekly_tasks
  const beast = events.tailed_beast_event
  return {
    /** Decision 23: daily 00:00 UTC, weekly Monday 00:00 UTC. */
    dailyLogin: {
      cycle: events.daily_login.rewards.day_cycle.map(reward),
      bonus: reward(events.daily_login.rewards.daily_bonus),
    },
    weekly: {
      activities: weekly.limits.tasks
        .filter((task) => WEEKLY_IDS[task.id])
        .map((task) => ({ id: WEEKLY_IDS[task.id]!, max: task.max, points: task.points })),
      milestones: weekly.rewards.points_milestones.map((m) =>
        m.iid
          ? { points: m.points, item: `i${m.iid}`, amount: Number(/x(\d+)/.exec(m.item)?.[1]) }
          : { points: m.points, gold: Number(/(\d+) Gold/.exec(m.item)?.[1]) },
      ),
      weekdayThreshold: 50,
      weekdayRewards: weekly.rewards.day_rewards_need_50_points_and_must_be_that_weekday.map(
        (day) => ({ dayIndex: day.dayIndex, ...reward(day) }),
      ),
      bonus: reward(weekly.rewards.weekly_bonus_after_all_7_day_rewards),
    },
    /** Decision 25. Tiers by net lucky dice, best first. */
    dice: {
      rollsPerDay: 10,
      dice: 6,
      replenishCost: 10000,
      clearCurseCost: 5000,
      tiers: [
        { minNet: 4, buff: 80102 },
        { minNet: 2, buff: 80101 },
        { minNet: -1, buff: null },
        { minNet: -3, buff: 80201 },
        { minNet: -6, buff: 80202 },
      ],
      durationSeconds: diceDurations,
    },
    /** Decision 26. */
    twentyMinute: { cooldownSeconds: 1200, giftCoupons: 10, claimsPerDay: 6 },
    /** Decision 27. */
    tailedBeast: {
      beasts: Object.entries(beast.rewards.beasts)
        .filter(([id]) => Number(id) <= 9)
        .map(([id]) => ({ id: Number(id), nameKey: `reborn_beast_${id}` })),
      ticketsPerDay: 10,
      ticketCost: [1, 3, 5],
      hp: [750_000_000, 1_000_000_000, 1_250_000_000],
      level: { base: 25, perBeast: 5, perMode: 25 },
      honorPerDamage: 100_000,
      boxes: beast.rewards['weekly_fight_boxes (tbClaimDamageReward {tierId})']
        .map((box) => ({ fights: box.fights, item: `i${box.iid}` }))
        .sort((a, b) => a.fights - b.fights),
      kageChoices: ['i100004', 'i161007', 'i150117', 'i159140'],
      shop: [
        ...beast.costs['shop (essence)']
          .filter((offer) => offer.cost_essence)
          .map((offer) => ({
            item: `i${offer.iid}`,
            essence: offer.cost_essence!,
            ...(offer.limit ? { limit: offer.limit } : {}),
          })),
        // Decision 19: the 7-day scrolls.
        ...scrollItems.map((item) => ({ item, essence: 300 })),
      ],
    },
    /** Decision 28. Leagues pay Battle Coins 1:1. */
    teamStone: {
      minLevel: 50,
      attemptsPerDay: 25,
      teamSize: 3,
      botFillSeconds: [15, 30],
      leagues: events.team_stone.rewards.leagues_weekly_reward.map((league) => {
        const item = /x(\d+) \(iid (\d+)\)/.exec(league.items ?? '')
        return {
          id: league.id,
          nameKey: `reborn_league_${league.id}`,
          minScore: Number(/^\d+/.exec(league.score)?.[0]),
          battleCoins: league.bc,
          ...(item ? { item: `i${item[2]}`, amount: Number(item[1]) } : {}),
        }
      }),
    },
  }
}

// --- Names ------------------------------------------------------------------------------------

type Kind = 'npc' | 'item' | 'skill' | 'title'
type Name = { key: string; kind: Kind; name: string }

/** Reborn has no outfit 290115 (limit 32's NPC); our item i290115 is "Gin Ichimaru +1". */
const NPC_NAME_FALLBACK: Record<string, string> = { 'item__290115--name': 'Gin Ichimaru' }

function buildNames(
  raw: RawInputs,
  parts: {
    talents: ReturnType<typeof buildTalents>
    bloodlines: ReturnType<typeof buildBloodlines>
    souls: ReturnType<typeof buildSouls>
    skillIds: string[]
    items: string[]
    events: ReturnType<typeof buildEvents>
  },
  label: (key: string) => string,
): Name[] {
  const capitalize = (id: string) => id[0]!.toUpperCase() + id.slice(1)
  return [
    ...parts.talents.talents.map((t) => ({
      key: t.nameKey,
      kind: 'skill' as const,
      name: label(`talent__${t.id}--name`),
    })),
    ...parts.bloodlines.limits.flatMap((l) => [
      { key: l.nameKey, kind: 'skill' as const, name: label(`limit__${l.id}`) },
      {
        key: l.npcNameKey,
        kind: 'npc' as const,
        name:
          NPC_NAME_FALLBACK[`item__${l.npcOutfit.slice(1)}--name`] ??
          label(`item__${l.npcOutfit.slice(1)}--name`),
      },
    ]),
    ...parts.souls.types.map((s) => ({
      key: s.nameKey,
      kind: 'skill' as const,
      name: label(`soul__${s.id}`),
    })),
    ...parts.skillIds.map((id) => ({
      key: `lg_Skill_${id}`,
      kind: 'skill' as const,
      name: label(`skill__${id}--name`),
    })),
    ...parts.items.map((id) => ({
      key: `lg_reborn_item_${id.slice(1)}`,
      kind: 'item' as const,
      name: label(`item__${id.slice(1)}--name`),
    })),
    ...parts.events.tailedBeast.beasts.map((b) => ({
      key: b.nameKey,
      kind: 'npc' as const,
      name: raw.events.tailed_beast_event.rewards.beasts[String(b.id)]!,
    })),
    ...parts.events.teamStone.leagues.map((l) => ({
      key: l.nameKey,
      kind: 'title' as const,
      name: capitalize(l.id),
    })),
  ]
}

export function buildReborn(raw: RawInputs) {
  const label = (key: string) => {
    const value = raw.locale[key]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing Reborn name ${key}`)
    return value.trim()
  }
  const talents = buildTalents(raw.serverConfig)
  const bloodlines = buildBloodlines(raw.serverConfig, label)
  const souls = buildSouls(raw.serverConfig)
  const scroll = buildScrollSkills(raw.skills.scrollSkills.skills)
  const items = buildItems(raw.items)
  const dice = buildDiceBuffs(raw.events)
  const sevenDay = Object.keys(items).filter((id) => id.startsWith('i5400'))
  const events = buildEvents(raw.events, sevenDay, dice.durations)
  const outfits = buildOutfits(raw.serverConfig, raw.original.items)
  const m6 = buildM6(
    {
      items: raw.items,
      petFamilies: raw.serverConfig.petFamilies,
      wingLines: raw.serverConfig.WING.Line,
      mainJs: raw.mainJs,
      petArt: raw.petArt,
      pet2011: raw.pet2011,
      original: raw.original,
    },
    raw.locale,
    label,
    mapStat,
  )
  const names = buildNames(
    raw,
    {
      talents,
      bloodlines,
      souls,
      skillIds: Object.keys(scroll.rows),
      items: Object.keys(items),
      events,
    },
    label,
  ).concat(m6.names)
  return {
    files: {
      talents,
      bloodlines,
      souls,
      skills: scroll.rows,
      'scroll-skills': scroll.info,
      items: { ...items, ...m6.items },
      'nonfight-buffs': dice.buffs,
      events,
      outfits,
      ...m6.files,
    } as Record<string, unknown>,
    names: Object.fromEntries(names.map(({ key, name }) => [key, name])),
    /** Names the M6 import owns; the CLI always writes these. */
    m6Names: new Set(m6.names.map(({ key }) => key)),
    glossary: names,
  }
}

/**
 * M5 outputs were reviewed by hand after their import (name typos, wording, quest texts), and the
 * raw capture was re-fetched for M6 since, so the CLI keeps them: it writes the M6 files and
 * items.json, adds missing names and overwrites only the M6 ones.
 */
export const M5_REVIEWED = new Set([
  'talents',
  'bloodlines',
  'souls',
  'skills',
  'scroll-skills',
  'nonfight-buffs',
  'events',
])

export function mergeNames<T>(
  existing: Record<string, T>,
  generated: Record<string, T>,
  owned: Set<string>,
): Record<string, T> {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(generated)) {
    if (owned.has(key) || !(key in merged)) merged[key] = value
  }
  return merged
}

const pretty = (data: unknown, indent = 2) => `${JSON.stringify(data, null, indent)}\n`
const sortKeys = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)))

if (import.meta.main) {
  const rawDir = resolve(process.argv[2] ?? defaultRawDir)
  const { files, names, m6Names, glossary } = buildReborn(readRaw(rawDir))
  for (const [name, data] of Object.entries(files)) {
    if (M5_REVIEWED.has(name)) continue
    writeFileSync(join(root, `server/data/game/reborn/${name}.json`), pretty(data))
    console.log(`reborn/${name}.json`)
  }
  const readJson = (file: string) =>
    JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const namesFile = join(root, 'client/src/i18n/reborn.json')
  const mergedNames = mergeNames(readJson(namesFile), names, m6Names)
  writeFileSync(namesFile, pretty(mergedNames))
  const glossaryFile = join(root, 'tools/i18n/glossary.json')
  const entries = Object.fromEntries(
    glossary.map(({ key, kind, name }) => [key, { kind, source: name, en: name }]),
  )
  writeFileSync(
    glossaryFile,
    pretty(sortKeys(mergeNames(readJson(glossaryFile), entries, m6Names)), 1),
  )
  console.log(`${Object.keys(mergedNames).length} names`)
}
