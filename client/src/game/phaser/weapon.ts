// The equipped weapon drawn over the player's body in battle (tools/assets/EXTRA.md). Each outfit
// has one layers.json, fetched at runtime; the weapon runs its own sheet and durations.
import { gameWeapons, type WeaponLayer, type WeaponLayers } from '../../generated/game-extra'
import { fetchJsonOnce, frameAt, STAND, type FighterArt } from './motion'
import type { Pose } from './timeline'

/**
 * The weapon layer of `itemId` for an outfit, or undefined when it has none. Like Reborn, which
 * draws an avatar's own weapon art by number only (weaponId is the N of `weapons/<type>/N`), a
 * weapon of another type shows as the outfit's own weapon of the same number (gloves19 -> sharp19).
 */
export async function loadWeaponLayer(outfitId: number, itemId: string) {
  const outfit = gameWeapons.outfits[String(outfitId)]
  const key = Object.hasOwn(gameWeapons.items, itemId) ? gameWeapons.items[itemId] : undefined
  if (!outfit || !key) return undefined
  const shown = outfit.keys.includes(key)
    ? key
    : outfit.keys.find((own) => weaponNumber(own) === weaponNumber(key))
  if (!shown) return undefined
  return (await fetchJsonOnce<WeaponLayers>(outfit.file))?.[shown]
}

const weaponNumber = (key: string) => key.replace(/^\D+/, '')

/**
 * Weapon sheet for a pose: the skill's sheet for strikes, the action's otherwise. null is an
 * intentionally transparent original motion (hide the weapon); undefined is unsupported (draw
 * none). When the body lacks the motion it stands (sheetOf), and the weapon stands with it.
 */
export function weaponSheetFor(
  layer: WeaponLayer,
  art: FighterArt | undefined,
  pose: Pick<Pose, 'motion' | 'skillId'>,
) {
  const shown: Pick<Pose, 'motion' | 'skillId'> = art?.set.motions[pose.motion]
    ? pose
    : { motion: STAND }
  const key =
    shown.skillId === undefined ? layer.actions[shown.motion] : layer.skills[String(shown.skillId)]
  if (key === null) return null
  return key === undefined ? undefined : layer.motions[key]
}

/**
 * Weapon cell at body `tick`: both start at tick 0 of the body motion (each loop of a looping one)
 * and the weapon holds its last cell when it ends first. Body cell indexes are never reused.
 */
export function weaponFrameAt(body: number[], weapon: number[], tick: number, loop: boolean) {
  const total = body.reduce((sum, d) => sum + d, 0)
  const t = loop && total > 0 ? ((Math.floor(tick) % total) + total) % total : tick
  return frameAt(weapon, t, false)
}
