import type { FaqItem, LoreChapter, PostKind, PostsPage, ServerStatus } from '@pockie/shared'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './api'

const PAGE_SIZE = 4
const STATUS_POLL_MS = 30_000

export function usePosts(kind: PostKind | undefined) {
  return useInfiniteQuery({
    queryKey: ['posts', kind ?? 'all'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (kind) params.set('kind', kind)
      if (pageParam) params.set('cursor', pageParam)
      return api<PostsPage>(`/api/posts?${params}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  })
}

export function useLore() {
  return useQuery({
    queryKey: ['lore'],
    queryFn: async () => (await api<{ items: LoreChapter[] }>('/api/lore')).items,
  })
}

export function useFaq() {
  return useQuery({
    queryKey: ['faq'],
    queryFn: async () => (await api<{ items: FaqItem[] }>('/api/faq')).items,
  })
}

export function useServerStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api<ServerStatus>('/api/status'),
    refetchInterval: STATUS_POLL_MS,
  })
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export const formatDate = (iso: string) => dateFormat.format(new Date(iso))
