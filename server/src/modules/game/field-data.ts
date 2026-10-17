// World rules on top of the imported data (server/data/game) that only travel and the fields use:
// ExceptTaskScene.ini, Reborn field bosses, LevelAttackRec and the NPC menus.
// server/src/game/data.ts belongs to the forge task, so these files are read here.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { nationScenes, npc, sceneLinks, sceneSwitchRule } from '../../game/data.js'

const dataDir = fileURLToPath(new URL('../../../data/game/', import.meta.url))
const cache = new Map<string, unknown>()
function load<T>(name: string): T {
  if (!cache.has(name)) {
    cache.set(name, JSON.parse(readFileSync(`${dataDir}${name}.json`, 'utf8')))
  }
  return cache.get(name) as T
}

const lines = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]

/** ExceptTaskScene.ini: quests that let a ninja into another village's field. */
export function exceptTaskIds(sceneId: number): number[] {
  const rows = load<Record<string, { TaskID: number }[]>>('except-task-scenes')[String(sceneId)]
  return (rows ?? []).map((row) => row.TaskID)
}

export interface FieldBoss {
  npcId: string
  /** Canonical Reborn appearance; village quest IDs remain local. */
  artId: string
  nameKey: string
  x: number
  y: number
  scale: number
}

/** Reborn serverConfig.scenes.boss: standing ticket bosses, without the 2011 spawn clock. */
export function ticketBoss(sceneId: number): FieldBoss | undefined {
  return load<Record<string, FieldBoss>>('reborn/field-bosses')[String(sceneId)]
}

/** LevelAttackRec (npcrecord.ini, values `min,max,npcId`): the variant fought at this level. */
export function levelVariant(npcId: string, level: number) {
  const record = load<Record<string, { LevelAttackRec?: number }>>('npc-records')[npcId]
  if (record?.LevelAttackRec === undefined) return npcId
  const values = load<Record<string, { r: unknown }>>('npc-record-values')
  for (const line of lines(values[String(record.LevelAttackRec)]?.r)) {
    const [min = 0, max = 0, id = npcId] = line.split(',')
    if (level >= Number(min) && level <= Number(max) && npc(id)) return id
  }
  return npcId
}

/** What an NPC's script opens (npc.ini `JavaScript`); null for talk-only NPCs. */
export type NpcMenu = 'shop' | 'merchant' | 'forge' | 'gates' | 'daily' | 'rest' | 'arena'
const MENUS: Record<string, NpcMenu> = {
  // Reborn's Arena NPC (11002): Enter Arena, and Hunt Monsters.
  'npc/arenaNpc.js': 'arena',
  'npc/pharmacyNpc.js': 'shop',
  'npc/equipNpc.js': 'shop',
  'npc/magicNpc.js': 'shop',
  'npc/blackshop.js': 'shop',
  'npc/MysticShopNpc.js': 'merchant',
  'npc/foundryNpc.js': 'forge',
  'npc/EntryTollGateScene.js': 'gates',
  'npc/SingleGateEntryNpc.js': 'gates',
  'npc/DailyTaskNpc.js': 'daily',
  'npc/TeamStoneNpc.js': 'rest',
}
export const npcMenu = (npcId: string): NpcMenu | null =>
  MENUS[String(npc(npcId)?.JavaScript)] ?? null

/** TeamStoneNpc.js: resting costs `-0.005 L² + 1.593 L + 61.72` Stone above level 10. */
export const restCost = (level: number) =>
  level > 10 ? Math.trunc(-0.005 * level * level + 1.593 * level + 61.72) : 0

let walkable: number[] | undefined
/**
 * Map targets a ninja can walk to from the villages ("Go out" to the first field, then scene exits,
 * scenequeue.ini). The
 * world map offers these only once entered (decision 7); the rest (161, the 2605 ring, 28xx) are
 * entered from the map in the original, so the map keeps them open.
 */
export function visitRequiredScenes() {
  if (walkable) return walkable
  const villages = Object.values(nationScenes()).flatMap((n) => [n.castle, n.field])
  const seen = new Set<number>(villages)
  const queue = [...villages]
  while (queue.length > 0) {
    for (const next of sceneLinks(queue.shift()!)) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  walkable = [...seen].filter((id) => sceneSwitchRule(id)).sort((a, b) => a - b)
  return walkable
}

/**
 * The building picture an NPC stands for (scenecitybuild.tab `ClipName`, matched by BuildType in
 * the same scene, as the original client does), or null.
 */
export function buildingClip(sceneId: number, npcId: string): string | null {
  const buildType = npc(npcId)?.BuildType
  if (buildType === undefined) return null
  const rows = load<{ SceneID: number; ClipName: string; BuildType: number }[]>('scene-buildings')
  return (
    rows.find((row) => row.SceneID === sceneId && row.BuildType === Number(buildType))?.ClipName ??
    null
  )
}
