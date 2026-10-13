// Lazy entry of the Phaser stage (../stage.tsx imports it on demand): keeps Phaser and the 1 MB
// motion manifest out of the game's first chunk.
import { gameScenes } from '../../generated/game-assets'
import { plainText } from '../text'
import type { Replay, SceneView } from '../types'
import { startBattle, type BattleHandle } from './battle-scene'
import { fighterLooks, lookArt, loadSkillMotions, shownOutfit, type FighterLook } from './motion'
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
  /** How each defender is drawn, in fighter order (arena and duels); replaces `monsterIds`. */
  defenderLooks?: FighterLook[]
  sceneId: number
  /** Item id of the player's equipped weapon, drawn over the body (none: bare hands). */
  weaponItemId?: string
  onFinished: () => void
}

const skillName = (id: number) => plainText(`lg_Skill_${id}`) || undefined
const buffName = (id: number) => plainText(`lg_Buffer_${id}`) || undefined

export async function mountBattle(
  parent: HTMLElement,
  options: BattleOptions,
): Promise<BattleHandle> {
  const { replay, clothing, monsterIds, defenderLooks, sceneId, weaponItemId, onFinished } = options
  const looks = fighterLooks(
    replay.fighters,
    { clothing, weaponItemId },
    defenderLooks ?? monsterIds.map((npcId) => ({ npcId })),
  )
  const art = looks.map(lookArt)
  // Both are runtime JSON files; a missing weapon layer only leaves the weapon out.
  const [skillMotions, weapons] = await Promise.all([
    loadSkillMotions(),
    Promise.all(
      looks.map((look) =>
        'weaponItemId' in look && look.weaponItemId
          ? loadWeaponLayer(shownOutfit(look.clothing), look.weaponItemId)
          : undefined,
      ),
    ),
  ])
  const timeline = buildTimeline(replay, { art, skillMotions, skillName, buffName })
  return startBattle(parent, {
    replay,
    timeline,
    art,
    weapons,
    names: replay.fighters.map((f) => plainText(f.name, f.name)),
    background: gameScenes[String(sceneId)]?.fightBackground,
    buffName,
    onFinished,
  })
}
