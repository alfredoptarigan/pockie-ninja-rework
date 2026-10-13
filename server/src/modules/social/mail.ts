// Mail (decisions 3, 18, 19; MailSystem in friends-mail.md). Text only, addressed by uuid, owner
// checked on every read and delete. Every query hides expired rows; the purge job only frees space.
import { and, count, desc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { characters, mails, reports } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { PLAYER_MAIL_DAYS } from '../../game/system-mail.js'
import { filterText } from '../../game/text-filter.js'
import {
  MAIL_CATEGORIES,
  MAIL_MIN_LEVEL,
  MAIL_SEND_PER_HOUR,
  MAIL_SEND_PER_RECIPIENT_PER_HOUR,
  PLAYER_INBOX_CAP,
  type MailCategory,
  type MailEntry,
  type MailListView,
  type MailSummary,
} from '../../../../shared/src/schemas/social.js'
import { bad, isBlocked, type CharacterRow, type Outbox } from './players.js'

/** Suggested interval for purgeExpiredMail; late runs are harmless (queries filter expiry). */
export const MAIL_PURGE_INTERVAL_MS = 60 * 60 * 1000

const live = sql`${mails.expiresAt} > now()`
const mine = (meId: string) => and(eq(mails.recipientId, meId), live)

export async function sendPlayerMail(
  tx: Tx,
  me: CharacterRow,
  them: CharacterRow,
  subject: string,
  body: string,
): Promise<Outbox> {
  if (me.level < MAIL_MIN_LEVEL)
    throw bad('level_too_low', `You need level ${MAIL_MIN_LEVEL} to send mail.`)
  if (me.id === them.id) throw bad('self', 'You cannot send mail to yourself.')
  // Same line in both directions (and for the blocker), so nobody learns who blocked whom.
  if (await isBlocked(tx, me.id, them.id))
    throw bad('refused', 'You cannot send mail to this ninja.')

  const lastHour = and(
    eq(mails.senderId, me.id),
    eq(mails.category, 'player'),
    gt(mails.createdAt, sql`now() - interval '1 hour'`),
  )
  // ponytail: counts surviving rows, so a mail the recipient deleted frees a slot; add a send log
  // if that is ever abused.
  const [sent] = await tx
    .select({
      total: count(),
      toThem: sql<number>`count(*) filter (where ${mails.recipientId} = ${them.id})`.mapWith(
        Number,
      ),
    })
    .from(mails)
    .where(lastHour)
  if (sent!.total >= MAIL_SEND_PER_HOUR || sent!.toThem >= MAIL_SEND_PER_RECIPIENT_PER_HOUR)
    throw bad('mail_rate_limited', 'You have sent too much mail. Try again later.', 429)

  const [inbox] = await tx
    .select({ total: count() })
    .from(mails)
    .where(and(mine(them.id), eq(mails.category, 'player')))
  if (inbox!.total >= PLAYER_INBOX_CAP)
    throw bad('inbox_full', "That ninja's inbox is full. Try again later.")

  const [mail] = await tx
    .insert(mails)
    .values({
      recipientId: them.id,
      senderId: me.id,
      category: 'player',
      subject: filterText(subject),
      body: filterText(body),
      expiresAt: sql`now() + make_interval(days => ${PLAYER_MAIL_DAYS})`,
    })
    .returning({ id: mails.id })
  return [[them.id, { kind: 'mail', mailId: mail!.id, category: 'player' }]]
}

export async function mailSummary(db: Tx | Db, meId: string): Promise<MailSummary> {
  const rows = await db
    .select({
      category: mails.category,
      total: count(),
      unread: sql<number>`count(*) filter (where ${mails.readAt} is null)`.mapWith(Number),
    })
    .from(mails)
    .where(mine(meId))
    .groupBy(mails.category)
  const categories = MAIL_CATEGORIES.map((category) => {
    const found = rows.find((row) => row.category === category)
    return { category, unread: found?.unread ?? 0, total: found?.total ?? 0 }
  })
  return { categories, unread: categories.reduce((sum, c) => sum + c.unread, 0) }
}

export async function mailList(
  db: Tx | Db,
  meId: string,
  category: MailCategory,
): Promise<MailListView> {
  const rows = await db
    .select({ mail: mails, senderName: characters.name })
    .from(mails)
    .leftJoin(characters, eq(characters.id, mails.senderId))
    .where(and(mine(meId), eq(mails.category, category)))
    .orderBy(desc(mails.createdAt), desc(mails.id))
  const list: MailEntry[] = rows.map(({ mail, senderName }) => ({
    id: mail.id,
    category: mail.category,
    sender: mail.senderId && senderName ? { characterId: mail.senderId, name: senderName } : null,
    subject: mail.subject,
    body: mail.body,
    templateKey: mail.templateKey,
    params: mail.params,
    read: mail.readAt !== null,
    createdAt: mail.createdAt.toISOString(),
    expiresAt: mail.expiresAt.toISOString(),
  }))
  return { ...(await mailSummary(db, meId)), mails: list }
}

const notFound = () => bad('mail_not_found', 'That mail is gone.', 404)

export async function readMail(db: Tx | Db, meId: string, id: string) {
  const [mail] = await db
    .update(mails)
    .set({ readAt: sql`coalesce(${mails.readAt}, now())` })
    .where(and(eq(mails.id, id), mine(meId)))
    .returning({ id: mails.id })
  if (!mail) throw notFound()
}

/** Deletes the caller's mails among `ids`; ids of other ninjas' mails are ignored. */
export async function deleteMails(db: Tx | Db, meId: string, ids: string[]) {
  const deleted = await db
    .delete(mails)
    .where(and(eq(mails.recipientId, meId), inArray(mails.id, ids)))
    .returning({ id: mails.id })
  return { deleted: deleted.length }
}

export async function deleteReadMails(db: Tx | Db, meId: string, category?: MailCategory) {
  const deleted = await db
    .delete(mails)
    .where(
      and(
        eq(mails.recipientId, meId),
        isNotNull(mails.readAt),
        category ? eq(mails.category, category) : undefined,
      ),
    )
    .returning({ id: mails.id })
  return { deleted: deleted.length }
}

/** Reports a player mail; the text is copied so it outlives the mail (decision 19). */
export async function reportMail(db: Tx | Db, meId: string, id: string) {
  const [mail] = await db
    .select()
    .from(mails)
    .where(and(eq(mails.id, id), mine(meId)))
  if (!mail) throw notFound()
  if (mail.category !== 'player') throw bad('not_reportable', 'Only player mail can be reported.')
  const [report] = await db
    .insert(reports)
    .values({
      reporterId: meId,
      reportedId: mail.senderId,
      kind: 'mail',
      mailId: mail.id,
      text: `${mail.subject}\n${mail.body}`,
    })
    .onConflictDoNothing()
    .returning({ id: reports.id })
  if (!report) throw bad('already_reported', 'You already reported this mail.', 409)
}

/**
 * Deletes every mail that expired at `now` (7 days player, 30 days system). Idempotent; run it
 * every MAIL_PURGE_INTERVAL_MS. Returns the number of deleted mails.
 */
export async function purgeExpiredMail(db: Db, now: Date = new Date()) {
  const deleted = await db
    .delete(mails)
    .where(lte(mails.expiresAt, now))
    .returning({ id: mails.id })
  return deleted.length
}
