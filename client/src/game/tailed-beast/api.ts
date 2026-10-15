// Data and labels shared by the Tailed Beast windows (GET /api/game/tailed-beast and its actions).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  TailedBeastResult,
  TailedBeastView,
} from '../../../../shared/src/schemas/tailed-beast'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'
import { itemName as gameItemName } from '../explore'
import { showToast } from '../toast'

export const tailedBeastKey = ['game', 'tailedBeast'] as const

/** Village names by our nation index (0 Fire, 1 Water, 2 Earth, 3 Wind, 4 Lightning). */
export const VILLAGES = ['Fire', 'Water', 'Earth', 'Wind', 'Lightning']
/** Reborn's village order (tabs, Kage cards): Fire, Water, Lightning, Wind, Earth. */
export const REBORN_VILLAGE_ORDER = [0, 1, 4, 3, 2]

/** Names the 2011 item slice lacks or names differently (glossary defaults, decision 27). */
const ITEM_NAMES: Record<string, string> = {
  i100004: 'Seal Breaker',
  i161007: 'Recast Talisman',
  i150117: 'Level 10 Stone Bag',
  i159140: 'Kage Title',
  i500001: 'Tailed Beast Reward Box A',
  i500002: 'Tailed Beast Reward Box B',
  i500003: 'Tailed Beast Reward Box C',
}
export const itemName = (itemId: string) => ITEM_NAMES[itemId] ?? gameItemName(itemId)
export const beastName = (nameKey: string, id: number) =>
  (names as Record<string, string>)[nameKey] ?? `Beast ${id}`
export const number = (value: number) => value.toLocaleString('en-US')

export const useTailedBeast = () =>
  useQuery({
    queryKey: tailedBeastKey,
    queryFn: () => api<TailedBeastView>('/api/game/tailed-beast'),
  })

/** POST /api/game/tailed-beast/<path>; Reborn confirms with a success toast. */
export function useBeastAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object; success: string }) =>
      api<TailedBeastResult>(`/api/game/tailed-beast/${path}`, { method: 'POST', body }),
    onSuccess: (result, { success }) => {
      queryClient.setQueryData(tailedBeastKey, result.tailedBeast)
      apply(result)
      showToast(success, 'success')
    },
  })
}
