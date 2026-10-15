import type {
  SkillView,
  SkillSlotInput,
  BuyPouchesInput,
  Character,
  CharacterStats,
  CreateCharacterInput,
  CreationOptions,
  TravelInput,
} from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, ApiError } from '../lib/api'
import type {
  ActionResult,
  FightResult,
  InventoryItem,
  Quest,
  QuestOffer,
  SceneView,
  TalkResult,
  ExploreResult,
  ExploreView,
} from './types'

export const gameKeys = {
  all: ['game'] as const,
  character: ['game', 'character'] as const,
  creation: ['game', 'creation'] as const,
  scene: ['game', 'scene'] as const,
  stats: ['game', 'stats'] as const,
  quests: ['game', 'quests'] as const,
  availableQuests: ['game', 'quests', 'available'] as const,
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

/**
 * Combat stats with equipment (GET /character `stats`). Its own query, so every game action
 * refetches it (actions only return the character).
 */
export function useCharacterStats() {
  return useQuery({
    queryKey: gameKeys.stats,
    queryFn: async () => (await api<{ stats: CharacterStats }>('/api/game/character')).stats,
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

/** NPC quests the character can take now, and the ids of finished quests. */
export function useAvailableQuests() {
  return useQuery({
    queryKey: gameKeys.availableQuests,
    queryFn: () =>
      api<{ available: QuestOffer[]; completed: number[] }>('/api/game/quests/available'),
  })
}

/** `enabled: false` waits (the chat box only needs the bag once a line links an item). */
export function useInventory({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: gameKeys.inventory,
    queryFn: async () => (await api<{ items: InventoryItem[] }>('/api/game/inventory')).items,
  })
}

/**
 * Puts a game action's result into the cache: the returned character replaces the cached one and
 * the rest of the game state (scene, quests, inventory) is refetched, since most actions touch
 * several of them.
 */
export function useApplyResult() {
  const queryClient = useQueryClient()
  return useCallback(
    (result: { character: Character }) => {
      queryClient.setQueryData(gameKeys.character, result.character)
      void queryClient.invalidateQueries({
        queryKey: gameKeys.all,
        predicate: (query) => query.queryKey[1] !== 'character',
      })
    },
    [queryClient],
  )
}

/**
 * A game action whose result is applied at once, unless `defer` says the caller applies it later
 * (with useApplyResult): a fight keeps the HUD at its pre-fight values until the replay is over.
 */
function useGameAction<TInput, TResult extends { character: Character }>(
  request: (input: TInput) => Promise<TResult>,
  defer: (result: TResult) => boolean = () => false,
) {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => {
      if (!defer(result)) apply(result)
    },
  })
}

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })

/** Inventory "Hide" (Reborn's setCharacterPrivacy): keeps stats and skills from other players. */
export function useSetCharacterPrivacy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (hideStats: boolean) =>
      post<{ character: Character }>('/api/game/character/privacy', { hideStats }),
    onSuccess: ({ character }) => queryClient.setQueryData(gameKeys.character, character),
  })
}

export function useCreateCharacter() {
  return useGameAction((input: CreateCharacterInput) =>
    post<{ character: Character }>('/api/game/characters', input),
  )
}

/** A scene id is a world map trip; scene exits pass `via: 'link'`, Village / Go out `home` / `out`. */
export function useTravel() {
  return useGameAction((input: number | TravelInput) =>
    post<{ character: Character }>(
      '/api/game/travel',
      typeof input === 'number' ? { sceneId: input } : input,
    ),
  )
}

