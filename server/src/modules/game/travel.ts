// Travel rules (docs/original-data/toll-gates.md section 1): scene exits use
// SceneSystem.CanSwitchScene, the world map SceneSwitchRuleSystem.CanChangeScene on top of it,
// "Village" / "Go out" the scene's ToScene (SceneSystem.GoHome).
import { CLOSED_SCENES } from '@pockie/shared'
import { nationScenes, scene, sceneLinks, sceneSwitchRule } from '../../game/data.js'
import type { QuestProgress } from '../../game/quests.js'
import { exceptTaskIds } from './field-data.js'

const COMPLETED = 2

interface Traveller {
  sceneId: number
  level: number
  nation: number
}
type Refusal = { code: string; message: string }

const NO_ROUTE: Refusal = { code: 'no_route', message: 'You cannot travel there from here.' }

/** CanSwitchScene: the target exists and opens, the level fits, the village matches. */
function switchRefusal(
  character: Traveller,
  quests: QuestProgress[],
  sceneId: number,
): Refusal | undefined {
  const target = scene(sceneId)
  if (!target || CLOSED_SCENES.includes(sceneId) || Number(target.IsStart) !== 1) return NO_ROUTE
  if (character.level < Number(target.Level ?? -1)) {
    return {
      code: 'too_low',
      message: `You need level ${Number(target.Level)} to enter that area.`,
    }
  }
  const nation = Number(target.Nation)
  if (nation !== -1 && nation !== character.nation) {
    // ExceptTaskScene.ini: a held quest that leads there lets the ninja in.
    const allowed = exceptTaskIds(sceneId)
    if (!quests.some((q) => q.state !== COMPLETED && allowed.includes(q.taskId))) {
      return { code: 'other_village', message: 'Only ninjas of that village may enter.' }
    }
  }
  return undefined
}

/** Why the ninja cannot take that road, or undefined when they can. */
export function travelRefusal(
  character: Traveller,
  quests: QuestProgress[],
  sceneId: number,
  via: 'link' | 'map',
): Refusal | undefined {
  if (sceneId === character.sceneId) return NO_ROUTE
  if (via === 'link') {
    if (!sceneLinks(character.sceneId).includes(sceneId)) return NO_ROUTE
    return switchRefusal(character, quests, sceneId)
  }
  // The target needs a rule section; a current scene missing from it travels free.
  const rule = sceneSwitchRule(sceneId)
  if (!rule) return NO_ROUTE
  const refused = switchRefusal(character, quests, sceneId)
  if (refused) return refused
  const level = Number(rule.RequireLevel ?? -1)
  if (character.level < level) {
    return { code: 'too_low', message: `You need level ${level} to enter that area.` }
  }
  return undefined
}

/** GoHome / go out: the scene's ToScene when set, else the village or its first field. */
export function homeScene(character: Traveller, via: 'home' | 'out') {
  const toScene = Number(scene(character.sceneId)?.ToScene ?? 0)
  if (toScene > 0) return toScene
  const nation = nationScenes()[character.nation]!
  return via === 'home' ? nation.castle : nation.field
}
