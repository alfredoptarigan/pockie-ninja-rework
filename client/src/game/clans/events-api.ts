// Data hooks for /api/game/clan-events (server/src/modules/clan-events): the clan level bar,
// Ninja Garden and Picnic in Garden. Keys sit under clanKeys.all (so under gameKeys.all too).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClanLevelView,
  GardenResult,
  GardenView,
  PicnicResult,
  PicnicView,
} from '../../../../shared/src/schemas/home'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'

const base = '/api/game/clan-events'
export const clanEventKeys = {
  level: ['game', 'clans', 'events'] as const,
  garden: ['game', 'clans', 'events', 'garden'] as const,
  picnic: ['game', 'clans', 'events', 'picnic'] as const,
}

export const useClanLevel = () =>
  useQuery({ queryKey: clanEventKeys.level, queryFn: () => api<ClanLevelView>(base) })

export const useGarden = () =>
  useQuery({ queryKey: clanEventKeys.garden, queryFn: () => api<GardenView>(`${base}/garden`) })

export const usePicnic = () =>
  useQuery({ queryKey: clanEventKeys.picnic, queryFn: () => api<PicnicView>(`${base}/picnic`) })

/** A Ninja Garden action; the answer carries the fresh garden and character. */
export function useGardenAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<GardenResult>(`${base}/garden/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(clanEventKeys.garden, result.garden)
      apply(result)
    },
  })
}

/** A Picnic action; the answer carries the fresh picnic and character. */
export function usePicnicAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<PicnicResult>(`${base}/picnic/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(clanEventKeys.picnic, result.picnic)
      apply(result)
    },
  })
}