/** The Stone Organization's rest: full HP and MP for Stone. */
export function useRest() {
  return useGameAction((npcId: string) =>
    post<{ cost: number; character: Character }>('/api/game/rest', { npcId }),
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

export function useRevive() {
  return useGameAction((mode: 'home' | 'gold') =>
    post<{ character: Character }>('/api/game/revive', { mode }),
  )
}

export function useBuyPouches() {
  return useGameAction((input: BuyPouchesInput) =>
    post<ActionResult>('/api/game/pouches/buy', input),
  )
}

/** The caller applies the result (useApplyResult) once the replay is over. */
export function useFight() {
  return useGameAction(
    (monsterId: string) => post<FightResult>('/api/game/fight', { monsterId }),
    () => true,
  )
}

export function useUseItem() {
  return useGameAction((id: string) => post<ActionResult>(`/api/game/items/${id}/use`))
}

export function useEquipItem() {
  return useGameAction((id: string) => post<ActionResult>(`/api/game/items/${id}/equip`))
}

/** Moves a worn item back to the bag; no quest completes, so only the character comes back. */
export function useUnequipItem() {
  return useGameAction((id: string) =>
    post<{ character: Character }>(`/api/game/items/${id}/unequip`),
  )
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

/** Under gameKeys.all, so every game action (travel, revive, explore) refetches it. */
export const exploreKey = ['game', 'explore'] as const

/** Explore spots of the current scene, today's searches and the rest after the last one. */
export function useExplore(enabled = true) {
  return useQuery({
    queryKey: exploreKey,
    queryFn: () => api<ExploreView>('/api/game/explore'),
    enabled,
  })
}

/** A search with a fight is applied by the caller (useApplyResult) once its replay is over. */
export function useExploreSpot() {
  return useGameAction(
    (spotId: string) => post<ExploreResult>(`/api/game/explore/${spotId}`),
    (result) => Boolean(result.fight),
  )
}

export interface PendingTreasure {
  id: string
  boxId: string
  slots: number
}
export function usePendingTreasure() {
  return useQuery({
    queryKey: ['game', 'treasure'],
    queryFn: () => api<{ treasure: PendingTreasure | null }>('/api/game/treasure'),
  })
}
export function useOpenTreasure() {
  return useGameAction((input: { id: string; currency: 'gold' | 'giftCoupon' }) =>
    post<{ treasure: PendingTreasure; character: Character }>(
      `/api/game/items/${input.id}/treasure`,
      { currency: input.currency },
    ),
  )
}
export function usePickTreasure() {
  return useGameAction((input: { id: string; slot: number }) =>
    post<{
      cards: string[]
      slot: number
      reward: { itemId: string; bound: boolean; count: number }
      character: Character
    }>(`/api/game/treasure/${input.id}/pick`, { slot: input.slot }),
  )
}

export interface BuffsView {
  buffs: { buffId: number; nameKey: string; expiresAt: string | null; removable: boolean }[]
  titles: { titleId: number; nameKey: string; active: boolean; expiresAt: string | null }[]
}
export function useBuffs() {
  return useQuery({ queryKey: ['game', 'buffs'], queryFn: () => api<BuffsView>('/api/game/buffs') })
}
export function useActivateTitle() {
  return useGameAction((titleId: number) =>
    post<BuffsView & { character: Character }>('/api/game/titles/activate', { titleId }),
  )
}
export function useRemoveBuff() {
  return useGameAction((buffId: number) =>
    post<BuffsView & { character: Character }>(`/api/game/buffs/${buffId}/remove`),
  )
}

const skillsKey = ['game', 'skills'] as const
export function useSkills() {
  return useQuery({ queryKey: skillsKey, queryFn: () => api<SkillView>('/api/game/skills') })
}
function useSkillAction<T>(path: string) {
  const cache = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (input: T) => post<SkillView & { character: Character }>(path, input),
    onSuccess: (result) => {
      cache.setQueryData(skillsKey, result)
      apply(result)
    },
  })
}
export function useSetSkillSlot() {
  return useSkillAction<SkillSlotInput>('/api/game/skills/slot')
}
export function useActivateSkillTree() {
  return useSkillAction<{ tree: number }>('/api/game/skills/tree')
}
export function useResetSkills() {
  return useSkillAction<{ currency: 'gold' | 'giftCoupon' }>('/api/game/skills/reset')
}
