// Explicit 2011 buff ids; unknown buffs deliberately have no art.
import manifest from '../../generated/reborn-effects.json'
import type { AtlasAsset } from './companions'
export interface EffectAsset extends AtlasAsset {
  depth?: string
  onPet?: boolean
  global?: boolean
}
export const effects = manifest.effects as unknown as Record<string, EffectAsset>
export const EFFECTS_MAP: Record<number, string> = {
  11801: 'paralyze',
  11802: 'frozen',
  11804: 'burn',
  11806: 'liquor',
  11810: 'slow',
  11811: 'poison',
  11812: 'elemental_seal',
  11813: 'dizzy',
  11814: 'bloodboil',
  11815: 'seduction',
  11816: 'snared',
  11819: 'door_one',
  11820: 'detonating_clay',
  11821: 'mist',
  11822: 'sunset',
  11823: 'mark',
  11825: 'accelerate',
  11827: 'cloud',
  11831: 'static',
  11832: 'bless',
  11834: 'heal',
  11838: '11838',
}
for (const [ids, family] of [
  [[11853, 11854, 11855], 'killer'],
  [[11857, 11858, 11859], 'plant'],
  [[11861, 11862, 11863], 'science'],
  [[11865, 11866, 11867], 'holy'],
  [[11869, 11870, 11871], 'sage'],
  [[11898, 11899, 11900], 'majestic'],
] as const)
  ids.forEach((id, tier) => {
    EFFECTS_MAP[id] = `${['basic', 'advanced', 'expert'][tier]}_${family}_aura`
  })
export const effectAsset = (buff: number) => effects[EFFECTS_MAP[buff] ?? '']
export const numberAssets = manifest.numbers
export const statusAsset = manifest.statusIcons
