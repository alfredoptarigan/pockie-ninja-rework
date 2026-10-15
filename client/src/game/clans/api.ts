// Data hooks for /api/game/clans (server/src/modules/clans). Keys sit under gameKeys.all, so every
// applied game action refetches them; clan notices (joined, removed, roles) refetch them too.
import type {
  ClanActionResult,
  ClanApplicationsView,
  ClanCreateInfo,
  ClanListView,
  MyClanView,
} from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'
import { onNotice } from '../Chat'

const base = '/api/game/clans'
export const clanKeys = {
  all: ['game', 'clans'] as const,
  mine: ['game', 'clans', 'me'] as const,
  list: (page: number, q: string) => ['game', 'clans', 'list', page, q] as const,
  createInfo: ['game', 'clans', 'create-info'] as const,
  applications: ['game', 'clans', 'applications'] as const,
}

/** My clan (null without one); refetched on every clan notice. */
export function useMyClan(enabled = true) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onNotice((notice) => {
        if (notice.kind === 'clanChanged')
          void queryClient.invalidateQueries({ queryKey: clanKeys.all })
      }),
    [queryClient],
  )
  return useQuery({
    queryKey: clanKeys.mine,
    queryFn: () => api<MyClanView>(`${base}/me`),
    enabled,
  })
}

export function useClanList(page: number, q: string) {
  const params = new URLSearchParams({ page: String(page), ...(q && { q }) })
  return useQuery({
    queryKey: clanKeys.list(page, q),
    queryFn: () => api<ClanListView>(`${base}?${params}`),
  })
}

export function useCreateInfo() {
  return useQuery({
    queryKey: clanKeys.createInfo,
    queryFn: () => api<ClanCreateInfo>(`${base}/create-info`),
  })
}

export function useApplications() {
  return useQuery({
    queryKey: clanKeys.applications,
    queryFn: () => api<ClanApplicationsView>(`${base}/applications`),
  })
}

/** Any clan action: the answer carries the fresh clan and character. */
export function useClanAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<ClanActionResult>(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData<MyClanView>(clanKeys.mine, { clan: result.clan })
      apply(result)
    },
  })
}
