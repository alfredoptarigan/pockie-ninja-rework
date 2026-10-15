// Valley of the End: Hashirama vs Madara (Reborn village icon, only while a battle is open).
import { useQuery } from '@tanstack/react-query'
import type { HashiramaAccess } from '../../../../shared/src/schemas/hashirama'
import { api } from '../../lib/api'

export { HashiramaWindow } from './HashiramaWindow'

const ACCESS_POLL_MS = 60_000

/** Whether a battle is open (Reborn `hashiramaAccess`, re-polled): the HUD shows its icon then. */
export function useHashiramaOpen() {
  const access = useQuery({
    queryKey: ['hashirama-access'],
    queryFn: () => api<HashiramaAccess>('/api/game/hashirama/access'),
    refetchInterval: ACCESS_POLL_MS,
  })
  return access.data?.open ?? false
}
