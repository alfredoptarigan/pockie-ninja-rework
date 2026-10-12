// Reads what the export needs from the game backup (client key-value tables) and from the
// imported game data (server/data/game): which outfits, monsters, NPCs and scenes to export.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeCompressedAmf3 } from '../game-data/amf3.ts'
import { tableRows } from '../game-data/import.ts'
import { paths } from './paths.ts'

export const VILLAGE_SCENES = [111, 121, 131, 141, 151]
/** Angel City and Demon City (maincity art like the villages). */
export const CITY_SCENES = [161, 171]
/** Fields with art: xx01-xx03 of every village and all neutral fields (xx04 are Christmas maps). */
export const FIELD_SCENES = [
  ...[21, 22, 23, 24, 25].flatMap((zone) => [1, 2, 3].map((map) => zone * 100 + map)),
  ...[2601, 2602, 2603, 2604, 2605, 2701, 2702, 2703, 2704, 2801, 2802, 2803, 2804],
]
/** Las Noches entry (3101), toll gate lobby (3102) and the Las Noches floor scenes 61-64. */
export const INSTANCE_SCENES = [3101, 3102, 61, 62, 63, 64]
export const SCENES = [...VILLAGE_SCENES, ...CITY_SCENES, ...FIELD_SCENES, ...INSTANCE_SCENES]
const MONSTER_CLASSES = new Set(['NormalNpc', 'TaskBossNpc', 'SnowNpc', 'TicketBossNpc'])
// Fighters outside the scenes (docs/original-data/toll-gates.md): toll gate groups n300-n308xxx,
// n601-n608xxx, n705-n708xxx, Las Noches floors n900001-n900170, pub fight NPCs n8000xxx.
const INSTANCE_NPC = /^n(?:30[0-8]\d{3}|60[1-8]\d{3}|70[5-8]\d{3}|900\d{3}|8000\d{3})$/
// "MapUserFace_N33017".substr(12) in RoleObjectBase.as; "OutUserFace_" has the same length.
const MONSTER_ART = /^(?:Map|Out)UserFace_/

type Row = Record<string, unknown>

function gameData<T>(name: string): T {
  return JSON.parse(readFileSync(join(paths.gameData, `${name}.json`), 'utf8')) as T
}

/** Latest version of a client table: files are named <name>.s<version>.kv (or <name>.kv). */
function keyValueTable(name: string): Record<string, string> {
  const versions = readdirSync(paths.keyValueTables)
    .map((file) => ({ file, match: new RegExp(`^${name}(?:\\.s(\\d+))?\\.kv$`).exec(file) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ file: entry.file, version: Number(entry.match![1] ?? 0) }))
    .sort((a, b) => b.version - a.version)
  if (!versions[0]) throw new Error(`No ${name} table in ${paths.keyValueTables}`)
  return decodeCompressedAmf3(readFileSync(join(paths.keyValueTables, versions[0].file))) as Record<
    string,
    string
  >
}

/** Table paths look like "\source\movieclip\motion\...swf", relative to the apache folder. */
export function backupPath(tablePath: string) {
  return join(paths.apache, ...tablePath.split('\\').filter(Boolean))
}

let motionSources: Record<string, string> | undefined
let iconSources: Record<string, string> | undefined

/** Binary_MotionSourceList: motion key (e.g. "Motion_0_45_999_Role") to SWF path. */
export function motionSourceList() {
  return (motionSources ??= keyValueTable('motionsourcelist'))
}

/** IconSourceList: bitmap key (e.g. "UserFace_N33017") to image path. */
export function iconSource(key: string) {
  const path = (iconSources ??= keyValueTable('iconsourcelist'))[key]
  return path ? backupPath(path) : undefined
}

/** Motion id of a motion file: motion_0_45_999_role.s118.swf and motion_10076_999.s117.swf give 999. */
export function motionIdOf(file: string) {
  const parts = file
    .toLowerCase()
    .replace(/(\.s\d+)?\.swf$/, '')
    .replace(/_role$/, '')
    .split('_')
  return parts.at(-1)!
}

export interface Outfit {
  clothing: number
  sex: number
  dir: string
}

/** Clothing ids of avatar-clothing.json, and those with an English name (the 92 base outfits). */
export function namedClothing() {
  const clothing = Object.keys(gameData<Record<string, unknown>>('avatar-clothing')).map(Number)
  const english = JSON.parse(readFileSync(paths.english, 'utf8')) as Record<string, string>
  return { clothing, named: clothing.filter((id) => english[`lg_name_avatar${id}`]) }
}

/**
 * The base outfits: every clothing id of avatar-clothing.json with an English name (unnamed slots
 * are unused by players) and motion art under motion/people, plus the unnamed outfits that
 * people NPCs wear (77-83). `unnamed` lists the unnamed ids left out.
 */
export function outfits() {
  const { clothing, named } = namedClothing()
  const worn = Object.values(peopleNpcs()).map((art) => art.clothing)
  const wanted = clothing.filter((id) => named.includes(id) || worn.includes(id))
  const found: Outfit[] = []
  const missing: number[] = []
  for (const id of wanted) {
    const dir = join(paths.movieclips, 'motion/people', `people_${id}`)
    const sample = safeList(dir).find((file) => file.startsWith('motion_'))
    if (!sample) missing.push(id)
    else found.push({ clothing: id, sex: Number(sample.split('_')[1]), dir })
  }
  return { found, missing, unnamed: clothing.filter((id) => !wanted.includes(id)) }
}

