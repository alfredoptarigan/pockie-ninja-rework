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

export type { BattleHandle, PictureActions, PictureHandle }

/** Starts the scene picture, or returns null when the scene has no exported art. */
export function mountPicture(parent: HTMLElement, scene: SceneView, actions: PictureActions) {
  const layout = pictureLayout(scene)
  return layout ? startScenePicture(parent, layout, actions) : null
}

export interface BattleOptions {
  replay: Replay
  /** Outfit of the attackers (the player). */
  clothing: number
  /** Monster npc id per defender, in fighter order. */
  monsterIds: string[]
  sceneId: number
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
  const { replay, clothing, monsterIds, sceneId, onFinished } = options
  const skillMotions = await loadSkillMotions()
  let defender = 0
  const art = replay.fighters.map((f) =>
    f.side === 'attackers'
      ? (outfitArt(clothing) ?? outfitArt(DEFAULT_OUTFIT))
      : monsterArt(monsterIds[defender++] ?? ''),
  )
  const timeline = buildTimeline(replay, { art, skillMotions, skillName, buffName })
  return startBattle(parent, {
    replay,
    timeline,
    art,
    names: replay.fighters.map((f) => plainText(f.name, f.name)),
    background: gameScenes[String(sceneId)]?.fightBackground,
    buffName,
    onFinished,
  })
}
