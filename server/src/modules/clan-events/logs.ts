// The Clan window's Logs tab (Reborn's `Wh` "Clan Activity Log", polled every 15 s): one row per
// clan action, written inside the action's transaction.
import { desc, eq } from 'drizzle-orm'
import type { ClanLogsView } from '../../../../shared/src/schemas/clan-activities.js'
import type { Db } from '../../db/client.js'
import { clanLogs } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'

/** Reborn's log keeps the recent rows; older ones are not shown. */
const LOGS_SHOWN = 200
export const SYSTEM_ACTOR = 'System'

export async function logClan(tx: Tx, clanId: string, actor: string, action: string, details = '') {
  await tx.insert(clanLogs).values({ clanId, actor, action, details })
}

export async function logsView(db: Db | Tx, clanId: string): Promise<ClanLogsView> {
  const rows = await db
    .select()
    .from(clanLogs)
    .where(eq(clanLogs.clanId, clanId))
    .orderBy(desc(clanLogs.createdAt), desc(clanLogs.id))
    .limit(LOGS_SHOWN)
  return {
    logs: rows.map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      actor: row.actor,
      action: row.action,
      details: row.details,
    })),
  }
}
