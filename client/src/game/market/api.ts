import type { Character } from '@pockie/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'
import type {
  MarketBoardView,
  MarketHistoryView,
  MarketMineView,
  MarketRecentView,
  MarketWarehouseView,
} from '../../../../shared/src/schemas/market'

export { MARKET_LEVEL } from '../../../../game-core/src/economy/market'
export const MARKET = '/api/game/market'
const marketKey = [...gameKeys.all, 'market'] as const

const useMarketView = <T>(view: string) =>
  useQuery({ queryKey: [...marketKey, view], queryFn: () => api<T>(`${MARKET}/${view}`) })

/** Every live listing (Reborn's Market tab groups and filters them here). */
export const useMarketBoard = () => useMarketView<MarketBoardView>('board')
export const useMarketMine = () => useMarketView<MarketMineView>('mine')
export const useMarketWarehouse = () => useMarketView<MarketWarehouseView>('warehouse')
export const useMarketRecent = () => useMarketView<MarketRecentView>('recent')
export const useMarketHistory = () => useMarketView<MarketHistoryView>('history')

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
