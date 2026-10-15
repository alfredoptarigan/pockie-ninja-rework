// Forge queries and actions (/api/game/forge/*). Keys sit under gameKeys.all, so every game action
// (fights wear gear, quests grant it) refetches them.
import type {
  Character,
  EnchantInput,
  ForgeInfo,
  ForgePaidInput,
  GearView,
  GemHoleInput,
  GemInsertInput,
  InscribeInput,
} from '@pockie/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  ImpressInput,
  ImpressPreview,
  RecastInfo,
  RecastInput,
  SynthesisInput,
  SynthesisPreview,
} from '../../../../shared/src/schemas/portable-function'
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
export const useInsertGem = () => useForgeAction<GemInsertInput>('gems/insert')
export const useRemoveGems = () => useForgeAction<{ itemId: string }>('gems/remove')
export const useCreateHole = () => useForgeAction<GemHoleInput>('gems/hole')
export const useEnchant = () => useForgeAction<EnchantInput>('enchant')

// --- Portable Function (/api/game/portable-function/*) ---

const PORTABLE = '/api/game/portable-function'
const portableKeys = {
  synthesis: (input: SynthesisInput | null) => ['game', 'portable', 'synthesis', input] as const,
  recast: (itemId: string | null) => ['game', 'portable', 'recast', itemId] as const,
  impress: (input: ImpressInput | null) => ['game', 'portable', 'impress', input] as const,
}
const post = <T>(path: string, body: unknown) =>
  api<T>(`${PORTABLE}/${path}`, { method: 'POST', body })

/** What the three Synthesis slots make; a refusal is the query's error. */
export const useSynthesisPreview = (input: SynthesisInput | null) =>
  useQuery({
    enabled: input !== null,
    retry: false,
    queryKey: portableKeys.synthesis(input),
    queryFn: () => post<SynthesisPreview>('synthesis/preview', input),
  })

export const useRecastInfo = (itemId: string | null) =>
  useQuery({
    enabled: itemId !== null,
    retry: false,
    queryKey: portableKeys.recast(itemId),
    queryFn: () => api<RecastInfo>(`${PORTABLE}/recast/${itemId}`),
  })

export const useImpressPreview = (input: ImpressInput | null) =>
  useQuery({
    enabled: input !== null,
    retry: false,
    queryKey: portableKeys.impress(input),
    queryFn: () => post<ImpressPreview>('impress/preview', input),
  })

function usePortableAction<TInput, TResult>(path: string) {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (input: TInput) => post<TResult & ForgeResult>(path, input),
    onSuccess: apply,
  })
}

export const useSynthesize = () =>
  usePortableAction<
    SynthesisInput,
    { success: boolean; resultItemId: string | null; resultNameKey: string | null }
  >('synthesis')
export const useRecast = () => usePortableAction<RecastInput, { isv: number[] }>('recast')
export const useImpress = () => usePortableAction<ImpressInput, { success: boolean }>('impress')
