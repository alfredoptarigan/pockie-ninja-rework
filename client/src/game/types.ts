// Response shapes of /api/game/* that @pockie/shared does not export yet (see
// server/src/modules/game/*). Character, CreationOptions and the realtime types come from shared.
import type { Character, MonsterDrop, QuestHandIn, QuestRewards } from '@pockie/shared'

export interface SceneMonster {
  id: string
  nameKey: string
  level: number
  /** What it can drop (GET /scene); optional so the UI copes with responses without it. */
  drops?: MonsterDrop[]
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
  /** What reviving costs here (ReliveSystem): EXP for going home, Gold for reviving here. */
  revive: { homeExpLoss: number; gold: number; goldAllowed: boolean }
}

/** 0 accepted, 1 ready to hand in, 2 completed. */
export type QuestState = 0 | 1 | 2

export interface Quest {
  taskId: number
  state: QuestState
  progress: number[]
  nameKey: string
  descriptionKey: string
  steps: QuestStep[]
  /** What the quest pays; optional so the UI copes with responses without it. */
  rewards?: QuestRewards
}

export interface QuestStep {
  descriptionKey: string
  target: number
  /** Rookie command steps: use an item from the bag, or equip a weapon. */
  command?: 'use' | 'equip'
  itemId?: string
}

/** A quest an NPC hands out now (GET /api/game/quests/available). */
export interface QuestOffer {
  taskId: number
  npcId: string
  sceneId: number
  nameKey: string
  talkKey: string | null
  rewards?: QuestRewards
}

/** Bag items to point at for a tutorial step: one item to use, or the weapons to equip. */
export type BagHighlight = { itemId: string } | { equipment: true }

export interface InventoryItem {
  id: string
  itemId: string
  count: number
  bound: boolean
  equippedSlot: string | null
  nameKey: string
  /** Equipment only: whether this outfit's weapon class may wear it. */
  fitsOutfit?: boolean
}

export interface TalkResult {
  dialogKey: string
  nameKey: string
  completed: number[]
  /** What each completed quest granted, in `completed` order. */
  rewards?: QuestHandIn[]
  character: Character
}

export interface ActionResult {
  completed: number[]
  /** What each completed quest granted, in `completed` order. */
  rewards?: QuestHandIn[]
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
  completed?: number[]
  /** What each completed quest granted, in `completed` order. */
  questRewards?: QuestHandIn[]
  character: Character
}

/** Star level of an explore spot: it rises every `perStar` searches up to 5 (progress -1 at 5). */
export interface ExploreStar {
  level: number
  progress: number
  perStar: number
}

/** An explore spot of the current scene (GET /api/game/explore). */
export interface ExploreSpot {
  id: string
  nameKey: string
  requireLevel: number
  /** Keys used up by every search. */
  requireItems: { itemId: string; count: number }[]
  star: ExploreStar
}

/** Today's searches (all spots together) and the end of the rest after the last one. */
export interface ExploreStatus {
  remaining: number
  total: number
  cooldownEndsAt: string | null
}

export interface ExploreView extends ExploreStatus {
  spots: ExploreSpot[]
}

/** What one of the five cards of a search holds (server/src/game/explore.ts). */
export type ExploreCard =
  | { type: 'fight'; monsterId: string }
  | { type: 'stone'; amount: number }
  | { type: 'item' | 'boss' | 'key' | 'pet'; itemId: string; bound: boolean }
  | { type: 'game' }
  | { type: 'nothing' }

/** POST /api/game/explore/:spotId: the player's card is paid out, the other four only shown. */
export interface ExploreResult {
  spotId: string
  star: ExploreStar
  /** Rolled when the star level just rose. */
  starBonus: { type: 'exp'; exp: number } | { type: 'pet'; itemId: string; bound: boolean } | null
  /** `granted` is false when a pet egg got away. */
  card: ExploreCard & { granted: boolean }
  otherCards: ExploreCard[]
  fight: { replay: Replay; won: boolean } | null
  rewards: FightResult['rewards']
  completed: number[]
  /** What each completed quest granted, in `completed` order. */
  questRewards?: QuestHandIn[]
  explore: ExploreStatus
  character: Character
}
