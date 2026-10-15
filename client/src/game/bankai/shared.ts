// What the Bankai windows share: the Bankai query, the action mutation and crystal colours.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BankaiCrystal,
  BankaiFeedResult,
  BankaiView,
  CrystalQualityName,
} from '../../../../shared/src/schemas/bankai'
import { api } from '../../lib/api'
import { gameKeys } from '../api'

const bankaiKey = ['game', 'bankai'] as const

export type BankaiResult = BankaiView & Partial<Pick<BankaiFeedResult, 'xpGained' | 'targetLevel'>>

export const useBankai = () =>
  useQuery({ queryKey: bankaiKey, queryFn: () => api<BankaiView>('/api/game/bankai') })

/** POSTs a Bankai action and stores the view it answers with. */
export function useBankaiAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      api<BankaiResult>(`/api/game/bankai${path}`, { method: 'POST', body }),
    onSuccess: (result, { path }) => {
      queryClient.setQueryData(bankaiKey, result)
      // Buying a crystal cell spends Coupons, Stones or Gold.
      if (path === '/slots/unlock')
        void queryClient.invalidateQueries({ queryKey: gameKeys.character })
    },
  })
}

/** QUALITY_COLORS of Reborn's bankai slice. */
export const QUALITY_COLORS: Record<CrystalQualityName, string> = {
  green: '#2d8a2d',
  blue: '#2266cc',
  purple: '#8833cc',
  gold: '#cc8800',
  black: '#333333',
  orange: '#dd6600',
}

export const crystalTitle = (crystal: BankaiCrystal) => `${crystal.name} Lv${crystal.level}`

/** Hover text: Reborn's crystal tooltip lines. */
export const crystalTooltip = (crystal: BankaiCrystal) =>
  [
    `${crystal.name} Level ${crystal.level}`,
    crystal.xpNeeded > 0 ? `${crystal.exp} / ${crystal.xpNeeded} XP` : 'Crystal XP: MAX',
    `${crystal.label}: ${crystal.value}`,
    `Base Experience: ${crystal.foodXp}`,
    `${crystal.price} Coins`,
  ].join('\n')
