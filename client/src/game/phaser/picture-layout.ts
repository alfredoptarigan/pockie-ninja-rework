// What the scene picture shows and where (pure): layers in drawing order, building hotspots with
// the NPC behind them, standing NPCs and the area's monsters, all in original scene coordinates.
import {
  gameMotions,
  gameScenes,
  type Hotspot,
  type MotionSheet,
} from '../../generated/game-assets'
import { exploreClip } from '../explore'
import { plainText } from '../text'
import type { SceneMonster, SceneNpc, SceneView } from '../types'
import worldData from '../world-data.json'
import { monsterArt } from './motion'

const buildings = worldData.buildings as Record<string, Record<string, string>>

export interface PictureHotspot {
  clip: string
  spot: Hotspot
  /** Short name always shown over the building ("Hall", "Arena"). */
  title: string
  /** Who the building opens, shown while hovered. */
  label: string
  /** The NPC the building opens; hotspots without one are drawn but not interactive. */
  npc?: SceneNpc
}

export interface PictureFigure {
  key: string
  sheet: MotionSheet
  x: number
  y: number
  scale: number
  flip: boolean
  label: string
  npc: SceneNpc
}

/** A monster of the area in the portrait row at the top of the picture. */
export interface PicturePortrait {
  monster: SceneMonster
  portrait: string
  name: string
  /** Centre of the cell. */
  x: number
  y: number
}

export interface PictureLayout {
  width: number
  height: number
  /** background, backgroundeffect and element, in that order. */
  under: string[]
  hotspots: PictureHotspot[]
  figures: PictureFigure[]
  portraits: PicturePortrait[]
  /** The field's explore spot (a tree): opens the Explore window. */
  explore?: { spot: Hotspot; title: string; label: string }
  skybox?: string
}

/** Monster portrait cells, top centre like the original field screen, below the HUD strip (scene pixels). */
export const PORTRAIT_CELL = { size: 120, gap: 14, top: 50 }
/** Building names longer than this are sentences in the table, not names. */
const MAX_TITLE = 24

/** Signs for the buildings the table names only with a sentence or another building's name. */
const CLIP_TITLES: Record<string, string> = {
  clip_pet: 'Pet Kennel',
  clip_CardLink: 'Card Room',
  clip_meetingroom: 'Meeting Hall',
  clip_reward: 'Rewards',
}

function buildingTitle(clip: string, npcId: string, fallback: string) {
  const title = plainText(`lg_build_${npcId}`)
  return CLIP_TITLES[clip] ?? (title && title.length <= MAX_TITLE ? title : fallback)
}

export function pictureLayout(scene: SceneView): PictureLayout | undefined {
  const art = gameScenes[String(scene.sceneId)]
  if (!art?.layers.background) return undefined
  const npcsById = new Map(scene.npcs.map((npc) => [npc.id, npc]))
  const clips = buildings[String(scene.sceneId)] ?? {}

  const hotspots = Object.entries(clips).flatMap(([clip, npcId]): PictureHotspot[] => {
    const spot = art.hotspots[clip]
    if (!spot) return []
    const npc = npcsById.get(npcId)
    const label = plainText(npc?.nameKey ?? `lg_name_${npcId}`, 'Building')
    return [{ clip, spot, npc, label, title: buildingTitle(clip, npcId, label) }]
  })
  const inBuilding = new Set(hotspots.flatMap((h) => (h.npc ? [h.npc.id] : [])))

  const npcs = scene.npcs.flatMap((npc): PictureFigure[] => {
    const key = gameMotions.npcs.placed[npc.id]
    const sheet = key ? gameMotions.npcs.art[key]?.stand : undefined
    if (!sheet || inBuilding.has(npc.id)) return []
    const scale = Math.abs(npc.scale || 100) / 100
    return [
      {
        key: `npc:${npc.id}`,
        sheet,
        x: npc.x,
        y: npc.y,
        scale,
        flip: npc.scale < 0,
        label: plainText(npc.nameKey, 'Villager'),
        npc,
      },
    ]
  })

  const shown = scene.monsters.flatMap((monster) => {
    const portrait = monsterArt(monster.id)?.set.portrait
    return portrait ? [{ monster, portrait }] : []
  })
  const { size, gap, top } = PORTRAIT_CELL
  const left = (art.width - shown.length * size - (shown.length - 1) * gap) / 2
  const portraits = shown.map(({ monster, portrait }, i) => ({
    monster,
    portrait,
    name: plainText(monster.nameKey, 'Monster'),
    x: Math.round(left + i * (size + gap) + size / 2),
    y: top + size / 2,
  }))

  const exploreSpot = scene.exploreSpots.flatMap((id) => exploreClip(id) ?? [])[0]
  const explore = exploreSpot ? art.hotspots[exploreSpot] : undefined

  const { background, backgroundeffect, element, skybox } = art.layers
  return {
    width: art.width,
    height: art.height,
    under: [background, backgroundeffect, element].filter((l): l is string => Boolean(l)),
    hotspots,
    // Lower figures stand in front.
    figures: npcs.sort((a, b) => a.y - b.y),
    portraits,
    explore: explore && { spot: explore, title: 'Explore', label: 'Explore this area' },
    skybox,
  }
}
