// What the wing windows share: the wings query, icons and names.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { WingsView } from '../../../../shared/src/schemas/wings'
import auras from '../../generated/reborn-auras.json'
import wings from '../../generated/reborn-wings.json'
import { api } from '../../lib/api'
import { gameKeys } from '../api'
import { plainText } from '../text'

const wingsKey = ['game', 'wings'] as const
/** Item id ("i218000") to its Reborn icon. */
export const WING_ICONS: Record<string, string> = Object.fromEntries(
  [...Object.values(wings), ...Object.values(auras)].map((entry) => [`i${entry.item}`, entry.icon]),
)

export const nameOf = (nameKey: string) => plainText(nameKey, 'Unknown item')

export const useWingsView = () =>
  useQuery({ queryKey: wingsKey, queryFn: () => api<WingsView>('/api/game/wings') })

/** Stores a wings result; wing stats feed the fighter, so the character and the bag refetch. */
export function useSettleWings() {
  const queryClient = useQueryClient()
  return (result: WingsView) => {
    queryClient.setQueryData(wingsKey, result)
    void queryClient.invalidateQueries({
      queryKey: gameKeys.all,
      predicate: (query) => query.queryKey[1] !== 'wings',
    })
  }
}

export function WingIcon({ itemId, name }: { itemId: string; name: string }) {
  return (
    <span className="game-slot grid size-11 shrink-0 place-items-center">
      <img src={WING_ICONS[itemId]} alt={name} className="max-h-full max-w-full p-0.5" />
    </span>
  )
}
