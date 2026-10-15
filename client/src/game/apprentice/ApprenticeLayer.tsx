// The asked player's popup for a master / apprentice request: "{name} (Level n) wants to be your
// master" with Accept / Decline. Requests run out after APPRENTICE_CONFIG.requestTtlMs: the popup
// refetches then. The sender sees "Waiting for {name}..." in the Player List's Apprentice tab.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ApprenticeRequestView } from '../../../../shared/src/schemas/apprentice'
import { errorMessage } from '../api'
import { Prompt } from '../Prompt'
import { showToast } from '../toast'
import { apprenticeKey, useApprentice, useApprenticeAction } from './api'

function Incoming({ request }: { request: ApprenticeRequestView }) {
  const queryClient = useQueryClient()
  const action = useApprenticeAction()
  useEffect(() => {
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: apprenticeKey }),
      Math.max(0, Date.parse(request.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [queryClient, request.expiresAt])
  const answer = (path: 'accept' | 'decline') =>
    action.mutate(
      { path, body: { requestId: request.id } },
      { onError: (error) => showToast(errorMessage(error), 'failure') },
    )
  return (
    <Prompt
      label="Apprentice request"
      message={`${request.from.name} (Level ${request.from.level}) wants to be your ${request.senderRole}.`}
      acceptDisabled={action.isPending}
      onAccept={() => answer('accept')}
      denyLabel="Decline"
      onClose={() => answer('decline')}
    />
  )
}

export function ApprenticeLayer() {
  const [incoming] = useApprentice().data?.incoming ?? []
  return incoming ? <Incoming key={incoming.id} request={incoming} /> : null
}
