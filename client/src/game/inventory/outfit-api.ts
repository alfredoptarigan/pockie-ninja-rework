// Manage Outfit's Visual Outfit and the Wardrobe (server/src/modules/outfit): each action answers
// with the character, the bag and the Wardrobe, which go straight into the caches.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'
import type { InventoryItem } from '../types'

export type WardrobeItem = InventoryItem & { wardrobeSlot: number }
type OutfitResult = { character: Character; items: InventoryItem[]; wardrobe: WardrobeItem[] }

export const wardrobeKey = ['game', 'wardrobe'] as const
const post = (path: string, body?: unknown) => api<OutfitResult>(path, { method: 'POST', body })

export const useWardrobe = () =>
  useQuery({
    queryKey: wardrobeKey,
    queryFn: async () => (await api<{ items: WardrobeItem[] }>('/api/game/wardrobe')).items,
  })

function useOutfitAction<TInput>(request: (input: TInput) => Promise<OutfitResult>) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      queryClient.setQueryData(gameKeys.inventory, result.items)
      queryClient.setQueryData(wardrobeKey, result.wardrobe)
      apply(result)
    },
  })
}

/** Sets a bag outfit as the Visual Outfit (250 gold). */
export const useSetVisualOutfit = () =>
  useOutfitAction((inventoryId: string) => post('/api/game/outfit/visual', { inventoryId }))
/** Removes the Visual Outfit (free). */
export const useClearVisualOutfit = () =>
  useOutfitAction(() => post('/api/game/outfit/visual/clear'))
/** Reborn's moveItemToWardrobe: a bag outfit into an empty slot. */
export const useStoreOutfit = () =>
  useOutfitAction((input: { inventoryId: string; slot: number }) =>
    post('/api/game/wardrobe/store', input),
  )
/** Reborn's moveItemFromWardrobe / Take Out: back to the bag. */
export const useTakeOutfit = () =>
  useOutfitAction((slot: number) => post('/api/game/wardrobe/take', { slot }))
