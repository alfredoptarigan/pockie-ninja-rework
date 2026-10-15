// Data hooks for /api/game/home (server/src/modules/home). Keys sit under gameKeys.all, so the
// applied result also refetches the bag.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HomeResult, HomeView } from '../../../../shared/src/schemas/home'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'

export const homeKey = ['game', 'home'] as const

export function useHome() {
  return useQuery({ queryKey: homeKey, queryFn: () => api<HomeView>('/api/game/home') })
}

export function useHomeAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body }: { path: 'plant' | 'harvest'; body: object }) =>
      api<HomeResult>(`/api/game/home/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(homeKey, result.home)
      apply(result)
    },
  })
}
