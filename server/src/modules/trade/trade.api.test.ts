import type { Notice } from '@pockie/shared'
import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, Client, createTestDb, truncateAll } from '../../../test/helpers.js'
import { blocks, characters, inventoryItems, tradeLogs, users } from '../../db/schema.js'
import { createSession } from '../auth/sessions.js'
import { presence } from '../realtime/events.js'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const FOOD = 'i120001' // CanTrade 2, stacks to 20, 1 cell
const GEAR = 'i210101' // equipment, CanTrade 3, 1 cell
const NPC_ONLY = 'i150259' // CanTrade 1
const QUEST = 'i141002' // TaskItem with CanTrade 2

const { db, close } = createTestDb()
let app: ReturnType<typeof buildTestApp>
let notices: [string, Notice][] = []
let offNotice: () => void
const online: string[] = []

beforeEach(async () => {
  await truncateAll(db)
  app = buildTestApp(db)
  notices = []
  offNotice = presence.onNotice((id, notice) => notices.push([id, notice]))
})
afterEach(async () => {
  offNotice()
  for (const id of online.splice(0)) presence.offline(id)
  await app.close()
})
afterAll(() => close())

let serial = 0
async function ninja({ level = 30, stone = 0, gold = 0, giftCoupon = 0, isOnline = true } = {}) {
  const n = ++serial
  const client = new Client(app)
  const [user] = await db
    .insert(users)
    .values({ username: `Trader_${n}`, email: `trader${n}@example.com`, passwordHash: 'x' })
    .returning()
  client.setCookie('pn_session', await createSession(db, user!.id, false))
  const name = `Trader_${String(n).padStart(3, '0')}`
  const created = await client.post('/api/game/characters', {
    name,
    gender: 0,
    clothing: 3,
    nation: 0,
  })
  const id: string = created.json().character.id
  await db.update(characters).set({ level, stone, gold, giftCoupon }).where(eq(characters.id, id))
  if (isOnline) {
    presence.online(id)
    online.push(id)
  }
  const post = (path: string, body: object = {}) => client.post(`/api/game/trade/${path}`, body)
  const state = async () => (await client.get('/api/game/trade')).json()
  const give = async (itemId: string, values: Partial<typeof inventoryItems.$inferInsert> = {}) => {
    const [row] = await db
      .insert(inventoryItems)
      .values({ characterId: id, itemId, ...values })
      .returning()
    return row!.id
  }
  const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
  return { client, id, name, post, state, give, row }
}
type Ninja = Awaited<ReturnType<typeof ninja>>

const code = (response: { json: () => { error?: { code: string } } }) => response.json().error?.code
const ownerOf = async (itemId: string) =>
  (await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)))[0]?.characterId

/** `a` asks `b`, who accepts; returns the open trade. */
async function open(a: Ninja, b: Ninja) {
  const asked = await a.post('request', { characterId: b.id })
  expect(asked.statusCode).toBe(200)
  const [request] = (await b.state()).incoming
  const accepted = await b.post('accept', { requestId: request.id })
  expect(accepted.statusCode).toBe(200)
  return accepted.json().trade
}

/** Both ready on the current version; returns that version. */
async function readyBoth(a: Ninja, b: Ninja) {
  const { version } = (await a.state()).trade
  expect((await a.post('ready', { ready: true, version })).statusCode).toBe(200)
  expect((await b.post('ready', { ready: true, version })).statusCode).toBe(200)
  return version as number
}

