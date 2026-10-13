import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Notice } from '@pockie/shared'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { blocks, characters, friends, mails, reports, users } from '../../db/schema.js'
import { PLAYER_MAIL_DAYS, SYSTEM_MAIL_DAYS, sendSystemMail } from '../../game/system-mail.js'
import { mailConfig } from '../../game/data.js'
import { presence } from '../realtime/events.js'
import {
  MAIL_BODY_MAX,
  MAIL_SEND_PER_HOUR,
  MAIL_SEND_PER_RECIPIENT_PER_HOUR,
  MAIL_SUBJECT_MAX,
  MAX_FRIENDS,
  PLAYER_INBOX_CAP,
} from '../../../../shared/src/schemas/social.js'
import { isBlocked, purgeExpiredMail, socialRoutes } from './routes.js'

const { db, close } = createTestDb()
const base = '/api/game/social'
let app: ReturnType<typeof buildTestApp>
let notices: [string, Notice][]
let offNotice: () => void

interface Ninja {
  id: string
  name: string
  client: Client
}

async function ninja(name: string, level = 10): Promise<Ninja> {
  const client = new Client(app)
  await client.post('/api/auth/register', {
    username: `user_${name}`,
    email: `${name.toLowerCase()}@example.com`,
    password: 'believe-it',
  })
  const response = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id = response.json().character.id as string
  await db.update(characters).set({ level }).where(eq(characters.id, id))
  return { id, name, client }
}
/** A character without a login, for list-size tests. */
async function bareCharacter(name: string) {
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
      clothing: 3,
      avatarId: 1,
      hp: 1,
      mp: 1,
      sceneId: 1,
    })
    .returning()
  return row!
}

const post = (who: Ninja, path: string, body: object = {}) =>
  who.client.post(`${base}/${path}`, body)
const get = (who: Ninja, path: string) => who.client.get(`${base}/${path}`)
const send = (from: Ninja, to: string, subject = 'Hello', body = 'Hi there') =>
  post(from, 'mail/send', { to, subject, body })
const inbox = async (who: Ninja, category = 'player') =>
  (await get(who, `mail?category=${category}`)).json()
const friendRow = async (owner: string, friend: string) =>
  (
    await db
      .select()
      .from(friends)
      .where(and(eq(friends.ownerId, owner), eq(friends.friendId, friend)))
  )[0]

let naruto: Ninja
let sasuke: Ninja

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  // ponytail: remove this line once app.ts registers socialRoutes under the same prefix.
  app.register(socialRoutes, { db, prefix: base })
  notices = []
  offNotice = presence.onNotice((id, notice) => notices.push([id, notice]))
  naruto = await ninja('Naruto_01')
  sasuke = await ninja('Sasuke_01')
})
afterEach(async () => {
  offNotice()
  await app.close()
})
afterAll(() => close())

