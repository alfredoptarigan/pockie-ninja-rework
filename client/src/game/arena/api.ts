// Data hooks for /api/game/arena/* (server/src/modules/arena). Keys sit under gameKeys.all, so
// every applied game action refetches them.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'
import type { Replay } from '../types'
import type {
  ArenaFightResult,
  ArenaLogView,
  ArenaReplay,
  ArenaView,
  DuelResult,
  DuelView,
  HonorShopView,
} from '../../../../shared/src/schemas/arena'

export const ARENA = '/api/game/arena'

export const arenaKeys = {
  view: ['game', 'arena'] as const,
  logs: ['game', 'arena', 'logs'] as const,
  duels: ['game', 'arena', 'duels'] as const,
  shop: ['game', 'arena', 'shop'] as const,
}

export type ArenaFight = ArenaFightResult<Replay>
export type Duel = DuelResult<Replay>
export type LogReplay = ArenaReplay<Replay>

export const useArena = () =>
  useQuery({ queryKey: arenaKeys.view, queryFn: () => api<ArenaView>(ARENA) })

export const useArenaLogs = () =>
  useQuery({
    queryKey: arenaKeys.logs,
    queryFn: async () => (await api<{ logs: ArenaLogView[] }>(`${ARENA}/logs`)).logs,
  })

export const useDuels = () =>
  useQuery({ queryKey: arenaKeys.duels, queryFn: () => api<DuelView>(`${ARENA}/duels`) })

export const useHonorShop = () =>
  useQuery({ queryKey: arenaKeys.shop, queryFn: () => api<HonorShopView>(`${ARENA}/shop`) })

/** A saved fight from the log (yours or a duel), to watch again. */
export const fetchLogReplay = (id: string) => api<LogReplay>(`${ARENA}/logs/${id}`)

/**
 * POST to /api/game/arena/<path>. The result is applied at once, except fights: their caller
 * applies it (useApplyResult) when the replay is over, like field fights.
 */
export function useArenaPost<T extends { character: Character }>() {
  const apply = useApplyResult()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      api<T>(`${ARENA}/${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: (result) => {
      if ('replay' in result) return
      if ('arena' in result) queryClient.setQueryData(arenaKeys.view, result.arena)
      if ('shop' in result) queryClient.setQueryData(arenaKeys.shop, result.shop)
      apply(result)
    },
  })
}
