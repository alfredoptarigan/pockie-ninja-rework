// Data hooks for Training, Protection, the Logs tab, Clan Wars and Clan Missions under
// /api/game/clan-events (server/src/modules/clan-events, clan-wars, clan-missions). Keys sit under
// clanKeys.all (so under gameKeys.all too): every applied game action refetches them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClanLogsView,
  ClanMissionsView,
  ProtectionView,
  TrainingResult,
  TrainingView,
} from '../../../../shared/src/schemas/clan-activities'
import type { ClanWarFighterResult, ClanWarStatus } from '../../../../shared/src/schemas/clan-wars'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'
import { clanEventKeys } from './events-api'

export const CLAN_EVENTS = '/api/game/clan-events'
export const activityKeys = {
  training: ['game', 'clans', 'events', 'training'] as const,
  protection: ['game', 'clans', 'events', 'protection'] as const,
  logs: ['game', 'clans', 'events', 'logs'] as const,
  wars: ['game', 'clans', 'events', 'wars'] as const,
  missions: ['game', 'clans', 'events', 'missions'] as const,
}

/** Reborn polls the Logs tab every 15 s. */
const LOGS_POLL_MS = 15_000
/** Reborn pushes boss updates; we poll while the window is open. */
const MISSIONS_POLL_MS = 5_000

export const useTraining = () =>
  useQuery({
    queryKey: activityKeys.training,
    queryFn: () => api<TrainingView>(`${CLAN_EVENTS}/training`),
  })

export function useTrainingDonate() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (course: string) =>
      api<TrainingResult>(`${CLAN_EVENTS}/training`, { method: 'POST', body: { course } }),
    onSuccess: (result) => {
      queryClient.setQueryData(activityKeys.training, result.training)
      queryClient.setQueryData(clanEventKeys.level, result.clan)
      apply(result)
    },
  })
}

export const useProtection = () =>
  useQuery({
    queryKey: activityKeys.protection,
    queryFn: () => api<ProtectionView>(`${CLAN_EVENTS}/protection`),
  })

export const useClanLogs = () =>
  useQuery({
    queryKey: activityKeys.logs,
    queryFn: () => api<ClanLogsView>(`${CLAN_EVENTS}/logs`),
    refetchInterval: LOGS_POLL_MS,
  })

export const useClanWars = () =>
  useQuery({
    queryKey: activityKeys.wars,
    queryFn: () => api<ClanWarStatus>(`${CLAN_EVENTS}/wars`),
  })

/** Equip / Update / remove the saved Clan War fighter. */
export function useClanWarFighter() {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  return useMutation({
    mutationFn: (set: number | null) =>
      api<ClanWarFighterResult>(
        set === null ? `${CLAN_EVENTS}/wars/fighter/remove` : `${CLAN_EVENTS}/wars/fighter`,
        { method: 'POST', body: set === null ? {} : { set } },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(activityKeys.wars, result.status)
      apply(result)
    },
  })
}

export const useClanMissions = () =>
  useQuery({
    queryKey: activityKeys.missions,
    queryFn: () => api<ClanMissionsView>(`${CLAN_EVENTS}/missions`),
    refetchInterval: MISSIONS_POLL_MS,
  })
