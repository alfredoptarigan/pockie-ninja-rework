// Typed access to the game asset manifests written by `pnpm assets:export`
// (tools/export-assets.ts). Images live under client/public/assets/game.
import motionsJson from './game-motions.json'
import scenesJson from './game-scenes.json'

/**
 * One animation as a WebP sheet: `frames` cells of frameWidth x frameHeight, laid out left to
 * right in `columns` columns. Cell i stays on screen for durations[i] ticks (the sum is the
 * original frame count; ticks run at `fps.battle` in fights and `fps.scene` elsewhere).
 * Draw a cell so that `anchor` (the original registration point) sits on the character's spot.
 */
export interface MotionSheet {
  file: string
  frameWidth: number
  frameHeight: number
  columns: number
  frames: number
  durations: number[]
  anchor: { x: number; y: number }
  /** Tick (0-based) of MotionStart, Attacking (the hit lands) and MotionOver, when present. */
  labels: Partial<Record<'MotionStart' | 'Attacking' | 'MotionOver', number>>
}

export interface MotionSet {
  /** Action id (see `actionNames`, e.g. "999" stand) to the motion id in `motions`. */
  actions: Record<string, string>
  motions: Record<string, MotionSheet>
  /** Motion ids whose SWF had no usable animation. */
  skipped: string[]
}

export interface OutfitArt extends MotionSet {
  /** 0 male, 1 female. */
  sex: number
  portrait?: string
}

export interface MonsterArt extends MotionSet {
  /** Battle portrait. */
  portrait?: string
  /** Portrait for the scene's monster list. */
  listPortrait?: string
}

export interface NpcArt {
  stand?: MotionSheet
  /** Picture shown in the NPC dialog. */
  photo?: string
}

export interface GameMotions {
  fps: { battle: number; scene: number }
  actionNames: Record<string, string>
  /** By clothing id (avatar-clothing.json). */
  outfits: Record<string, OutfitArt>
  /** Monster npc id (npcs.json) to its art key in `mobs`. */
  monsters: Record<string, string>
  mobs: Record<string, MonsterArt>
  /**
   * Fighters drawn like players (toll gate, Las Noches and pub fight NPCs; Binary_PeopleNpc): an
   * outfit from `outfits` and a weapon key for the weapon layers (layers exist only where the
   * outfit's layers.json has that key).
   */
  people: Record<string, { sex: number; clothing: number; weapon: string }>
  npcs: {
    /** NPC id to its art key (npcs.json ResourceID) in `art`. */
    placed: Record<string, string>
    art: Record<string, NpcArt>
  }
  gaps: { outfitsWithoutArt: number[]; incompleteOutfits: number[]; unnamedOutfits: number[] }
}

/** A named clip of the element layer (building or exit) drawn on its own at x, y. */
export interface Hotspot {
  file: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * Layers in drawing order: background, backgroundeffect, element, (characters), skybox.
 * Every layer covers the whole width x height scene.
 */
export interface SceneArt {
  width: number
  height: number
  layers: Partial<Record<'background' | 'backgroundeffect' | 'element' | 'skybox', string>>
  /** By clip name (scene-buildings.json ClipName for buildings). */
  hotspots: Record<string, Hotspot>
  fightBackground?: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A toll gate (TollClone.as, scene ids 1000xx). */
export interface TollGateArt {
  /** 1920x1080 backdrop, scaled to cover the stage. */
  background: string
  /** The gate map without labels or panels, drawn centred on the stage. */
  map: { file: string; width: number; height: number }
  /** Fight point button art (up state); place it at points.Btn_Fight<n>. */
  fightPoint: { file: string; width: number; height: number }
  /**
   * Named clips in map pixels: Btn_Fight<n> (fight points), Beachhead_<n> (sub gate panels),
   * Btn_Close, Btn_RankView, percentmapget / mapgetper (progress bar).
   */
  points: Record<string, Rect>
  fightBackground: string
}

export const gameMotions = motionsJson as GameMotions
/** Villages, Angel/Demon City, fields 21xx-28xx, 3101, 3102 and the Las Noches floors 61-64. */
export const gameScenes = scenesJson.scenes as Record<string, SceneArt>
export const gameTollGates = scenesJson.tollGates as Record<string, TollGateArt>

/** Skill id to motion id per outfit / monster art; fetch it when a battle needs skill motions. */
export const SKILL_MOTIONS_URL = '/assets/game/skill-motions.json'
export interface SkillMotions {
  outfits: Record<string, Record<string, string>>
  mobs: Record<string, Record<string, string>>
}
