// Generated asset entry points. Regenerate the JSON with pnpm assets:export extra.
import items from './game-items.json'
import weapons from './game-weapons.json'
import createRole from './game-create-role.json'
import worldMap from './game-world-map.json'

export interface ItemIcon {
  textRemoved?: boolean
  file: string
  width: number
  height: number
}
export interface WeaponSheet {
  file: string
  frameWidth: number
  frameHeight: number
  columns: number
  frames: number
  durations: number[]
  anchor: { x: number; y: number }
  labels: Record<string, number>
}
export interface WeaponLayer {
  missing: { actions: string[]; skills: string[] }
  actions: Record<string, string | null>
  skills: Record<string, string | null>
  motions: Record<string, WeaponSheet>
}
export type WeaponLayers = Record<string, WeaponLayer>

/** By item id (every item of items.json with an icon). `gaps` lists resource keys left out. */
export const gameItems: {
  items: Record<string, ItemIcon>
  gaps: { missingIcons: string[]; textIcons: string[] }
} = items
export const gameWeapons: {
  fps: number
  gaps: {
    incompleteBodyOutfits: number[]
    outfitsWithMissingLayers: number[]
    unmappedActions: string[]
    unmappedSkills: string[]
  }
  items: Record<string, string>
  outfits: Record<string, { file: string; keys: string[] }>
} = weapons
export interface MapButtonArt {
  file: string
  x: number
  y: number
  width: number
  height: number
}
/**
 * The grey world painting plus one entry per place button (34 scenes; the original's scene_181
 * has no scene). x/y/width/height is the original hit area; `states` is the coloured art the
 * original draws over the painting for a visited place (up, hover, pressed), `face` the glow on
 * the place the player stands in, `close` the painting's own close button; all in painting pixels.
 */
export const gameWorldMap: {
  file: string
  width: number
  height: number
  close: Record<'up' | 'over' | 'down', MapButtonArt>
  locations: Record<
    string,
    {
      x: number
      y: number
      width: number
      height: number
      depth: number
      states: Record<'up' | 'over' | 'down', MapButtonArt>
      face: MapButtonArt
    }
  >
} = worldMap

type TabArt = Record<'normal' | 'over' | 'selected', MapButtonArt>
type ButtonArt = Record<'up' | 'over' | 'down', MapButtonArt>
/**
 * Character creation screen (creatrolenew.swf, 1000x600, text removed; `pnpm assets:export
 * create`): `nations` and `roles` are TabSelect tabs by tab number, `outfits` the big picture of
 * each starting outfit by clothing id. All positions are stage pixels.
 */
export const gameCreateRole: {
  width: number
  height: number
  background: MapButtonArt
  nations: Record<string, TabArt>
  roles: Record<string, TabArt>
  enter: ButtonArt
  back: ButtonArt
  random: ButtonArt
  outfits: Record<string, MapButtonArt>
} = createRole
