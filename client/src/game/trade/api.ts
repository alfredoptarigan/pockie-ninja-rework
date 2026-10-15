// Data hooks for /api/game/trade (server/src/modules/trade). The state sits under gameKeys.all, so
// every applied game action refetches it; `trade` notices refetch it too, and a completed trade
// refetches the bag and the character.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { TradeState } from '../../../../shared/src/schemas/trade'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'
import { onNotice } from '../Chat'

export {
  TRADE_CONFIG,
  canTradeAt,
  tradeFee,
  type TradeCurrency,
} from '../../../../game-core/src/economy/trade'

const base = '/api/game/trade'
export const tradeKey = [...gameKeys.all, 'trade'] as const

/** My trade and the requests to and from me. */
export function useTrade() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onNotice((notice) => {
        if (notice.kind !== 'trade') return
        void queryClient.invalidateQueries({ queryKey: notice.done ? gameKeys.all : tradeKey })
      }),
    [queryClient],
  )
  return useQuery({ queryKey: tradeKey, queryFn: () => api<TradeState>(base) })
}

type TradeResult = TradeState & { completed?: boolean; character?: Character }

/** Every trade step answers with my fresh trade state (and, on completion, my character). */
export function useTradeAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<TradeResult>(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: ({ trade, incoming, outgoing, character }) => {
      queryClient.setQueryData<TradeState>(tradeKey, { trade, incoming, outgoing })
      if (character) apply({ character })
    },
    // A refused step (the trade changed or ended): show what the server has now.
    onError: () => void queryClient.invalidateQueries({ queryKey: tradeKey }),
  })
}
