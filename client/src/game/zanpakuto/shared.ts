// What the Zanpakuto windows share: the query, the action mutation, art paths and stat text.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  formatStatValue,
  qualityColor,
  statName,
  type CrystalCategory,
} from '../../../../game-core/src/zanpakuto/zanpakuto'
import type {
  ZanpakutoCrystal,
  ZanpakutoStat,
  ZanpakutoView,
} from '../../../../shared/src/schemas/zanpakuto'
import { api } from '../../lib/api'
import { gameKeys } from '../api'

const zanpakutoKey = ['game', 'zanpakuto'] as const

export const useZanpakuto = () =>
  useQuery({
    queryKey: zanpakutoKey,
    queryFn: () => api<ZanpakutoView>('/api/game/zanpakuto'),
  })

/** Actions that spend Stones or Coupons (the HUD shows them). */
const SPENDS_CURRENCY = ['/slots/unlock', '/attributes/unlock', '/bulk/refresh', '/bulk/apply']

/** POSTs a Zanpakuto action and stores the view it answers with. */
export function useZanpakutoAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      api<ZanpakutoView>(`/api/game/zanpakuto${path}`, { method: 'POST', body }),
    onSuccess: (result, { path }) => {
      queryClient.setQueryData(zanpakutoKey, result)
      if (SPENDS_CURRENCY.includes(path))
        void queryClient.invalidateQueries({ queryKey: gameKeys.character })
    },
  })
}

export type Run = (path: string, body: object, after?: () => void) => void

export const uiArt = (name: string) => `/assets/reborn/ui/UIResource/Zanpakuto/${name}.webp`
export const crystalIcon = (crystal: ZanpakutoCrystal) =>
  `/assets/reborn/icons/items/${crystal.icon}.webp`

/** Every crystal of the view (spirit slots, then the tabs). */
export const allCrystals = (data: ZanpakutoView) =>
  [...data.spirit, ...Object.values(data.tabs).flat()].filter(
    (crystal): crystal is ZanpakutoCrystal => crystal !== null,
  )

export const statText = ([stat, value]: ZanpakutoStat) =>
  `${statName(stat)}: ${formatStatValue(stat, value)}`

export const statColor = (category: CrystalCategory, [stat, value]: ZanpakutoStat) =>
  qualityColor(category, stat, value) || undefined

const TIER_NAMES = ['Blue', 'Purple', 'Orange']
const TAB_NAMES = { sharp: 'Sharp', blunt: 'Blunt', fist: 'Fist' }

/** Hover text: Reborn's crystal tooltip lines. */
export const crystalTooltip = (crystal: ZanpakutoCrystal) =>
  [
    crystal.name,
    `${TIER_NAMES[crystal.category]} Crystal · ${TAB_NAMES[crystal.tab]} · Slot ${crystal.position}`,
    ...crystal.stats.map(statText),
    `Sell: ${crystal.coins} SC`,
  ].join('\n')