describe('a trade from request to swap', () => {
  it('swaps an item for Stone, keeps the 10% fee and logs it', async () => {
    const a = await ninja()
    const b = await ninja({ stone: 10_000 })
    const blade = await a.give(GEAR, { enhanceLevel: 3 })

    const asked = await a.post('request', { characterId: b.id })
    expect(asked.json().outgoing).toMatchObject({ to: { characterId: b.id, name: b.name } })
    const [request] = (await b.state()).incoming
    expect(request.from).toEqual({ characterId: a.id, name: a.name, level: 30 })
    expect(notices).toContainEqual([b.id, { kind: 'trade', message: `${a.name} wants to trade.` }])

    const opened = (await b.post('accept', { requestId: request.id })).json()
    expect(opened.trade.me.characterId).toBe(b.id)
    expect(opened.trade.partner.characterId).toBe(a.id)
    expect((await a.state()).outgoing).toBeNull()

    expect((await a.post('items/add', { inventoryId: blade })).statusCode).toBe(200)
    expect(
      (await b.post('currency', { currency: 'stone', amount: 5_000 })).json().trade.me.currency,
    ).toEqual({ stone: 5_000, gold: 0, giftCoupon: 0 })
    const seen = (await b.state()).trade
    expect(seen.partner.items).toEqual([
      expect.objectContaining({ inventoryId: blade, itemId: GEAR, enhanceLevel: 3 }),
    ])

    const version = await readyBoth(a, b)
    const first = await a.post('confirm', { version })
    expect(first.json().trade.me.confirmed).toBe(true)
    const done = await b.post('confirm', { version })
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ trade: null, completed: true })
    expect(done.json().character.stone).toBe(5_000)

    expect(await ownerOf(blade)).toBe(b.id)
    expect((await a.row()).stone).toBe(4_500)
    expect((await b.row()).stone).toBe(5_000)
    const [log] = await db.select().from(tradeLogs)
    expect(log).toMatchObject({ initiatorId: a.id, partnerId: b.id })
    expect(log!.initiatorOffer.items).toEqual([{ inventoryId: blade, itemId: GEAR, count: 1 }])
    expect(log!.partnerOffer.fee).toEqual({ stone: 500, gold: 0, giftCoupon: 0 })
    expect(notices).toContainEqual([
      a.id,
      { kind: 'trade', done: true, message: 'Trade completed.' },
    ])
    expect((await a.state()).trade).toBeNull()
  })

  it('declines, withdraws and cancels, telling the other player', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await a.post('request', { characterId: b.id })
    const [request] = (await b.state()).incoming
    expect((await b.post('decline', { requestId: request.id })).json().incoming).toEqual([])
    expect(notices).toContainEqual([
      a.id,
      { kind: 'trade', message: `${b.name} declined your trade request.` },
    ])
    expect((await a.state()).outgoing).toBeNull()

    await a.post('request', { characterId: b.id })
    expect((await a.post('cancel-request')).json().outgoing).toBeNull()
    expect((await b.state()).incoming).toEqual([])

    await open(a, b)
    expect((await b.post('cancel')).json().trade).toBeNull()
    expect((await a.state()).trade).toBeNull()
    expect(notices).toContainEqual([
      a.id,
      { kind: 'trade', message: `${b.name} cancelled the trade.` },
    ])
  })

  it('ends the trade when a player goes offline', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await open(a, b)
    presence.offline(b.id)
    expect((await a.state()).trade).toBeNull()
    expect(notices).toContainEqual([
      a.id,
      { kind: 'trade', message: 'Your trade partner went offline. The trade ended.' },
    ])
  })
})

