// Lazy entry of the Phaser stage (../stage.tsx imports it on demand): keeps Phaser and the 1 MB
// motion manifest out of the game's first chunk.
import { gameScenes } from '../../generated/game-assets'
import { plainText } from '../text'
import type { Replay, SceneView } from '../types'
import { startBattle, type BattleHandle } from './battle-scene'
import { loadSkillMotions, monsterArt, outfitArt } from './motion'
import { pictureLayout } from './picture-layout'
import { startScenePicture, type PictureActions, type PictureHandle } from './picture-scene'
import { buildTimeline } from './timeline'
import { loadWeaponLayer } from './weapon'

export type { BattleHandle, PictureActions, PictureHandle }

/** Starts the scene picture, or returns null when the scene has no exported art. */
export function mountPicture(
  parent: HTMLElement,
  scene: SceneView,
  actions: PictureActions,
  exploreClip?: string,
) {
  const layout = pictureLayout(scene, exploreClip)
  return layout ? startScenePicture(parent, layout, actions) : null
}

export interface BattleOptions {
  replay: Replay
  /** Outfit of the attackers (the player). */
  clothing: number
  /** Monster npc id per defender, in fighter order. */
  monsterIds: string[]
  sceneId: number
  /** Item id of the player's equipped weapon, drawn over the body (none: bare hands). */
  weaponItemId?: string
  onFinished: () => void
}

/** Shown for the outfits the backup has no art for. */
const DEFAULT_OUTFIT = 1
const skillName = (id: number) => plainText(`lg_Skill_${id}`) || undefined
const buffName = (id: number) => plainText(`lg_Buffer_${id}`) || undefined

export async function mountBattle(
  parent: HTMLElement,
  options: BattleOptions,
): Promise<BattleHandle> {
  const { replay, clothing, monsterIds, sceneId, weaponItemId, onFinished } = options
  const outfit = outfitArt(clothing) ? clothing : DEFAULT_OUTFIT
  // Both are runtime JSON files; a missing weapon layer only leaves the weapon out.
  const [skillMotions, weapon] = await Promise.all([
    loadSkillMotions(),
    weaponItemId ? loadWeaponLayer(outfit, weaponItemId) : undefined,
  ])
  let defender = 0
  const art = replay.fighters.map((f) =>
    f.side === 'attackers' ? outfitArt(outfit) : monsterArt(monsterIds[defender++] ?? ''),
  )
  const timeline = buildTimeline(replay, { art, skillMotions, skillName, buffName })
  return startBattle(parent, {
    replay,
    timeline,
    art,
    weapons: replay.fighters.map((f) => (f.side === 'attackers' ? weapon : undefined)),
    names: replay.fighters.map((f) => plainText(f.name, f.name)),
    background: gameScenes[String(sceneId)]?.fightBackground,
    buffName,
    onFinished,
  })
}
