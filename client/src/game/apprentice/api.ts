// Data hooks for /api/game/apprentice (server/src/modules/apprentice). The state sits under
// gameKeys.all, so every applied game action refetches it; `apprentice` notices refetch it too,
// and a graduation refetches the character (its Stone changed).
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ApprenticeState } from '../../../../shared/src/schemas/apprentice'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'
import { onNotice } from '../Chat'

export { APPRENTICE_CONFIG } from '../../../../game-core/src/social/apprentice'

const base = '/api/game/apprentice'
export const apprenticeKey = [...gameKeys.all, 'apprentice'] as const

/** My master, my apprentices and the requests to and from me. */
export function useApprentice() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onNotice((notice) => {
        if (notice.kind !== 'apprentice') return
        void queryClient.invalidateQueries({
          queryKey: notice.rewarded ? gameKeys.all : apprenticeKey,
        })
      }),
    [queryClient],
  )
  return useQuery({ queryKey: apprenticeKey, queryFn: () => api<ApprenticeState>(base) })
}

type ApprenticeResult = ApprenticeState & { character?: Character }

/** Every step answers with my fresh state (and, on graduation, my character). */
export function useApprenticeAction() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<ApprenticeResult>(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: ({ character, ...state }) => {
      queryClient.setQueryData<ApprenticeState>(apprenticeKey, state)
      if (character) apply({ character })
    },
    // A refused step (a request ran out, a bond ended): show what the server has now.
    onError: () => void queryClient.invalidateQueries({ queryKey: apprenticeKey }),
  })
}
