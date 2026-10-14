import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EventsView } from '../../../../shared/src/schemas/events'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'

export const eventsKey = ['game', 'events'] as const

export function useEvents() {
  return useQuery({
    queryKey: eventsKey,
    queryFn: () => api<EventsView>('/api/game/events'),
    refetchInterval: 30000,
  })
}

export function useEventAction() {
  const cache = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (path: string) => api<EventsView>(`/api/game/events/${path}`, { method: 'POST' }),
    onSuccess: (view) => {
      cache.setQueryData(eventsKey, view)
      apply(view)
    },
  })
}
