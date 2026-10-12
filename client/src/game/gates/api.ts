// Data hooks for /api/game/gates/* (server/src/modules/gates). Keys sit under gameKeys.all, so
// every applied game action refetches them.
import type { Character, GateFightResult, GatesView, LasNochesView, PubView } from '@pockie/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import { useApplyResult } from '../api'
import type { Replay } from '../types'

export const gateKeys = {
  gates: ['game', 'gates'] as const,
  lasNoches: ['game', 'gates', 'las-noches'] as const,
  pub: ['game', 'gates', 'pub'] as const,
}

export const useGates = () =>
  useQuery({ queryKey: gateKeys.gates, queryFn: () => api<GatesView>('/api/game/gates') })

export const useLasNoches = () =>
  useQuery({
    queryKey: gateKeys.lasNoches,
    queryFn: () => api<LasNochesView>('/api/game/gates/las-noches'),
  })

export const usePub = () =>
  useQuery({ queryKey: gateKeys.pub, queryFn: () => api<PubView>('/api/game/gates/pub') })

export type FightOf<T> = T & GateFightResult<Replay>

/**
 * POST to /api/game/gates/<path>. The result is applied at once, except fights: their caller
 * applies it (useApplyResult) when the replay is over, like field fights.
 */
export function useGatePost<T extends { character: Character }>() {
  const apply = useApplyResult()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      api<T>(`/api/game/gates/${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: (result) => {
      if (!('replay' in result)) apply(result)
    },
  })
}

/** Open state for a window that GameApp shows (task 8 wires the NPC menus to `show`). */
function useWindowState() {
  const [open, setOpen] = useState(false)
  return { open, show: () => setOpen(true), close: () => setOpen(false) }
}
export const useOpenTollGates = useWindowState
export const useOpenLasNoches = useWindowState
export const useOpenPubFight = useWindowState
