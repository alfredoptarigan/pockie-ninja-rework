// Response shapes of /api/game/* that @pockie/shared does not export yet (see
// server/src/modules/game/*). Character, CreationOptions and the realtime types come from shared.
import type { BagItemInfo, Character, MonsterDrop, QuestHandIn, QuestRewards } from '@pockie/shared'
import type { AkatsukiAmbush } from '../../../shared/src/schemas/akatsuki'

export interface SceneMonster {
  id: string
  nameKey: string
  level: number
  /** What it can drop (GET /scene); optional so the UI copes with responses without it. */
  drops?: MonsterDrop[]
  /**
   * Task bosses: `quest` until one of their quests is held or done, `never` for bosses whose
   * quests do not exist (shown, but locked); null or absent when it can be fought.
   */
  lock?: 'quest' | 'never' | null
}

/** Which window an NPC's menu opens (npc.ini JavaScript); null for talk-only NPCs. */
export type NpcMenu = 'shop' | 'merchant' | 'forge' | 'gates' | 'daily' | 'rest'

/** The scene's timed boss (RefresHeartNpc.ini), fought for one ticket item. */
export interface TicketBoss {
  /** The listed boss, sent to POST /fight. */
  id: string
  /** The variant fought at the player's level (LevelAttackRec). */
  fightId: string
  nameKey: string
  level: number
  x: number
  y: number
  scale: number
  /** Out now (until `endsAt`), else it next appears at `startsAt`. */
  active: boolean
  startsAt: string
  endsAt: string
  ticketItemId: string
  ticketNameKey: string
  /** Tickets in the bag. */
  tickets: number
}

export interface SceneNpc {
  id: string
  nameKey: string
  x: number
  y: number
  scale: number
  menu?: NpcMenu | null
  /** The building picture (scene clip) this NPC stands for, if any. */
  clip?: string | null
}

export interface SceneView {
  sceneId: number
  nameKey: string
  monsters: SceneMonster[]
  npcs: SceneNpc[]
  exploreSpots: string[]
  links: number[]
  /** ScenesEntered: every scene the ninja has stood in; the world map colours only these. */
  visitedScenes: number[]
  /** World map places that open only once entered (reachable on foot from the villages). */
  visitRequired?: number[]
  ticketBoss?: TicketBoss | null
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
  /** Equipment set (1-5) a worn item is in; null (or absent) in the bag. */
  equippedSet?: number | null
  nameKey: string
  /** Equipment only: whether this outfit's weapon class may wear it. */
  fitsOutfit?: boolean
  /** Bag tile of the item's top-left corner (null when worn or not placed yet). */
  page?: number | null
  slot?: number | null
  locked?: boolean
  /** What the item is, from the server's item table (every item, not a client slice). */
  info?: ItemInfo
}

export interface ItemInfo {
  kind: 'equip' | 'use' | 'other'
  /** EquipType for equipment ("Weapon", "Hat"...). */
  equipSlot?: string
  /** UseLevel. */
  level: number
  /** Stone per item when it can be sold, null when it cannot. */
  sellPrice: number | null
  /** ItemMaxFoldNum. */
  stack: number
  /** Footprint in 27px bag tiles. */
  w: number
  h: number
  /** The item table class ("EquipItem", "FoodItem"...). */
  class: string
  /** Outfits (AvatarItem): clothing and Reborn's "+N". */
  outfit?: { clothing: number; plus: number }
  /** Gems (JewelItem): the stat a socket gets and the lowest gear level. */
  gem?: BagItemInfo['gem']
  /** Enchanting Stones (MagicItem): their lines, the slots they fit and the lowest gear level. */
  enchant?: BagItemInfo['enchant']
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
  /** The card a card box gave (M6 decision 28). */
  card?: { cardId: number; nameKey: string }
  character: Character
}

/** A buff added to or removed from fighter `role` (game-core BuffChange). */
export interface BuffChange {
  role: number
  buff: number
}

/**
 * One replay entry (game-core FightEvent). Event ids: 1 begin action, 2 end action, 3 cannot move
 * (stun, freeze, ...), 5 priority strike, 7 counter, 9 buff tick or buff change, 14 skill,
 * 20 death, 21 next fighter.
 */
export interface FightEvent {
  actor: number
  event: number
  target?: number
  /** Skill id for 5 / 7 / 14, buff id for a ticking buff (event 9). */
  skillId?: number
  /** HP the target loses, after mitigation and absorption: negative means it heals. */
  damage?: number
  hit?: boolean
  crit?: boolean
  parry?: boolean
  /** HP the actor itself loses, e.g. a poison tick or a rebound (before `incHp`). */
  selfDamage?: number
  /** MP the actor spends. */
  decMp?: number
  /** Rebound the actor takes, after its own mitigation (included in selfDamage). */
  backDamage?: number
  /** HP / MP the actor gains from vampiric strikes or healing scripts. */
  incHp?: number
  incMp?: number
  /** Damage a shield of the target / of the actor took instead of HP. */
  targetShield?: number
  selfShield?: number
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
    /** Drops that did not fit in a full bag. */
    lost?: number
  }
  completed?: number[]
  /** What each completed quest granted, in `completed` order. */
  questRewards?: QuestHandIn[]
  /** The Akatsuki pair that springs its ambush after this won field fight. */
  akatsukiAmbush?: AkatsukiAmbush
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
  /** Scene element that opens the spot (the field's big tree); null for spots without one. */
  clipName: string | null
  requireLevel: number
  /** Stone paid by every search (0: none). */
  requireStone: number
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
  /** Rest after each search (OutSearchCommon.ini), in seconds. */
  cooldownSeconds: number
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