function safeList(dir: string) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function sceneNpcIds(sceneId: number) {
  const placed = gameData<Record<string, { r: string[] }>>('scene-npcs')[sceneId]?.r ?? []
  const timed = gameData<Record<string, { r: string[] }>>('scene-timed-npcs')[sceneId]?.r ?? []
  return [...new Set([...placed, ...timed].map((row) => row.split(',')[0]!))]
}

function npcRows() {
  return gameData<Record<string, Row>>('npcs')
}

/** Monster npcs of every field (xx04 included) plus the instance fighters. */
function fighterIds() {
  const npcs = npcRows()
  const fields = Object.keys(gameData<Record<string, unknown>>('scenes'))
    .map(Number)
    .filter((id) => id >= 2100 && id < 2900)
  const placed = fields
    .flatMap(sceneNpcIds)
    .filter((id) => MONSTER_CLASSES.has(String(npcs[id]?.class)))
  return [...new Set([...placed, ...Object.keys(npcs).filter((id) => INSTANCE_NPC.test(id))])]
}

/**
 * Monster art keys of every fighter (e.g. N33017), and npc id to key for every npc drawn with one
 * of them: explore and ticket boss level variants reuse their base monster's art.
 */
export function monsterNpcs() {
  const npcs = npcRows()
  const art = (id: string) => String(npcs[id]?.ResourceID ?? '')
  const keys = new Set(
    fighterIds()
      .filter((id) => MONSTER_ART.test(art(id)))
      .map((id) => art(id).slice(12)),
  )
  const monsters: Record<string, string> = {}
  for (const id of Object.keys(npcs).sort())
    if (MONSTER_ART.test(art(id)) && keys.has(art(id).slice(12))) monsters[id] = art(id).slice(12)
  return { keys: [...keys].sort(), monsters }
}

export interface PeopleArt {
  sex: number
  clothing: number
  /** Weapon key of the weapon layers (e.g. "sharp1"). */
  weapon: string
}

/**
 * Fighters drawn like players (Binary_PeopleNpc, RoleObjectBase.as): toll gate, Las Noches and pub
 * fight NPCs whose ResourceID is a TGate/Avatar/ArenaUserFace key use an outfit and a weapon.
 */
export function peopleNpcs() {
  const npcs = npcRows()
  const table = keyValueTable('peoplenpc')
  const people: Record<string, PeopleArt> = {}
  for (const id of fighterIds().sort()) {
    const value = table[String(npcs[id]?.ResourceID)]
    if (!value) continue
    const [sex, clothing, weapon] = value.split(',')
    people[id] = { sex: Number(sex), clothing: Number(clothing), weapon: weapon!.toLowerCase() }
  }
  return people
}

/** Non-monster NPCs placed in the exported scenes: npc id to art resource (e.g. N21001). */
export function sceneNpcs() {
  const npcs = npcRows()
  const result: Record<string, string> = {}
  // Not in the scene tables: the Mysterious Merchant (MysticNpcTime.ini spawns it in 2601-2605) and
  // the two xx04 event NPCs the M3 plan lists.
  for (const id of [...SCENES.flatMap(sceneNpcIds), 'n28001', 'n27001', 'n27002']) {
    const row = npcs[id]
    if (row && !MONSTER_CLASSES.has(String(row.class))) result[id] = String(row.ResourceID)
  }
  return result
}

let sources: Map<string, string> | undefined

/** Binary_SourceList (datatable/SourceList.tab): class source id to its path in the backup. */
function sourceList() {
  return (sources ??= new Map(
    tableRows(
      decodeCompressedAmf3(
        readFileSync(join(paths.apache, 'source/binary/datatable/SourceList.tab')),
      ) as Record<string, unknown[]>,
    ).map((row) => [String(row.SourceID), backupPath(String(row.SourcePath))]),
  ))
}

/**
 * Toll gate scenes (TollClone.as, client-defined ids 1000xx): the shared backdrop, the gate map
 * (Scene_Element_<id>) and the fight background (Binary_SceneFight, FightBG999 = the arena).
 */
export function tollGateScenes() {
  const list = sourceList()
  const fights = keyValueTable('scenefight')
  const ids = [...list.keys()]
    .map((id) => /^Scene_Element_(1000\d\d)$/.exec(id)?.[1])
    .filter((id): id is string => Boolean(id))
    .sort()
  return ids.map((id) => ({
    id,
    background: list.get(`Scene_BackGround_${id}`)!,
    map: list.get(`Scene_Element_${id}`)!,
    fight: list.get(fights[id] ?? 'FightBG999')!,
  }))
}

/** Building clip names per scene from scene-buildings.json. */
export function sceneBuildings() {
  const rows = gameData<{ SceneID: number; ClipName: string }[]>('scene-buildings')
  const result: Record<number, string[]> = {}
  for (const row of rows) (result[row.SceneID] ??= []).push(row.ClipName)
  return result
}
