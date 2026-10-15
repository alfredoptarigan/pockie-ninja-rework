// Hunt, Chain Attack and Adventure with Jiraiya: queries, actions and the one piece of UI state
// they share (whether Chain Attack Progress is shown, like Reborn's `showChainAttackProgress`).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type {
  AdventureReturnResult,
  AdventureView,
  ChainAttackClaimResult,
  ChainAttackStartInput,
  ChainAttackView,
  HuntCompleteResult,
  HuntView,
} from '../../../../shared/src/schemas/hunt'
import type { Character } from '@pockie/shared'
import { api } from '../../lib/api'
import { gameKeys, useApplyResult } from '../api'

export const huntKey = ['game', 'hunt'] as const
export const chainKey = ['game', 'chain-attack'] as const
export const adventureKey = ['game', 'adventure'] as const

const post = <T>(path: string) => api<T>(`/api/game/${path}`, { method: 'POST', body: {} })

export const useHunt = () =>
  useQuery({ queryKey: huntKey, queryFn: () => api<HuntView>('/api/game/hunt') })
export const useChainAttack = () =>
  useQuery({ queryKey: chainKey, queryFn: () => api<ChainAttackView>('/api/game/chain-attack') })
export const useAdventure = () =>
  useQuery({ queryKey: adventureKey, queryFn: () => api<AdventureView>('/api/game/adventure') })

/** An action: a returned character goes to the cache, and the rest of the game refetches. */
function useAction<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const apply = useApplyResult()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      const { character } = result as { character?: Character }
      if (character) apply({ character })
      else void queryClient.invalidateQueries({ queryKey: gameKeys.all })
    },
  })
}

export const useBeginHunt = () => useAction(() => post<{ hunt: HuntView }>('hunt/begin'))
export const useCompleteHunt = () => useAction(() => post<HuntCompleteResult>('hunt/complete'))

export const useStartChain = () =>
  useAction((input: ChainAttackStartInput) =>
    api<ChainAttackView>('/api/game/chain-attack', { method: 'POST', body: input }),
  )
export const useClaimChain = () =>
  useAction((instant: boolean) =>
    post<ChainAttackClaimResult>(instant ? 'chain-attack/instant-finish' : 'chain-attack/claim'),
  )

export const useStartAdventure = () =>
  useAction(() => post<{ adventure: AdventureView }>('adventure/start'))
export const useReturnFromAdventure = () =>
  useAction(() => post<AdventureReturnResult>('adventure/return'))

let progressShown = false
const listeners = new Set<() => void>()
/** Shows or hides Chain Attack Progress (the Begin button, the HUD timer, a monster's menu). */
export function showChainProgress(shown: boolean) {
  progressShown = shown
  for (const listener of listeners) listener()
}
export const useChainProgressShown = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => progressShown,
  )