describe('friends', () => {
  it('adds a friend by name one-sidedly, with an add-back prompt, a mail and a notice', async () => {
    const response = await post(naruto, 'friends/add', { name: 'sasuke_01' })
    expect(response.statusCode).toBe(200)
    expect(response.json().friends).toEqual([
      expect.objectContaining({ characterId: sasuke.id, name: 'Sasuke_01', mutual: false }),
    ])
    expect(await friendRow(sasuke.id, naruto.id)).toBeUndefined()

    const theirs = (await get(sasuke, 'friends')).json()
    expect(theirs.friends).toEqual([])
    expect(theirs.addBack).toEqual([expect.objectContaining({ characterId: naruto.id })])
    const [mail] = (await inbox(sasuke, 'interaction')).mails
    expect(mail).toMatchObject({
      templateKey: 'friend.added',
      params: { characterId: naruto.id, name: 'Naruto_01' },
    })
    expect(notices).toEqual([
      [sasuke.id, { kind: 'mail', mailId: mail.id, category: 'interaction' }],
      [
        sasuke.id,
        { kind: 'friendAdded', from: { characterId: naruto.id, name: 'Naruto_01', level: 10 } },
      ],
    ])
  })

  it('is idempotent and mails the same pair at most once a day', async () => {
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    expect((await post(naruto, 'friends/add', { name: 'Sasuke_01' })).statusCode).toBe(200)
    await post(naruto, 'friends/remove', { characterId: sasuke.id })
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    const mails = (await inbox(sasuke, 'interaction')).mails as { templateKey: string }[]
    expect(mails.filter((m) => m.templateKey === 'friend.added')).toHaveLength(1)
    expect(mails.filter((m) => m.templateKey === 'friend.removed')).toHaveLength(1)
    expect(notices.filter(([, n]) => n.kind === 'friendAdded')).toHaveLength(1)
  })

  it('accepting the add-back prompt makes both home friends', async () => {
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    const response = await post(sasuke, 'friends/add-back', {
      characterId: naruto.id,
      accept: true,
    })
    expect(response.json().friends).toEqual([
      expect.objectContaining({ characterId: naruto.id, mutual: true }),
    ])
    expect(response.json().addBack).toEqual([])
    expect(await friendRow(naruto.id, sasuke.id)).toMatchObject({
      homeFriend: true,
      addBackPending: false,
    })
    expect(await friendRow(sasuke.id, naruto.id)).toMatchObject({ homeFriend: true })
  })

  it('declining the add-back prompt only clears it', async () => {
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    const response = await post(sasuke, 'friends/add-back', {
      characterId: naruto.id,
      accept: false,
    })
    expect(response.json()).toMatchObject({ friends: [], addBack: [] })
    expect(await friendRow(naruto.id, sasuke.id)).toMatchObject({ addBackPending: false })
  })

  it('removes one-sidedly, drops the mutual flag and mails the other side', async () => {
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    await post(sasuke, 'friends/add', { name: 'Naruto_01' })
    const response = await post(naruto, 'friends/remove', { characterId: sasuke.id })
    expect(response.json().friends).toEqual([])
    expect(await friendRow(sasuke.id, naruto.id)).toMatchObject({ homeFriend: false })
    const mails = (await inbox(sasuke, 'interaction')).mails
    expect(mails).toContainEqual(
      expect.objectContaining({ templateKey: 'friend.removed', params: expect.anything() }),
    )
  })

  it('lists online status, level and village', async () => {
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    presence.online(sasuke.id)
    try {
      expect((await get(naruto, 'friends')).json().friends[0]).toMatchObject({
        online: true,
        level: 10,
        nation: 0,
      })
    } finally {
      presence.offline(sasuke.id)
    }
    expect((await get(naruto, 'friends')).json().friends[0].online).toBe(false)
  })

  it('refuses unknown names, yourself and a full list', async () => {
    const unknown = await post(naruto, 'friends/add', { name: 'Nobody_99' })
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error.message).toBe('There is no ninja with that name.')
    expect((await post(naruto, 'friends/add', { name: 'NARUTO_01' })).json().error.code).toBe(
      'self',
    )
    for (let i = 0; i < MAX_FRIENDS; i++) {
      const other = await bareCharacter(`Filler_${i}`)
      await db.insert(friends).values({ ownerId: naruto.id, friendId: other.id })
    }
    expect((await post(naruto, 'friends/add', { name: 'Sasuke_01' })).json().error.code).toBe(
      'friends_full',
    )
  })

  it('refuses a friend add when either side blocked the other', async () => {
    await post(sasuke, 'blocks/add', { name: 'Naruto_01' })
    const one = await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    const other = await post(sasuke, 'friends/add', { name: 'Naruto_01' })
    expect(one.json().error).toMatchObject({ code: 'refused' })
    expect(other.json().error).toEqual(one.json().error)
    expect(await db.select().from(friends)).toEqual([])
  })
})

describe('blocked list', () => {
  it('blocking removes the friendships both ways; unblock and list', async () => {
    await post(naruto, 'friends/add', { name: 'Sasuke_01' })
    await post(sasuke, 'friends/add', { name: 'Naruto_01' })
    const response = await post(naruto, 'blocks/add', { characterId: sasuke.id })
    expect(response.json().blocked).toEqual([
      expect.objectContaining({ characterId: sasuke.id, name: 'Sasuke_01' }),
    ])
    expect(await db.select().from(friends)).toEqual([])
    expect(await db.transaction((tx) => isBlocked(tx, sasuke.id, naruto.id))).toBe(true)
    expect(await db.transaction((tx) => isBlocked(tx, naruto.id, sasuke.id))).toBe(true)

    expect((await post(naruto, 'blocks/add', { name: 'Sasuke_01' })).statusCode).toBe(200)
    expect(await db.select().from(blocks)).toHaveLength(1)

    expect(
      (await post(naruto, 'blocks/remove', { characterId: sasuke.id })).json().blocked,
    ).toEqual([])
    expect((await get(naruto, 'blocks')).json()).toEqual({ blocked: [], max: 100 })
    expect(await db.transaction((tx) => isBlocked(tx, naruto.id, sasuke.id))).toBe(false)
  })

  it('refuses to block yourself or an unknown name', async () => {
    expect((await post(naruto, 'blocks/add', { characterId: naruto.id })).json().error.code).toBe(
      'self',
    )
    expect((await post(naruto, 'blocks/add', { name: 'Nobody_99' })).statusCode).toBe(404)
  })
})

