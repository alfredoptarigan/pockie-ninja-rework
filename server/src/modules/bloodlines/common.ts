// Helpers shared by the limit routes (routes.ts) and the soul routes (souls.ts).
import { and, eq } from 'drizzle-orm'
import { characterBloodlines } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'

export const bad = (code: string, message: string) => new HttpError(400, code, message)
export const DAY_MS = 86_400_000
export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10)
export const nextUtcDay = () => new Date(Date.parse(`${utcDay()}T00:00:00Z`) + DAY_MS).toISOString()

export async function lockLimit(tx: Tx, characterId: string, limitId: number) {
  const [row] = await tx
    .select()
    .from(characterBloodlines)
    .where(
      and(
        eq(characterBloodlines.characterId, characterId),
        eq(characterBloodlines.limitId, limitId),
      ),
    )
    .for('update')
  return row
}