describe('who can trade', () => {
  it('refuses yourself, low levels, offline, blocked and busy players', async () => {
    const a = await ninja()
    const low = await ninja({ level: 29 })
    const away = await ninja({ isOnline: false })
    const blocker = await ninja()
    const b = await ninja()
    const c = await ninja()
    await db.insert(blocks).values({ ownerId: blocker.id, blockedId: a.id })

    expect(code(await a.post('request', { characterId: a.id }))).toBe('self')
    expect(code(await a.post('request', { characterId: low.id }))).toBe('trade_level')
    expect(code(await low.post('request', { characterId: a.id }))).toBe('trade_level')
    expect(code(await a.post('request', { characterId: away.id }))).toBe('target_offline')
    expect(code(await a.post('request', { characterId: blocker.id }))).toBe('blocked')

    expect((await a.post('request', { characterId: b.id })).statusCode).toBe(200)
    expect(code(await a.post('request', { characterId: c.id }))).toBe('pending')
    await a.post('cancel-request')
    await open(a, b)
    expect(code(await c.post('request', { characterId: a.id }))).toBe('busy')
    expect(code(await a.post('request', { characterId: c.id }))).toBe('busy')
  })

  it('drops a request after its 60 seconds', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await a.post('request', { characterId: b.id })
    const [request] = (await b.state()).incoming
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] })
    try {
      expect(code(await b.post('accept', { requestId: request.id }))).toBe('request_gone')
      expect((await a.state()).outgoing).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('what can be offered', () => {
  it('refuses bound, locked, worn, untradable, quest and foreign items', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await open(a, b)
    const add = async (values: Partial<typeof inventoryItems.$inferInsert>, itemId = GEAR) =>
      code(await a.post('items/add', { inventoryId: await a.give(itemId, values) }))
    expect(await add({ bound: true })).toBe('bound')
    expect(await add({ locked: true })).toBe('locked')
    expect(await add({ equippedSlot: 'Weapon' })).toBe('equipped')
    expect(await add({ location: 'warehouse' })).toBe('not_in_bag')
    expect(await add({}, NPC_ONLY)).toBe('not_tradable')
    expect(await add({}, QUEST)).toBe('not_tradable')
    const theirs = await b.give(GEAR)
    expect(code(await a.post('items/add', { inventoryId: theirs }))).toBe('no_item')
    expect(code(await a.post('currency', { currency: 'gold', amount: 1 }))).toBe('no_currency')
    expect((await a.state()).trade.me.items).toEqual([])
  })

  it('caps an offer at 36 items and offers an item once', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await open(a, b)
    const ids = await Promise.all(Array.from({ length: 37 }, () => a.give(FOOD)))
    for (const inventoryId of ids.slice(0, 36))
      expect((await a.post('items/add', { inventoryId })).statusCode).toBe(200)
    expect(code(await a.post('items/add', { inventoryId: ids[0] }))).toBe('offered')
    expect(code(await a.post('items/add', { inventoryId: ids[36] }))).toBe('trade_full')
  })
})

describe('lock and confirm', () => {
  it('any change takes back both ready and confirm, and stale versions are refused', async () => {
    const a = await ninja({ stone: 100 })
    const b = await ninja()
    await open(a, b)
    const version = await readyBoth(a, b)
    expect((await a.post('confirm', { version })).statusCode).toBe(200)

    const changed = (await a.post('currency', { currency: 'stone', amount: 50 })).json().trade
    expect(changed.version).toBe(version + 1)
    expect([changed.me.ready, changed.me.confirmed, changed.partner.ready]).toEqual([
      false,
      false,
      false,
    ])
    expect(code(await b.post('ready', { ready: true, version }))).toBe('trade_changed')
    expect(code(await b.post('confirm', { version: version + 1 }))).toBe('not_ready')
  })

  it('un-readying takes back both confirmations', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await open(a, b)
    const version = await readyBoth(a, b)
    await a.post('confirm', { version })
    const back = (await b.post('ready', { ready: false, version })).json().trade
    expect([back.me.ready, back.partner.ready, back.partner.confirmed]).toEqual([
      false,
      true,
      false,
    ])
  })
})

describe('the swap re-checks everything', () => {
  it('drops an item that changed after it was offered and moves nothing', async () => {
    const [a, b] = [await ninja(), await ninja({ stone: 1_000 })]
    await open(a, b)
    const food = await a.give(FOOD, { count: 5 })
    await a.post('items/add', { inventoryId: food })
    await b.post('currency', { currency: 'stone', amount: 1_000 })
    const version = await readyBoth(a, b)
    await a.post('confirm', { version })
    await db.update(inventoryItems).set({ count: 4 }).where(eq(inventoryItems.id, food))

    const failed = await b.post('confirm', { version })
    expect(failed.statusCode).toBe(409)
    expect(code(failed)).toBe('trade_changed')
    expect(await ownerOf(food)).toBe(a.id)
    expect((await b.row()).stone).toBe(1_000)
    const trade = (await a.state()).trade
    expect(trade.me.items).toEqual([])
    expect([trade.me.ready, trade.partner.ready, trade.version]).toEqual([
      false,
      false,
      version + 1,
    ])
  })

  it('refuses a full bag, a spent balance and the currency cap', async () => {
    const a = await ninja({ stone: 1_000 })
    const b = await ninja()
    await open(a, b)
    const gift = await b.give(GEAR)
    await b.post('items/add', { inventoryId: gift })
    await a.post('currency', { currency: 'stone', amount: 1_000 })
    // Fill a's bag: 120 cells.
    await db
      .insert(inventoryItems)
      .values(Array.from({ length: 120 }, () => ({ characterId: a.id, itemId: GEAR })))
    const settle = async () => {
      const version = await readyBoth(a, b)
      await a.post('confirm', { version })
      return b.post('confirm', { version })
    }
    const full = await settle()
    expect(code(full)).toBe('bag_full')
    expect(full.json().error.message).toBe(`${a.name}'s bag is full.`)

    await db.delete(inventoryItems).where(eq(inventoryItems.characterId, a.id))
    await db.update(characters).set({ stone: 10 }).where(eq(characters.id, a.id))
    expect(code(await settle())).toBe('no_currency')

    await db.update(characters).set({ stone: 1_000 }).where(eq(characters.id, a.id))
    await db.update(characters).set({ stone: 100_000_000 }).where(eq(characters.id, b.id))
    expect(code(await settle())).toBe('currency_cap')
    expect(await ownerOf(gift)).toBe(b.id)
    expect(await db.select().from(tradeLogs)).toEqual([])
  })
})