describe('player mail', () => {
  it('delivers player mail, filters it, counts unread and notifies the recipient', async () => {
    const response = await send(naruto, 'sasuke_01', 'Hello', 'You are a shit ninja')
    expect(response.statusCode).toBe(200)
    const view = await inbox(sasuke)
    expect(view.mails).toEqual([
      expect.objectContaining({
        category: 'player',
        sender: { characterId: naruto.id, name: 'Naruto_01' },
        subject: 'Hello',
        body: 'You are a **** ninja',
        read: false,
      }),
    ])
    expect(view.unread).toBe(1)
    expect(view.categories).toContainEqual({ category: 'player', unread: 1, total: 1 })
    const [row] = await db.select().from(mails)
    const days = (row!.expiresAt.getTime() - row!.createdAt.getTime()) / 86_400_000
    expect(Math.round(days)).toBe(PLAYER_MAIL_DAYS)
    expect(notices).toContainEqual([
      sasuke.id,
      { kind: 'mail', mailId: view.mails[0].id, category: 'player' },
    ])
  })

  it('marks a mail read', async () => {
    await send(naruto, 'Sasuke_01')
    const [mail] = (await inbox(sasuke)).mails
    expect((await post(sasuke, 'mail/read', { id: mail.id })).statusCode).toBe(200)
    expect((await get(sasuke, 'mail/summary')).json().unread).toBe(0)
    expect((await inbox(sasuke)).mails[0].read).toBe(true)
  })

  it('refuses below level 10', async () => {
    await db.update(characters).set({ level: 9 }).where(eq(characters.id, naruto.id))
    const response = await send(naruto, 'Sasuke_01')
    expect(response.json().error.code).toBe('level_too_low')
    expect(await db.select().from(mails)).toEqual([])
  })

  it('refuses an unknown name and yourself', async () => {
    const response = await send(naruto, 'Nobody_99')
    expect(response.statusCode).toBe(404)
    expect(response.json().error.message).toBe('There is no ninja with that name.')
    expect((await send(naruto, 'Naruto_01')).json().error.code).toBe('self')
  })

  it('refuses a bad subject or body length', async () => {
    expect((await send(naruto, 'Sasuke_01', '', 'body')).statusCode).toBe(400)
    expect((await send(naruto, 'Sasuke_01', 's'.repeat(21), 'body')).statusCode).toBe(400)
    expect((await send(naruto, 'Sasuke_01', 'subject', '')).statusCode).toBe(400)
    expect((await send(naruto, 'Sasuke_01', 'subject', 'b'.repeat(201))).statusCode).toBe(400)
    expect(await db.select().from(mails)).toEqual([])
  })

  it('refuses mail between blocked players in both directions with one neutral line', async () => {
    await post(sasuke, 'blocks/add', { name: 'Naruto_01' })
    const one = await send(naruto, 'Sasuke_01')
    const other = await send(sasuke, 'Naruto_01')
    expect(one.json().error.code).toBe('refused')
    expect(other.json().error).toEqual(one.json().error)
    expect(await db.select().from(mails)).toEqual([])
  })

  it('refuses when the recipient inbox is full of player mail', async () => {
    await db.insert(mails).values(
      Array.from({ length: PLAYER_INBOX_CAP }, (_, i) => ({
        recipientId: sasuke.id,
        category: 'player' as const,
        subject: `s${i}`,
        body: 'b',
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    )
    // System mail and expired mail do not count.
    await db.transaction((tx) => sendSystemMail(tx, sasuke.id, 'other', 'notice'))
    const response = await send(naruto, 'Sasuke_01')
    expect(response.json().error.code).toBe('inbox_full')
    await db
      .update(mails)
      .set({ createdAt: new Date(Date.now() - 2_000), expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(mails.subject, 's0'))
    expect((await send(naruto, 'Sasuke_01')).statusCode).toBe(200)
  })

  it('limits mail per recipient and per sender per hour', async () => {
    for (let i = 0; i < MAIL_SEND_PER_RECIPIENT_PER_HOUR; i++) {
      expect((await send(naruto, 'Sasuke_01')).statusCode).toBe(200)
    }
    const tooMany = await send(naruto, 'Sasuke_01')
    expect(tooMany.statusCode).toBe(429)
    expect(tooMany.json().error.code).toBe('mail_rate_limited')

    const others = await Promise.all([1, 2, 3, 4].map((i) => ninja(`Other_0${i}`)))
    let sent = MAIL_SEND_PER_RECIPIENT_PER_HOUR
    for (const other of others) {
      while (sent < MAIL_SEND_PER_HOUR) {
        const response = await send(naruto, other.name)
        if (response.statusCode !== 200) break
        sent++
      }
    }
    expect(sent).toBe(MAIL_SEND_PER_HOUR)
    expect((await send(naruto, 'Other_04')).json().error.code).toBe('mail_rate_limited')
    // Mail older than an hour no longer counts.
    await db.update(mails).set({ createdAt: new Date(Date.now() - 3_601_000) })
    expect((await send(naruto, 'Other_04')).statusCode).toBe(200)
  })

  it('uses the original subject and body limits', () => {
    expect(mailConfig().PlayerMailMaxTitleWord).toBe(MAIL_SUBJECT_MAX)
    expect(mailConfig().PlayerMailMaxTextWord).toBe(MAIL_BODY_MAX)
  })
})

describe('deleting mail', () => {
  it('deletes by id only the owner mails', async () => {
    await send(naruto, 'Sasuke_01')
    const [mail] = (await inbox(sasuke)).mails
    const stolen = await post(naruto, 'mail/delete', { ids: [mail.id] })
    expect(stolen.json()).toEqual({ deleted: 0 })
    expect(await db.select().from(mails)).toHaveLength(1)
    expect((await post(sasuke, 'mail/read', { id: mail.id })).statusCode).toBe(200)
    expect((await post(naruto, 'mail/read', { id: mail.id })).statusCode).toBe(404)
    expect((await post(sasuke, 'mail/delete', { ids: [mail.id] })).json()).toEqual({ deleted: 1 })
  })

  it('deletes selected mails and all read mails of a category', async () => {
    await send(naruto, 'Sasuke_01', 'one')
    await send(naruto, 'Sasuke_01', 'two')
    await send(naruto, 'Sasuke_01', 'three')
    await db.transaction((tx) => sendSystemMail(tx, sasuke.id, 'other', 'notice'))
    const view = await inbox(sasuke)
    const [first, second] = view.mails as { id: string; subject: string }[]
    await post(sasuke, 'mail/read', { id: first!.id })
    await post(sasuke, 'mail/read', { id: second!.id })
    const other = (await inbox(sasuke, 'other')).mails[0]
    await post(sasuke, 'mail/read', { id: other.id })

    expect((await post(sasuke, 'mail/delete-read', { category: 'player' })).json()).toEqual({
      deleted: 2,
    })
    expect((await inbox(sasuke)).mails).toHaveLength(1)
    expect((await inbox(sasuke, 'other')).mails).toHaveLength(1)
    expect((await post(sasuke, 'mail/delete-read', {})).json()).toEqual({ deleted: 1 })
  })
})

describe('reporting mail', () => {
  it('stores one report per mail and reporter, and only for your own player mail', async () => {
    await send(naruto, 'Sasuke_01', 'Spam', 'Buy gold')
    const [mail] = (await inbox(sasuke)).mails
    expect((await post(naruto, 'mail/report', { id: mail.id })).statusCode).toBe(404)
    expect((await post(sasuke, 'mail/report', { id: mail.id })).statusCode).toBe(200)
    const again = await post(sasuke, 'mail/report', { id: mail.id })
    expect(again.statusCode).toBe(409)
    expect(await db.select().from(reports)).toEqual([
      expect.objectContaining({
        reporterId: sasuke.id,
        reportedId: naruto.id,
        kind: 'mail',
        mailId: mail.id,
        text: 'Spam\nBuy gold',
      }),
    ])
    await db.transaction((tx) => sendSystemMail(tx, sasuke.id, 'other', 'notice'))
    const system = (await inbox(sasuke, 'other')).mails[0]
    expect((await post(sasuke, 'mail/report', { id: system.id })).json().error.code).toBe(
      'not_reportable',
    )
  })
})

describe('mail expiry', () => {
  it('hides expired mail and purges player mail after 7 days and system mail after 30', async () => {
    await send(naruto, 'Sasuke_01')
    await db.transaction((tx) => sendSystemMail(tx, sasuke.id, 'other', 'notice'))
    const day = 86_400_000
    const at = (days: number, ms = 0) => new Date(Date.now() + days * day + ms)

    expect(await purgeExpiredMail(db, at(PLAYER_MAIL_DAYS, -60_000))).toBe(0)
    expect(await purgeExpiredMail(db, at(PLAYER_MAIL_DAYS, 60_000))).toBe(1)
    expect(await purgeExpiredMail(db, at(PLAYER_MAIL_DAYS, 60_000))).toBe(0)
    expect(await db.select({ category: mails.category }).from(mails)).toEqual([
      { category: 'other' },
    ])
    expect(await purgeExpiredMail(db, at(SYSTEM_MAIL_DAYS, -60_000))).toBe(0)
    expect(await purgeExpiredMail(db, at(SYSTEM_MAIL_DAYS, 60_000))).toBe(1)
    expect(await db.select().from(mails)).toEqual([])
  })

  it('never lists an expired mail even before the purge', async () => {
    await send(naruto, 'Sasuke_01')
    await db.update(mails).set({
      createdAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() - 1_000),
    })
    const view = await inbox(sasuke)
    expect(view.mails).toEqual([])
    expect(view.unread).toBe(0)
  })
})
