// Reborn's trade popups (`er`, 250x100): to the asked player "{{name}} wants to trade" with See
// Trade / Decline (See Trade disabled under level 30, the message then the level rule); to the
// asker "Waiting for {{name}}..." with Cancel. Then the Trade window, while a trade is open.
// Requests run out after TRADE_CONFIG.requestTtlMs: the popup refetches when it does.
import type { Character } from '@pockie/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { TradeRequestView } from '../../../../shared/src/schemas/trade'
import { errorMessage } from '../api'
import { Prompt } from '../Prompt'
import { showToast } from '../toast'
import { canTradeAt, TRADE_CONFIG, tradeKey, useTrade, useTradeAction } from './api'
import { TradeWindow } from './TradeWindow'

/** Refetches the trade state when the request runs out. */
function useExpiry(request: TradeRequestView) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: tradeKey }),
      Math.max(0, Date.parse(request.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [queryClient, request.expiresAt])
}

function Incoming({ request, level }: { request: TradeRequestView; level: number }) {
  const action = useTradeAction()
  useExpiry(request)
  const allowed = canTradeAt(level)
  const answer = (path: 'accept' | 'decline') =>
    action.mutate(
      { path, body: { requestId: request.id } },
      { onError: (error) => showToast(errorMessage(error), 'failure') },
    )
  return (
    <Prompt
      label="Trade request"
      message={
        allowed
          ? `${request.from.name} wants to trade`
          : `Both players must be at least level ${TRADE_CONFIG.minLevel} to trade.`
      }
      acceptLabel="See Trade"
      acceptDisabled={!allowed || action.isPending}
      onAccept={() => answer('accept')}
      denyLabel="Decline"
      onClose={() => answer('decline')}
    />
  )
}

function Outgoing({ request }: { request: TradeRequestView }) {
  const action = useTradeAction()
  useExpiry(request)
  return (
    <Prompt
      label="Trade request"
      message={`Waiting for ${request.to.name}...`}
      denyLabel="Cancel"
      onClose={() =>
        action.mutate(
          { path: 'cancel-request' },
          { onError: (error) => showToast(errorMessage(error), 'failure') },
        )
      }
    />
  )
}

export function TradeLayer({ character }: { character: Character }) {
  const { data } = useTrade()
  if (!data) return null
  if (data.trade)
    return <TradeWindow key={data.trade.id} trade={data.trade} character={character} />
  if (data.outgoing) return <Outgoing key={data.outgoing.id} request={data.outgoing} />
  const [incoming] = data.incoming
  return incoming ? <Incoming key={incoming.id} request={incoming} level={character.level} /> : null
}
