import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../../lib/api'
import { onFriendPresence, onNotice } from '../Chat'
import type {
  BlockedView,
  FriendsView,
  MailCategory,
  MailListView,
  MailSendInput,
  MailSummary,
  PlayerView,
  ScenePlayersView,
} from '../../../../shared/src/schemas/social'

const base = '/api/game/social'
export const socialKeys = {
  all: ['game', 'social'] as const,
  friends: ['game', 'social', 'friends'] as const,
  blocked: ['game', 'social', 'blocks'] as const,
  mail: ['game', 'social', 'mail'] as const,
  mailList: (category: MailCategory) => ['game', 'social', 'mail', category] as const,
  mailSummary: ['game', 'social', 'mail', 'summary'] as const,
  scenePlayers: (sceneId: number) => ['game', 'social', 'scene', sceneId] as const,
  player: (characterId: string) => ['game', 'social', 'player', characterId] as const,
}
/** How often the Player List rereads the scene. */
const SCENE_PLAYERS_REFRESH_MS = 10_000
const post = <T>(path: string, body: object) => api<T>(`${base}/${path}`, { method: 'POST', body })

export function useFriends() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: socialKeys.friends })
    const offPresence = onFriendPresence(refresh)
    const offNotice = onNotice((notice) => notice.kind === 'friendAdded' && refresh())
    return () => {
      offPresence()
      offNotice()
    }
  }, [queryClient])
  return useQuery({
    queryKey: socialKeys.friends,
    queryFn: () => api<FriendsView>(`${base}/friends`),
  })
}

export function useBlocked() {
  return useQuery({
    queryKey: socialKeys.blocked,
    queryFn: () => api<BlockedView>(`${base}/blocks`),
  })
}

/**
 * Online ninjas in my scene (Player List, Area tab).
 * ponytail: polls; the chat socket's scenePlayers event would make it live once Chat shares it.
 */
export function useScenePlayers(sceneId: number) {
  return useQuery({
    queryKey: socialKeys.scenePlayers(sceneId),
    queryFn: () => api<ScenePlayersView>(`${base}/scene-players`),
    refetchInterval: SCENE_PLAYERS_REFRESH_MS,
  })
}

/** View Character: another ninja's public face. */
export function usePlayerView(characterId: string) {
  return useQuery({
    queryKey: socialKeys.player(characterId),
    queryFn: () => api<PlayerView>(`${base}/players/${characterId}`),
  })
}

/** Friend and block actions answer with the fresh list. */
export function useFriendAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      post<FriendsView | BlockedView>(path, body),
    // Blocking drops friends both ways, so refetch both lists.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: socialKeys.all }),
  })
}

/** Refetches mail whenever a mail notice arrives. */
function useMailNotices() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onNotice((notice) => {
        if (notice.kind === 'mail')
          void queryClient.invalidateQueries({ queryKey: socialKeys.mail })
      }),
    [queryClient],
  )
}

export function useMailSummary() {
  useMailNotices()
  return useQuery({
    queryKey: socialKeys.mailSummary,
    queryFn: () => api<MailSummary>(`${base}/mail/summary`),
  })
}

export function useMailList(category: MailCategory) {
  useMailNotices()
  return useQuery({
    queryKey: socialKeys.mailList(category),
    queryFn: () => api<MailListView>(`${base}/mail?category=${category}`),
  })
}

export function useMailAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => post<unknown>(path, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: socialKeys.mail }),
  })
}

export function useSendMail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MailSendInput) => post<{ ok: true }>('mail/send', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: socialKeys.mail }),
  })
}
