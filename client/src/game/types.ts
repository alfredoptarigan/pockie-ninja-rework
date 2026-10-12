// Response shapes of /api/game/* that @pockie/shared does not export yet (see
// server/src/modules/game/*). Character, CreationOptions and the realtime types come from shared.
import type { Character } from '@pockie/shared'

export interface SceneMonster {
  id: string
  nameKey: string
  level: number
}

export interface SceneNpc {
  id: string
  nameKey: string
  x: number
  y: number
  scale: number
}

export interface SceneView {
  sceneId: number
  nameKey: string
  monsters: SceneMonster[]
  npcs: SceneNpc[]
  exploreSpots: string[]
  links: number[]
}

/** 0 accepted, 1 ready to hand in, 2 completed. */
export type QuestState = 0 | 1 | 2

export interface Quest {
  taskId: number
  state: QuestState
  progress: number[]
  nameKey: string
  descriptionKey: string
  steps: { descriptionKey: string; target: number }[]
}

export interface InventoryItem {
  id: string
  itemId: string
  count: number
  bound: boolean
  equippedSlot: string | null
  nameKey: string
}

export interface TalkResult {
  dialogKey: string
  nameKey: string
  completed: number[]
  character: Character
}

export interface ActionResult {
  completed: number[]
  character: Character
}

/** Battle replay from game-core (`Replay`); Task 8b plays it back. */
export interface Replay {
  seed: number
  fighters: {
    index: number
    side: 'attackers' | 'defenders'
    name: string
    level: number
    maxHp: number
    startHp: number
    hp: number
  }[]
  events: { actor: number; event: number; target?: number; damage?: number }[]
  winner: 'attackers' | 'defenders'
}

export interface FightResult {
  replay: Replay
  won: boolean
  rewards: {
    exp: number
    stone: number
    items: { itemId: string; bound: boolean }[]
    levelsGained: number
  }
  character: Character
}
