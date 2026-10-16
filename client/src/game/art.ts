// Pictures from the motion manifest (about 1 MB) for the HUD: outfit portraits and NPC dialog
// photos. Loaded on demand; the Phaser stage shares the same chunk.
import { useQuery } from '@tanstack/react-query'
import type { GameMotions } from '../generated/game-assets'

const loadMotions = async () =>
  (await import('../generated/game-motions.json')).default as unknown as GameMotions

function useMotions() {
  return useQuery({ queryKey: ['art', 'motions'], queryFn: loadMotions, staleTime: Infinity })
}

/** Portrait of an outfit (top-left HUD, character window), once the manifest is loaded. */
export function useOutfitPortrait(clothing: number) {
  return useMotions().data?.outfits[clothing]?.portrait
}

/** Stand animation of an outfit (the bag window draws its first frame). */
export function useOutfitStand(clothing: number) {
  const outfit = useMotions().data?.outfits[clothing]
  const motion = outfit?.actions['999']
  return motion ? outfit.motions[motion] : undefined
}

/** Photo shown in an NPC's dialog. */
export function useNpcPhoto(npcId: string) {
  const motions = useMotions().data
  const key = motions?.npcs.placed[npcId]
  return key ? motions.npcs.art[key]?.photo : undefined
}

/** Portrait of a monster (the HUD monster cards), by NPC id, once the manifest is loaded. */
export function useMonsterPortrait() {
  const motions = useMotions().data
  return (npcId: string) => {
    const key = motions?.monsters[npcId]
    return key
      ? motions.mobs[key]?.portrait
      : motions?.outfits[motions.people[npcId]?.clothing ?? -1]?.portrait
  }
}
