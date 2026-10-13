// Data hooks for /api/game/rankings/* (server/src/modules/rankings). Keys sit under gameKeys.all,
// so every applied game action refetches them.
import type {
  RankingKey,
  RankingPage,
  RankingTree,
  TollGateClaimResult,
  TollGateRanking,
} from '@pockie/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'

export const rankingKeys = {
  tree: ['game', 'rankings'] as const,
  page: (key: RankingKey, page: number | 'me') => ['game', 'rankings', key, page] as const,
  tollGate: (gateId: number) => ['game', 'rankings', 'toll-gates', gateId] as const,
}

export const useRankingTree = () =>
  useQuery({ queryKey: rankingKeys.tree, queryFn: () => api<RankingTree>('/api/game/rankings') })

/** One page of a list; `'me'` asks the server for the page with your place. */
export const useRankingPage = (key: RankingKey, page: number | 'me') =>
  useQuery({
    queryKey: rankingKeys.page(key, page),
    queryFn: () =>
      api<RankingPage>(`/api/game/rankings/${key}?${page === 'me' ? 'find=me' : `page=${page}`}`),
    placeholderData: keepPreviousData,
  })

export const useTollGateRanking = (gateId: number) =>
  useQuery({
    queryKey: rankingKeys.tollGate(gateId),
    queryFn: () => api<TollGateRanking>(`/api/game/rankings/toll-gates/${gateId}`),
  })

export function useClaimTollGateReward() {
  const apply = useApplyResult()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (gateId: number) =>
      api<TollGateClaimResult>(`/api/game/rankings/toll-gates/${gateId}/claim`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(rankingKeys.tollGate(result.ranking.gateId), result.ranking)
      apply(result)
    },
  })
}
