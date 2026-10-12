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

export const gameMotions = motionsJson as GameMotions
export const gameScenes = scenesJson.scenes as Record<string, SceneArt>

/** Skill id to motion id per outfit / monster art; fetch it when a battle needs skill motions. */
export const SKILL_MOTIONS_URL = '/assets/game/skill-motions.json'
export interface SkillMotions {
  outfits: Record<string, Record<string, string>>
  mobs: Record<string, Record<string, string>>
}
