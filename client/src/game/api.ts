import type { Character, CreateCharacterInput, CreationOptions } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type {
  ActionResult,
  FightResult,
  InventoryItem,
  Quest,
  SceneView,
  TalkResult,
} from './types'

export const gameKeys = {
  all: ['game'] as const,
  character: ['game', 'character'] as const,
  creation: ['game', 'creation'] as const,
  scene: ['game', 'scene'] as const,
  quests: ['game', 'quests'] as const,
  inventory: ['game', 'inventory'] as const,
}

/** The player's ninja, or null when the account has none yet. */
export function useCharacter() {
  return useQuery({
    queryKey: gameKeys.character,
    queryFn: async () => {
      try {
        return (await api<{ character: Character }>('/api/game/character')).character
      } catch (error) {
        if (error instanceof ApiError && error.code === 'no_character') return null
        throw error
      }
    },
  })
}

export function useCreationOptions() {
  return useQuery({
    queryKey: gameKeys.creation,
    queryFn: () => api<CreationOptions>('/api/game/creation'),
  })
}

export function useScene() {
  return useQuery({ queryKey: gameKeys.scene, queryFn: () => api<SceneView>('/api/game/scene') })
}

export function useQuests() {
  return useQuery({
    queryKey: gameKeys.quests,
    queryFn: async () => (await api<{ quests: Quest[] }>('/api/game/quests')).quests,
  })
}

export function useInventory() {
  return useQuery({
    queryKey: gameKeys.inventory,
    queryFn: async () => (await api<{ items: InventoryItem[] }>('/api/game/inventory')).items,
  })
}

/**
 * A game action. The returned character replaces the cached one and the rest of the game state
 * (scene, quests, inventory) is refetched, since most actions touch several of them.
 */
function useGameAction<TInput, TResult extends { character: Character }>(
  request: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      queryClient.setQueryData(gameKeys.character, result.character)
      void queryClient.invalidateQueries({
        queryKey: gameKeys.all,
        predicate: (query) => query.queryKey[1] !== 'character',
      })
    },
  })
}

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })

export function useCreateCharacter() {
  return useGameAction((input: CreateCharacterInput) =>
    post<{ character: Character }>('/api/game/characters', input),
  )
}

export function useTravel() {
  return useGameAction((sceneId: number) =>
    post<{ character: Character }>('/api/game/travel', { sceneId }),
  )
}

export function useTalk() {
  return useGameAction((npcId: string) => post<TalkResult>(`/api/game/npcs/${npcId}/talk`))
}

export function useAcceptQuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) => post<unknown>(`/api/game/quests/${taskId}/accept`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gameKeys.quests }),
  })
}

export function useFight() {
  return useGameAction((monsterId: string) => post<FightResult>('/api/game/fight', { monsterId }))
}

export function useUseItem() {
  return useGameAction((id: string) => post<ActionResult>(`/api/game/items/${id}/use`))
}

export function useEquipItem() {
  return useGameAction((id: string) => post<ActionResult>(`/api/game/items/${id}/equip`))
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}
