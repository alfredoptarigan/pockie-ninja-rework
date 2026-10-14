import manifest from '../../generated/reborn-audio.json'

export type Track = keyof typeof manifest
export const trackUrl = (track: Track) => manifest[track].url
const cities = ['maincity1', 'maincity2', 'maincity3', 'maincity4'] as const

/** Zone choices are ours; adjacent scenes in a zone keep the same music. */
export function sceneTrack(sceneId: number): Track | null {
  if (sceneId === 161) return 'blackcity'
  if (sceneId === 171) return 'demonCity'
  if (sceneId === 3101) return 'lasNoches'
  if ([111, 121, 131, 141, 151].includes(sceneId)) {
    return cities[((sceneId - 111) / 10) % 4]!
  }
  const zone = Math.floor(sceneId / 100)
  if (zone >= 21 && zone <= 28) return cities[(zone - 21) % 4]!
  // 5001 has no i18n name; Valhalla is 3102. Do not assume they are the same map.
  if (sceneId === 5001) return 'singlegate'
  if (zone >= 30 && zone <= 39) return 'singlegate'
  return null
}

export function battleTrack(seed: number): Track {
  return (['compete1', 'compete2', 'compete3', 'compete4'] as const)[
    ((Math.trunc(seed) % 4) + 4) % 4
  ]!
}
