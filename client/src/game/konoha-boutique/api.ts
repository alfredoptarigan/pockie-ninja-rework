// Konoha Boutique requests: the view query, and actions that store the returned view (and the
// character, when the action spent a currency or filled the bag).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Character } from '@pockie/shared'
import type { BoutiqueView } from '../../../../shared/src/schemas/konoha-boutique'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { showToast } from '../toast'

export const boutiqueKey = ['game', 'konoha-boutique'] as const
export const BOUTIQUE_PATH = '/api/game/konoha-boutique'

/** A picture of Reborn's ui/UIResource/Boutique folder. */
export const art = (name: string) => `/assets/reborn/ui/UIResource/Boutique/${name}.webp`

export const useBoutique = () =>
  useQuery({ queryKey: boutiqueKey, queryFn: () => api<BoutiqueView>(BOUTIQUE_PATH) })

export const failToast = (error: unknown) => showToast(errorMessage(error), 'failure')

/** Stores a result's view now (or later, with the returned function) and applies its character. */
export function useSettle() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return (result: { boutique: BoutiqueView; character?: Character }) => {
    queryClient.setQueryData(boutiqueKey, result.boutique)
    if (result.character) apply({ character: result.character })
  }
}

/** POST `path`; the result is settled, failures toast. */
export function useBoutiqueAction<T extends { boutique: BoutiqueView; character?: Character }>(
  path: string,
  onDone?: (result: T) => void,
) {
  const settle = useSettle()
  return useMutation({
    mutationFn: (body: object = {}) => api<T>(`${BOUTIQUE_PATH}/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      settle(result)
      onDone?.(result)
    },
    onError: failToast,
  })
}
