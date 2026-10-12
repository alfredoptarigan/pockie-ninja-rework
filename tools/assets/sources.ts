// Reads what the export needs from the game backup (client key-value tables) and from the
// imported game data (server/data/game): which outfits, monsters, NPCs and scenes to export.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeCompressedAmf3 } from '../game-data/amf3.ts'
import { paths } from './paths.ts'

export const VILLAGE_SCENES = [111, 121, 131, 141, 151]
export const FIELD_SCENES = [2101, 2201, 2301, 2401, 2501]
const MONSTER_CLASSES = new Set(['NormalNpc', 'TaskBossNpc', 'SnowNpc', 'TicketBossNpc'])

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
 * are unused in the original) and motion art under motion/people.
 */
export function outfits() {
  const { clothing, named } = namedClothing()
  const found: Outfit[] = []
  const missing: number[] = []
  for (const id of named) {
    const dir = join(paths.movieclips, 'motion/people', `people_${id}`)
    const sample = safeList(dir).find((file) => file.startsWith('motion_'))
    if (!sample) missing.push(id)
    else found.push({ clothing: id, sex: Number(sample.split('_')[1]), dir })
  }
  return { found, missing, unnamed: clothing.filter((id) => !named.includes(id)) }
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

/** Monsters of the field scenes: npc id to art resource (e.g. n33017 to N33017). */
export function fieldMonsters() {
  const npcs = npcRows()
  const monsters: Record<string, string> = {}
  for (const id of FIELD_SCENES.flatMap(sceneNpcIds)) {
    const row = npcs[id]
    if (!row || !MONSTER_CLASSES.has(String(row.class))) continue
    // "MapUserFace_N33017".substr(12) in RoleObjectBase.as; "OutUserFace_" has the same length.
    monsters[id] = String(row.ResourceID).slice(12)
  }
  return monsters
}

/** Non-monster NPCs placed in the slice's scenes: npc id to art resource (e.g. N21001). */
export function sceneNpcs() {
  const npcs = npcRows()
  const result: Record<string, string> = {}
  for (const id of [...VILLAGE_SCENES, ...FIELD_SCENES].flatMap(sceneNpcIds)) {
    const row = npcs[id]
    if (row && !MONSTER_CLASSES.has(String(row.class))) result[id] = String(row.ResourceID)
  }
  return result
}

/** Building clip names per scene from scene-buildings.json. */
export function sceneBuildings() {
  const rows = gameData<{ SceneID: number; ClipName: string }[]>('scene-buildings')
  const result: Record<number, string[]> = {}
  for (const row of rows) (result[row.SceneID] ??= []).push(row.ClipName)
  return result
}
