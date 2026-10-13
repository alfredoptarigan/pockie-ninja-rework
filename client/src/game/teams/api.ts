// Data hooks for /api/game/team (server/src/modules/teams). Keys sit under gameKeys.all, so every
// applied game action refetches them; team notices (prompt, team changed) refetch them too.
import type { TeamBoardView, TeamState } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../../lib/api'
import { onNotice } from '../Chat'

const base = '/api/game/team'
export const teamKeys = {
  state: ['game', 'team'] as const,
  board: ['game', 'team', 'board'] as const,
}

/** Demon City: the guard's gate select is this port's toll gate lobby (server teams/context.ts). */
const TOLL_GATE_LOBBY = 171

/**
 * Teams exist only in the neutral fields 26xx-28xx, the toll gate lobby 3102 (teams.md 2) and
 * Demon City, where teams form for the toll gates.
 */
export const teamScene = (sceneId: number) =>
  sceneId === 3102 ||
  sceneId === TOLL_GATE_LOBBY ||
  [26, 27, 28].includes(Math.floor(sceneId / 100))

const TOLL_GATE_INSTANCE = 5001

/** Scenes where the team HUD shows: the team scenes and the toll gate instance. */
export const teamHudScene = (sceneId: number) =>
  teamScene(sceneId) || sceneId === TOLL_GATE_INSTANCE

/** My team and the prompts addressed to me; refetched on every team notice. */
export function useTeam(enabled = true) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onNotice((notice) => {
        if (notice.kind === 'teamPrompt' || notice.kind === 'teamChanged')
          void queryClient.invalidateQueries({ queryKey: teamKeys.state })
      }),
    [queryClient],
  )
  return useQuery({
    queryKey: teamKeys.state,
    queryFn: () => api<TeamState>(base),
    enabled,
  })
}

/** Every lifecycle action answers with my fresh team state. */
export function useTeamAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<TeamState>(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: ({ team, prompts }) => {
      queryClient.setQueryData<TeamState>(teamKeys.state, { team, prompts })
      void queryClient.invalidateQueries({ queryKey: teamKeys.board })
    },
  })
}

export const useTeamBoard = () =>
  useQuery({ queryKey: teamKeys.board, queryFn: () => api<TeamBoardView>(`${base}/board`) })

/** List or unlist myself (or my team of two) on the board; answers with the fresh board. */
export function useBoardListing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listed: boolean) =>
      api<TeamBoardView>(`${base}/board/${listed ? 'join' : 'leave'}`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (board) => queryClient.setQueryData(teamKeys.board, board),
  })
}
