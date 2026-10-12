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

/** A buff added to or removed from fighter `role` (game-core BuffChange). */
export interface BuffChange {
  role: number
  buff: number
}

/**
 * One replay entry (game-core FightEvent). Event ids: 1 begin action, 2 end action, 5 priority
 * strike, 7 counter, 9 buff tick or buff change, 14 skill, 20 death, 21 next fighter.
 */
export interface FightEvent {
  actor: number
  event: number
  target?: number
  /** Skill id for 5 / 7 / 14, buff id for a ticking buff (event 9). */
  skillId?: number
  damage?: number
  hit?: boolean
  crit?: boolean
  parry?: boolean
  /** HP the actor itself loses (e.g. a poison tick). */
  selfDamage?: number
  /** MP the actor spends. */
  decMp?: number
  /** Number of strikes to animate. */
  attackCount?: number
  addBuffs?: BuffChange[]
  delBuffs?: BuffChange[]
}

/** Battle replay from game-core (`Replay`); the Phaser player in ./phaser plays it back. */
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
    /** Older replays (before the MP fields) lack these. */
    maxMp?: number
    startMp?: number
    mp?: number
  }[]
  events: FightEvent[]
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
