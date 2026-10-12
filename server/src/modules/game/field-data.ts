// World rules on top of the imported data (server/data/game) that only travel and the fields use:
// ExceptTaskScene.ini, RefresHeartNpc.ini (ticket bosses), LevelAttackRec and the NPC menus.
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

/** Ids of an NPC's `TaskID` (`;`-separated) for task bosses. */
export function bossTaskIds(npcId: string): number[] {
  const raw = npc(npcId)?.TaskID
  return raw === undefined ? [] : String(raw).split(';').map(Number).filter(Boolean)
}

export interface TicketBossSlot {
  npcId: string
  hour: number
  minute: number
  liveMinutes: number
  x: number
  y: number
  scale: number
}

/**
 * RefresHeartNpc.ini rows of one scene: `npcId,start,end,H:MM,liveMinutes,x,y,scale`. The 2020
 * end dates are not applied (decision 2), so every row repeats daily.
 */
export function ticketBossSlots(sceneId: number): TicketBossSlot[] {
  const scene = load<Record<string, { r?: unknown }>>('scene-timed-npcs')[String(sceneId)]
  return lines(scene?.r).map((line) => {
    const [npcId = '', , , time = '0:00', live = '30', x = '0', y = '0', scale = '100'] =
      line.split(',')
    const [hour = '0', minute = '0'] = time.split(':')
    return {
      npcId,
      hour: Number(hour),
      minute: Number(minute),
      liveMinutes: Number(live),
      x: Number(x),
      y: Number(y),
      scale: Number(scale),
    }
  })
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/**
 * The scene's ticket boss and when it is (or next will be) out, in UTC: the slot alive at `now`,
 * otherwise the next one to start.
 */
export function ticketBoss(sceneId: number, now: Date) {
  const slots = ticketBossSlots(sceneId).filter((slot) => npc(slot.npcId))
  if (slots.length === 0) return undefined
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const windows = slots.flatMap((slot) =>
    [-DAY, 0, DAY].map((offset) => {
      const start = dayStart + offset + (slot.hour * 60 + slot.minute) * MINUTE
      return { slot, start, end: start + slot.liveMinutes * MINUTE }
    }),
  )
  const t = now.getTime()
  const alive = windows.find((w) => w.start <= t && t < w.end)
  const next = alive ?? windows.filter((w) => w.start > t).sort((a, b) => a.start - b.start)[0]!
  return {
    slot: next.slot,
    active: Boolean(alive),
    startsAt: new Date(next.start).toISOString(),
    endsAt: new Date(next.end).toISOString(),
  }
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
export type NpcMenu = 'shop' | 'forge' | 'gates' | 'daily' | 'rest'
const MENUS: Record<string, NpcMenu> = {
  'npc/pharmacyNpc.js': 'shop',
  'npc/equipNpc.js': 'shop',
  'npc/magicNpc.js': 'shop',
  'npc/blackshop.js': 'shop',
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
