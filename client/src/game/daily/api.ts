// Data hooks for /api/game/daily (server/src/modules/daily): the board and accept / hand-in.
import type { DailyView } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { gameKeys } from '../api'

const dailyKey = ['game', 'daily'] as const

export const useDaily = () =>
  useQuery({
    queryKey: dailyKey,
    queryFn: () => api<DailyView>('/api/game/daily'),
    refetchInterval: 30000,
  })

export type DailyOperation =
  | { taskId: number; operation: 'accept' }
  | { taskId: number; operation: 'hand-in'; selectType: 0 | 1 | 2 | 3 }

export function useDailyAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: DailyOperation) =>
      api<DailyView>(`/api/game/daily/${action.taskId}/${action.operation}`, {
        method: 'POST',
        body: action.operation === 'hand-in' ? { selectType: action.selectType } : undefined,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(dailyKey, data)
      void queryClient.invalidateQueries({ queryKey: gameKeys.all })
    },
  })
}
