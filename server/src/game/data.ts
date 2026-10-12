// Read-only access to the imported original game data (server/data/game, see tools/game-data).
// Files are loaded on first use and cached for the life of the process.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  AvatarStats,
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

/** Clothing (visual id) → AvatarID through avatarclothingmap.ini and the outfit item. */
export function avatarIdForClothing(clothing: number) {
  const map = load<Record<string, Row>>('avatar-clothing')[String(clothing)]
  const item = map && load<Record<string, Row>>('items')[String(map.AvatarConfig)]
  if (!item) throw new Error(`Unknown clothing ${clothing}`)
  return Number(item.AvatarID)
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
  return load<Record<string, Row[]>>('sub-tasks')[String(taskId)] ?? []
}

const list = (value: Row[string] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]

export const npc = (id: string) => load<Record<string, Row>>('npcs')[id]

/** skill.ini row of one skill id (without the id). */
export const skill = (id: number) =>
  load<Record<string, Omit<SkillInput, 'id'>>>('skills')[String(id)]

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

export const item = (id: string) => load<Record<string, Row>>('items')[id]
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
  load<Record<string, Row[]>>('task-monster-drops')[String(taskId)] ?? []

export const task = (id: number) => load<Record<string, Row>>('tasks')[String(id)]
let offeredTaskIds: number[] | undefined
/** Quests taken at an NPC: not auto-accepted and with a quest giver (Task.ini AcceptNpcConfig). */
export function npcOfferedTaskIds() {
  offeredTaskIds ??= Object.entries(load<Record<string, Row>>('tasks'))
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