describe('concurrency', () => {
  it('both confirming at once swaps exactly once', async () => {
    const a = await ninja()
    const b = await ninja({ stone: 2_000 })
    await open(a, b)
    const items = [await a.give(GEAR), await a.give(FOOD, { count: 3 })]
    for (const inventoryId of items) await a.post('items/add', { inventoryId })
    await b.post('currency', { currency: 'stone', amount: 2_000 })
    const version = await readyBoth(a, b)

    const answers = await Promise.all([
      a.post('confirm', { version }),
      b.post('confirm', { version }),
    ])
    expect(answers.map((r) => r.statusCode)).toEqual([200, 200])
    expect(answers.filter((r) => r.json().completed)).toHaveLength(1)
    const owners = await db
      .select({ owner: inventoryItems.characterId })
      .from(inventoryItems)
      .where(inArray(inventoryItems.id, items))
    expect(owners).toEqual([{ owner: b.id }, { owner: b.id }])
    expect([(await a.row()).stone, (await b.row()).stone]).toEqual([1_800, 0])
    expect(await db.select().from(tradeLogs)).toHaveLength(1)
  })

  it('a change racing the last confirm either lands before it or is refused', async () => {
    const a = await ninja()
    const b = await ninja({ stone: 500 })
    await open(a, b)
    const offered = await a.give(GEAR)
    const late = await a.give(GEAR)
    await a.post('items/add', { inventoryId: offered })
    await b.post('currency', { currency: 'stone', amount: 500 })
    const version = await readyBoth(a, b)
    await a.post('confirm', { version })

    const [confirm, change] = await Promise.all([
      b.post('confirm', { version }),
      a.post('items/add', { inventoryId: late }),
    ])
    // The late item never moves; the offered one moved only if the confirm won.
    expect(await ownerOf(late)).toBe(a.id)
    if (confirm.json().completed) {
      expect(['trade_busy', 'no_trade']).toContain(code(change))
      expect(await ownerOf(offered)).toBe(b.id)
      expect((await a.row()).stone).toBe(450)
    } else {
      expect(change.statusCode).toBe(200)
      expect(code(confirm)).toBe('trade_changed')
      expect(await ownerOf(offered)).toBe(a.id)
      expect((await b.row()).stone).toBe(500)
    }
  })

  it('an item edited while the swap waits for its row lock fails the swap', async () => {
    const [a, b] = [await ninja(), await ninja()]
    await open(a, b)
    const food = await a.give(FOOD, { count: 5 })
    await a.post('items/add', { inventoryId: food })
    const version = await readyBoth(a, b)
    await a.post('confirm', { version })

    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let locked!: () => void
    const isLocked = new Promise<void>((resolve) => (locked = resolve))
    // Another action holds the item row, splits it and commits while the swap waits.
    const other = db.transaction(async (tx) => {
      await tx.execute(sql`select id from inventory_items where id = ${food} for update`)
      locked()
      await released
      await tx.update(inventoryItems).set({ count: 2 }).where(eq(inventoryItems.id, food))
    })
    await isLocked
    const confirm = b.post('confirm', { version })
    await new Promise((resolve) => setTimeout(resolve, 200))
    release()
    await other

    expect(code(await confirm)).toBe('trade_changed')
    expect(await ownerOf(food)).toBe(a.id)
    expect(await db.select().from(tradeLogs)).toEqual([])
  })
})
