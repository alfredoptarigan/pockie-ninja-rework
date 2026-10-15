// Reborn bag actions (/api/game/items/*, server/src/modules/bag): each answers with the character
// and the whole bag, which goes straight into the inventory cache.
import type { BagSortInput, Character } from '@pockie/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { gameKeys, useApplyResult } from './api'
import type { InventoryItem } from './types'

type BagResult = { character: Character; items: InventoryItem[] }
const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })
const item = (id: string) => `/api/game/items/${id}`

function useBagAction<TInput, TResult extends BagResult = BagResult>(
  request: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      queryClient.setQueryData(gameKeys.inventory, result.items)
      apply(result)
    },
  })
}

export const useMoveItem = () =>
  useBagAction((input: { id: string; page: number; slot: number }) =>
    post<BagResult>(`${item(input.id)}/move`, { page: input.page, slot: input.slot }),
  )
export const useSwapItems = () =>
  useBagAction((input: { id: string; targetId: string }) =>
    post<BagResult>(`${item(input.id)}/swap`, { targetId: input.targetId }),
  )
export const useLockItem = () =>
  useBagAction((id: string) => post<BagResult & { locked: boolean }>(`${item(id)}/lock`))
export const useSplitItem = () =>
  useBagAction((input: { id: string; count: number }) =>
    post<BagResult>(`${item(input.id)}/split`, { count: input.count }),
  )
export const useUseMultiple = () =>
  useBagAction((input: { id: string; amount: number }) =>
    post<BagResult & { used: number }>(`${item(input.id)}/use-multiple`, {
      amount: input.amount,
    }),
  )
export const useSellItems = () =>
  useBagAction((inventoryIds: string[]) =>
    post<BagResult & { earned: number }>('/api/game/items/sell', { inventoryIds }),
  )
export const useSortBag = () =>
  useBagAction((input: BagSortInput) => post<BagResult>('/api/game/items/sort', input))
/** Unequips onto a chosen tile, or the first free one without `page` / `slot`. */
export const useUnequipTo = () =>
  useBagAction((input: { id: string; page?: number; slot?: number }) =>
    post<BagResult>(
      `${item(input.id)}/unequip`,
      input.page === undefined ? undefined : { page: input.page, slot: input.slot },
    ),
  )
/** Wears equipment set 1-5 (Reborn's setActiveLoadout); answers with the character and the bag. */
export const useSetActiveSet = () =>
  useBagAction((set: number) => post<BagResult>('/api/game/sets/active', { set }))
/** Equips (Reborn's click on a slot while holding the item); the server answers with the bag. */
export const useEquipFromBag = () =>
  useBagAction((id: string) => post<BagResult>(`${item(id)}/equip`))
