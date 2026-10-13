// Friends and the Blocked list (decisions 16 and 17, FriendSystem in friends-mail.md).
import { and, count, desc, eq, gt, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { blocks, characters, friends, mails } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { sendSystemMail } from '../../game/system-mail.js'
import {
  MAX_BLOCKED,
  MAX_FRIENDS,
  type BlockedView,
  type FriendsView,
} from '../../../../shared/src/schemas/social.js'
import { bad, isBlocked, isOnline, toPlayer, type CharacterRow, type Outbox } from './players.js'

/** One neutral line for both directions: nobody can tell who blocked whom. */
const REFUSED = 'You cannot add this player as a friend.'

const row = (owner: string, friend: string) =>
  and(eq(friends.ownerId, owner), eq(friends.friendId, friend))

/**
 * Sends a friend notice mail unless the same one went out in the last day: add, remove, add
 * again (exploit 10, the harassment loop) mails and prompts the target once. Returns the mail
 * notice to push, or an empty outbox.
 */
async function noticeMail(
  tx: Tx,
  to: string,
  templateKey: string,
  from: CharacterRow,
): Promise<Outbox> {
  const [recent] = await tx
    .select({ id: mails.id })
    .from(mails)
    .where(
      and(
        eq(mails.recipientId, to),
        eq(mails.templateKey, templateKey),
        sql`${mails.params}->>'characterId' = ${from.id}`,
        gt(mails.createdAt, sql`now() - interval '1 day'`),
      ),
    )
    .limit(1)
  if (recent) return []
  const mail = await sendSystemMail(tx, to, 'interaction', templateKey, {
    characterId: from.id,
    name: from.name,
  })
  return [[to, { kind: 'mail', mailId: mail.id, category: mail.category }]]
}

/**
 * `me` adds `them` (both rows locked). Idempotent. Mutual friends become home friends; otherwise
 * `them` gets the add-back prompt (a stored flag plus a notice) and a system mail.
 */
export async function addFriend(tx: Tx, me: CharacterRow, them: CharacterRow): Promise<Outbox> {
  if (me.id === them.id) throw bad('self', 'You cannot add yourself as a friend.')
  if (await isBlocked(tx, me.id, them.id)) throw bad('refused', REFUSED)
  const [existing] = await tx.select().from(friends).where(row(me.id, them.id))
  if (existing) return []
  const [listed] = await tx
    .select({ total: count() })
    .from(friends)
    .where(eq(friends.ownerId, me.id))
  if (listed!.total >= MAX_FRIENDS) throw bad('friends_full', 'Your friend list is full.')

  const [reverse] = await tx.select().from(friends).where(row(them.id, me.id))
  const mutual = Boolean(reverse)
  await tx.insert(friends).values({
    ownerId: me.id,
    friendId: them.id,
    homeFriend: mutual,
    addBackPending: !mutual,
  })
  if (mutual) {
    await tx
      .update(friends)
      .set({ homeFriend: true, addBackPending: false })
      .where(row(them.id, me.id))
  }
  const mailed = await noticeMail(tx, them.id, 'friend.added', me)
  if (!mailed.length || mutual) return mailed
  return [
    ...mailed,
    [
      them.id,
      {
        kind: 'friendAdded',
        from: { characterId: me.id, name: me.name, level: me.level },
      },
    ],
  ]
}

/** Dismisses the add-back prompt `them` → `me` without adding them. */
export async function declineAddBack(tx: Tx, me: CharacterRow, them: CharacterRow) {
  await tx.update(friends).set({ addBackPending: false }).where(row(them.id, me.id))
}

/** One-sided remove; the other side keeps its row, loses the home flag and gets a mail. */
export async function removeFriend(tx: Tx, me: CharacterRow, them: CharacterRow): Promise<Outbox> {
  const removed = await tx.delete(friends).where(row(me.id, them.id)).returning()
  if (!removed.length) return []
  await tx.update(friends).set({ homeFriend: false }).where(row(them.id, me.id))
  return noticeMail(tx, them.id, 'friend.removed', me)
}

/** Blocks `them` and drops the friendship both ways. Idempotent; `them` is not told. */
export async function block(tx: Tx, me: CharacterRow, them: CharacterRow) {
  if (me.id === them.id) throw bad('self', 'You cannot block yourself.')
  const pair = and(eq(blocks.ownerId, me.id), eq(blocks.blockedId, them.id))
  const [existing] = await tx.select().from(blocks).where(pair)
  if (!existing) {
    const [listed] = await tx
      .select({ total: count() })
      .from(blocks)
      .where(eq(blocks.ownerId, me.id))
    if (listed!.total >= MAX_BLOCKED) throw bad('blocked_full', 'Your blocked list is full.')
    await tx.insert(blocks).values({ ownerId: me.id, blockedId: them.id })
  }
  await tx.delete(friends).where(or(row(me.id, them.id), row(them.id, me.id)))
}

export async function unblock(tx: Tx, meId: string, themId: string) {
  await tx.delete(blocks).where(and(eq(blocks.ownerId, meId), eq(blocks.blockedId, themId)))
}

export async function friendsView(db: Tx | Db, meId: string): Promise<FriendsView> {
  const listed = await db
    .select({ character: characters, mutual: friends.homeFriend })
    .from(friends)
    .innerJoin(characters, eq(characters.id, friends.friendId))
    .where(eq(friends.ownerId, meId))
    .orderBy(desc(characters.level), characters.nameLower)
  const pending = await db
    .select({ character: characters })
    .from(friends)
    .innerJoin(characters, eq(characters.id, friends.ownerId))
    .where(
      and(
        eq(friends.friendId, meId),
        eq(friends.addBackPending, true),
        sql`not exists (select 1 from ${friends} mine where mine.owner_id = ${meId} and mine.friend_id = ${friends.ownerId})`,
      ),
    )
    .orderBy(friends.createdAt)
  return {
    friends: listed.map(({ character, mutual }) => ({
      ...toPlayer(character),
      online: isOnline(character.id),
      mutual,
    })),
    addBack: pending.map(({ character }) => toPlayer(character)),
    max: MAX_FRIENDS,
  }
}

export async function blockedView(db: Tx | Db, meId: string): Promise<BlockedView> {
  const listed = await db
    .select({ character: characters })
    .from(blocks)
    .innerJoin(characters, eq(characters.id, blocks.blockedId))
    .where(eq(blocks.ownerId, meId))
    .orderBy(characters.nameLower)
  return { blocked: listed.map(({ character }) => toPlayer(character)), max: MAX_BLOCKED }
}
