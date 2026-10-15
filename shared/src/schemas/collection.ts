// Reborn's Collection window, Avatars / Pets / Gear Sets tabs (GET /api/game/collection, submit).
// The Wings tab keeps its own routes (shared/src/schemas/wings.ts).
import { z } from 'zod'

export const collectionKinds = ['outfit', 'pet', 'gear'] as const
export type CollectionKind = (typeof collectionKinds)[number]

/** Destroys one spare copy: a bag row (`source: 'bag'`) or, for pets, a kennel pet. */
export const collectionSubmitSchema = z
  .object({
    kind: z.enum(collectionKinds),
    id: z.string().uuid(),
    source: z.enum(['bag', 'kennel']).default('bag'),
  })
  .strict()
  .refine((body) => body.source === 'bag' || body.kind === 'pet', {
    message: 'Only pets can come from the kennel.',
    path: ['source'],
  })
export type CollectionSubmitBody = z.input<typeof collectionSubmitSchema>

/** STR / AGI / STA as shown (Reborn points; x100 internally). */
export type StatTriple = [number, number, number]
/** Max HP / Attack / Speed in tenths of a percent (21 = +2.1%). */
export type PercentTriple = [number, number, number]

export interface CollectionMilestone {
  count: number
  bonus: PercentTriple
  reached: boolean
}

/** A spare copy that can be submitted. `level` is the outfit +N, pet Lv or gear enhance +N. */
export interface CollectionCandidate {
  id: string
  source: 'bag' | 'kennel'
  itemId: string
  nameKey: string
  level: number
}

export interface CollectionTotals {
  /** Reborn "Total Directory LV": milestones reached in the tab. */
  level: number
  stats: StatTriple
  bonus: PercentTriple
}

export interface OutfitEntry {
  clothing: number
  stats: StatTriple
  collected: boolean
  candidates: CollectionCandidate[]
}

export interface PetEntry {
  /** Base species item id of the family. */
  family: string
  nameKey: string
  avatar: number
  stats: StatTriple
  collected: boolean
  candidates: CollectionCandidate[]
}

export interface GearPiece {
  slot: string
  /** The slot's first item id (icon and name). */
  itemId: string
  nameKey: string
  collected: boolean
  candidates: CollectionCandidate[]
}

export interface GearSetEntry {
  id: number
  pieces: GearPiece[]
}

export interface CollectionView {
  outfits: CollectionTotals & {
    rarities: { id: string; entries: OutfitEntry[]; milestones: CollectionMilestone[] }[]
  }
  pets: CollectionTotals & {
    natures: { nature: number; entries: PetEntry[]; milestones: CollectionMilestone[] }[]
  }
  gear: CollectionTotals & {
    requiredLines: number
    /** STR / AGI / STA per piece and per full set. */
    piece: number
    complete: number
    tiers: { label: string; sets: GearSetEntry[]; milestones: CollectionMilestone[] }[]
  }
}
