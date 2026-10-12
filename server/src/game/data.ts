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
