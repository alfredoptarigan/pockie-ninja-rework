// Forge queries and actions (/api/game/forge/*). Keys sit under gameKeys.all, so every game action
// (fights wear gear, quests grant it) refetches them.
import type { Character, ForgeInfo, ForgePaidInput, GearView, InscribeInput } from '@pockie/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'
import type { InventoryItem } from '../types'

export const forgeKeys = {
  info: ['game', 'forge', 'info'] as const,
  gear: ['game', 'forge', 'gear'] as const,
}

/** Costs, rates and the talismans and seals in the bag. */
export function useForgeInfo() {
  return useQuery({ queryKey: forgeKeys.info, queryFn: () => api<ForgeInfo>('/api/game/forge') })
}

/** Forge state of every equipment row, keyed by inventory row id. */
export function useGear({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: forgeKeys.gear,
    queryFn: async () =>
      (await api<{ gear: Record<string, GearView> }>('/api/game/forge/gear')).gear,
  })
}

/** What a forge action returns: the character, and the forged row for single-item actions. */
export interface ForgeResult {
  character: Character
  item?: InventoryItem & { gear?: GearView }
  /** Enhance and Inscription: whether the attempt succeeded. */
  success?: boolean
  sealsUsed?: number
}

function useForgeAction<TInput>(path: string) {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (input: TInput) =>
      api<ForgeResult>(`/api/game/forge/${path}`, { method: 'POST', body: input ?? undefined }),
    onSuccess: apply,
  })
}

export const useAppraise = () => useForgeAction<{ itemId: string }>('appraise')
export const useAppraiseAll = () => useForgeAction<{ itemIds: string[] }>('appraise-all')
export const useRepair = () => useForgeAction<{ itemId: string }>('repair')
export const useRepairAll = () => useForgeAction<void>('repair-all')
export const useEnhance = () => useForgeAction<ForgePaidInput>('enhance')
export const useRefine = () => useForgeAction<ForgePaidInput>('refine')
export const useInscribe = () => useForgeAction<InscribeInput>('inscribe')
