import type { Character } from '@pockie/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'
import { itemName } from '../explore'
import type {
  MarketBrowseInput,
  MarketBrowseView,
  MarketMineView,
  MarketWarehouseView,
} from '../../../../shared/src/schemas/market'
import worldData from '../world-data.json'

export const MARKET = '/api/game/market'
export const MARKET_LEVEL = 25
const marketKey = [...gameKeys.all, 'market'] as const
/** Server limit on the ids a name search may send. */
export const MAX_SEARCH_IDS = 500

export interface MarketCategory {
  Name: number | string
  Des: string
  Path: string
  children: MarketCategory[]
}

export function useMarketCategories() {
  return useQuery({
    queryKey: [...marketKey, 'categories'],
    staleTime: Infinity,
    queryFn: async () =>
      (await api<{ categories: MarketCategory[] }>(`${MARKET}/categories`)).categories,
  })
}

const queryString = (query: MarketBrowseInput) =>
  new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : String(value)]],
    ),
  ).toString()

export function useMarketBrowse(query: MarketBrowseInput, enabled = true) {
  return useQuery({
    queryKey: [...marketKey, 'browse', query],
    enabled,
    placeholderData: (previous) => previous,
    queryFn: () => api<MarketBrowseView>(`${MARKET}/browse?${queryString(query)}`),
  })
}

export function useMarketMine() {
  return useQuery({
    queryKey: [...marketKey, 'mine'],
    queryFn: () => api<MarketMineView>(`${MARKET}/mine`),
  })
}

export function useMarketWarehouse() {
  return useQuery({
    queryKey: [...marketKey, 'warehouse'],
    queryFn: () => api<MarketWarehouseView>(`${MARKET}/warehouse`),
  })
}

/** A Market POST; the result's character replaces the cached one and Market views refetch. */
export function useMarketAction() {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body: object }) =>
      api<{ character: Character; claimed?: number; left?: number }>(`${MARKET}/${action}`, {
        method: 'POST',
        body,
      }),
    onSuccess: apply,
  })
}

const itemNames = worldData.itemNames as Record<string, string>

/**
 * Name search: the server has no item names, so the client turns the text into the ids whose
 * English name contains it. Returns 'too_many' when the text is too short to narrow it down.
 */
export function searchItemIds(text: string): string[] | 'too_many' {
  const needle = text.trim().toLowerCase()
  if (!needle) return []
  const ids = Object.keys(itemNames).filter((id) => itemName(id).toLowerCase().includes(needle))
  return ids.length > MAX_SEARCH_IDS ? 'too_many' : ids
}
