// Typed system mails (decision 3, docs/original-data/friends-mail.md): Market, arena and friend
// notices stored as { templateKey, params } and rendered by the client. Nothing is attached.
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { mails, type MailParams, type mailCategory } from '../db/schema.js'
import type { Tx } from './progress.js'

export type MailCategory = (typeof mailCategory.enumValues)[number]
export type SystemMailCategory = Exclude<MailCategory, 'player'>

/** Lifetimes (decision 18); expired rows are hidden by queries and purged by a job. */
export const PLAYER_MAIL_DAYS = 7
export const SYSTEM_MAIL_DAYS = 30

/**
 * The original shared pool of 25 system mails per ninja (MailServer caps for types 1 and 4-10).
 * A full pool evicts its oldest system mail (expired ones are the oldest), as the original
 * PushMail did; player mail is never evicted (decision 18) and does not count here.
 */
export const SYSTEM_MAIL_CAP = 25

/**
 * Inserts a system mail inside the caller's transaction and trims the recipient's system pool
 * to SYSTEM_MAIL_CAP. No row lock: two concurrent sends may leave one extra mail until the next
 * send trims it, which avoids taking the recipient's character lock out of order.
 */
export async function sendSystemMail(
  tx: Tx,
  characterId: string,
  category: SystemMailCategory,
  templateKey: string,
  params: MailParams = {},
) {
  const [mail] = await tx
    .insert(mails)
    .values({
      recipientId: characterId,
      category,
      templateKey,
      params,
      expiresAt: sql`now() + make_interval(days => ${SYSTEM_MAIL_DAYS})`,
    })
    .returning()

  const overflow = tx
    .select({ id: mails.id })
    .from(mails)
    .where(and(eq(mails.recipientId, characterId), ne(mails.category, 'player')))
    .orderBy(desc(mails.createdAt), desc(mails.id))
    .offset(SYSTEM_MAIL_CAP)
  await tx.delete(mails).where(sql`${mails.id} in ${overflow}`)

  return mail!
}
