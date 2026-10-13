import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import { characters, mails, users } from '../db/schema.js'
import { SYSTEM_MAIL_CAP, SYSTEM_MAIL_DAYS, sendSystemMail } from './system-mail.js'

const { db, close } = createTestDb()
afterAll(() => close())

const DAY_MS = 86_400_000
let recipient = ''
let sender = ''

async function character(name: string) {
  const [user] = await db
    .insert(users)
    .values({ username: name, email: `${name.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  const [row] = await db
    .insert(characters)
    .values({
      userId: user!.id,
      name,
      gender: 0,
      nation: 0,
      clothing: 45,
      avatarId: 45,
      sceneId: 2601,
      hp: 1,
      mp: 1,
    })
    .returning()
  return row!.id
}

const playerMail = (subject: string) => ({
  recipientId: recipient,
  senderId: sender,
  category: 'player' as const,
  subject,
  body: 'Hello',
  expiresAt: new Date(Date.now() + 7 * DAY_MS),
})

const inbox = () =>
  db
    .select()
    .from(mails)
    .where(eq(mails.recipientId, recipient))
    .orderBy(asc(mails.createdAt), asc(mails.id))

beforeEach(async () => {
  await truncateAll(db)
  recipient = await character('Sakura')
  sender = await character('Sasuke')
})

describe('sendSystemMail', () => {
  it('inserts an unread system mail with its template, params and a 30-day lifetime', async () => {
    const mail = await db.transaction((tx) =>
      sendSystemMail(tx, recipient, 'market', 'market.sold', { itemId: 'i250101', count: 2 }),
    )

    expect(mail).toMatchObject({
      recipientId: recipient,
      senderId: null,
      category: 'market',
      subject: null,
      body: null,
      templateKey: 'market.sold',
      params: { itemId: 'i250101', count: 2 },
      readAt: null,
    })
    expect(SYSTEM_MAIL_DAYS).toBe(30)
    expect(mail.expiresAt.getTime() - mail.createdAt.getTime()).toBe(30 * DAY_MS)
    expect(await inbox()).toHaveLength(1)
  })

  it('defaults params to an empty object', async () => {
    const mail = await db.transaction((tx) => sendSystemMail(tx, recipient, 'other', 'welcome'))
    expect(mail.params).toEqual({})
  })

  it('keeps the newest system mails over the shared cap, oldest evicted first', async () => {
    expect(SYSTEM_MAIL_CAP).toBe(25)
    for (let i = 0; i < SYSTEM_MAIL_CAP + 2; i++) {
      const category = i % 2 === 0 ? 'arena' : 'market'
      await db.transaction((tx) => sendSystemMail(tx, recipient, category, 'notice', { i }))
    }

    const rows = await inbox()
    expect(rows).toHaveLength(SYSTEM_MAIL_CAP)
    expect(rows.map((row) => row.params!.i)).toEqual(
      Array.from({ length: SYSTEM_MAIL_CAP }, (_, i) => i + 2),
    )
  })

  it('counts several mails sent in one transaction in send order', async () => {
    await db.transaction(async (tx) => {
      for (let i = 0; i < SYSTEM_MAIL_CAP + 1; i++) {
        await sendSystemMail(tx, recipient, 'interaction', 'friend.added', { i })
      }
    })

    const rows = await inbox()
    expect(rows).toHaveLength(SYSTEM_MAIL_CAP)
    expect(rows[0]!.params).toEqual({ i: 1 })
  })

  it('never evicts player mail, even when the system pool is full', async () => {
    await db.insert(mails).values([playerMail('First'), playerMail('Second')])
    for (let i = 0; i < SYSTEM_MAIL_CAP + 3; i++) {
      await db.transaction((tx) => sendSystemMail(tx, recipient, 'arena', 'arena.defended', { i }))
    }

    const rows = await inbox()
    expect(rows.filter((row) => row.category === 'player').map((row) => row.subject)).toEqual([
      'First',
      'Second',
    ])
    expect(rows.filter((row) => row.category !== 'player')).toHaveLength(SYSTEM_MAIL_CAP)
  })

  it("leaves other ninjas' mail alone", async () => {
    for (let i = 0; i < SYSTEM_MAIL_CAP; i++) {
      await db.transaction((tx) => sendSystemMail(tx, sender, 'arena', 'notice', { i }))
    }
    await db.transaction((tx) => sendSystemMail(tx, recipient, 'arena', 'notice', { i: 0 }))

    const all = await db.select().from(mails)
    expect(all).toHaveLength(SYSTEM_MAIL_CAP + 1)
  })

  it('rolls back with the surrounding transaction', async () => {
    await expect(
      db.transaction(async (tx) => {
        await sendSystemMail(tx, recipient, 'market', 'market.sold', {})
        throw new Error('purchase failed')
      }),
    ).rejects.toThrow('purchase failed')
    expect(await inbox()).toHaveLength(0)
  })

  it('refuses an empty template key', async () => {
    await expect(
      db.transaction((tx) => sendSystemMail(tx, recipient, 'market', '', {})),
    ).rejects.toThrow()
  })
})
