// Read-only access to the imported original game data (server/data/game, see tools/game-data).
// Files are loaded on first use and cached for the life of the process.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { AvatarStats } from '@pockie/game-core'

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

/** The 10 outfits the original creation screen offers (creatrole.tab, first rows). */
export function creationOutfits() {
  return load<Row[]>('creation-outfits').map((row) => ({
    clothing: Number(row.Cloth),
    gender: Number(row.Sex) as 0 | 1,
    weaponClass: Number(row.Pos),
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
export const item = (id: string) => load<Record<string, Row>>('items')[id]
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
export const scene = (id: number) => load<Record<string, Row>>('scenes')[String(id)]
export const sceneSwitchRule = (id: number) =>
  load<Record<string, Row>>('scene-switch-rules')[String(id)]
