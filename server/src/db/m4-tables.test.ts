import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../test/helpers.js'
import {
  arenaOpponents,
  arenaPlayers,
  blocks,
  characters,
  friends,
  inventoryItems,
  mails,
  marketListings,
  marketWarehouse,
  teamMembers,
  teamPrompts,
  teams,
  tollGateWeekly,
  users,
} from './schema.js'

const { db, close } = createTestDb()
afterAll(() => close())

const HOUR_MS = 3_600_000
const later = (hours = 8) => new Date(Date.now() + hours * HOUR_MS)

let userCount = 0
async function character() {
  const username = `Ninja_${++userCount}`
  const [user] = await db
    .insert(users)
    .values({ username, email: `${username.toLowerCase()}@example.com`, passwordHash: 'x' })
    .returning()
  const [row] = await db
    .insert(characters)
    .values({
      userId: user!.id,
      name: username,
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

async function item(characterId: string, values: Partial<typeof inventoryItems.$inferInsert> = {}) {
  const [row] = await db
    .insert(inventoryItems)
    .values({ characterId, itemId: 'i250101', ...values })
    .returning()
  return row!
}

let a = ''
let b = ''

beforeEach(async () => {
  await truncateAll(db)
  a = await character()
  b = await character()
})

describe('social', () => {
  it('stores one-sided friends with a pending add-back prompt, never yourself', async () => {
    const [row] = await db.insert(friends).values({ ownerId: a, friendId: b }).returning()
    expect(row).toMatchObject({ homeFriend: false, addBackPending: true })
    await expect(db.insert(friends).values({ ownerId: a, friendId: b })).rejects.toThrow()
    await expect(db.insert(friends).values({ ownerId: a, friendId: a })).rejects.toThrow()
    await expect(db.insert(blocks).values({ ownerId: b, blockedId: b })).rejects.toThrow()
  })

  it('requires subject and body on player mail and a template on system mail', async () => {
    const base = { recipientId: a, expiresAt: later(168) }
    await db
      .insert(mails)
      .values({ ...base, senderId: b, category: 'player', subject: 'Hi', body: 'Team up?' })
    await expect(
      db.insert(mails).values({ ...base, senderId: b, category: 'player', subject: 'Hi' }),
    ).rejects.toThrow()
    await expect(
      db.insert(mails).values({ ...base, category: 'market', subject: 'Sold', body: 'x' }),
    ).rejects.toThrow()
    await expect(
      db
        .insert(mails)
        .values({ ...base, senderId: b, category: 'arena', templateKey: 'k', params: {} }),
    ).rejects.toThrow()
    await expect(
      db.insert(mails).values({
        ...base,
        senderId: b,
        category: 'player',
        subject: 'x'.repeat(21),
        body: 'x',
      }),
    ).rejects.toThrow()
  })

  it('keeps player mail when the sender is deleted', async () => {
    await db.insert(mails).values({
      recipientId: a,
      senderId: b,
      category: 'player',
      subject: 'Hi',
      body: 'x',
      expiresAt: later(),
    })
    await db.delete(characters).where(eq(characters.id, b))
    const [mail] = await db.select().from(mails)
    expect(mail).toMatchObject({ senderId: null, subject: 'Hi' })
  })
})

describe('teams', () => {
  it('allows one team per ninja and one pending prompt per sender and target', async () => {
    const [team] = await db.insert(teams).values({ captainId: a, sceneId: 2601 }).returning()
    await db.insert(teamMembers).values({ characterId: a, teamId: team!.id, fightOrder: 0 })
    await expect(
      db.insert(teamMembers).values({ characterId: a, teamId: team!.id, fightOrder: 1 }),
    ).rejects.toThrow()

    const prompt = { kind: 'invite' as const, fromId: a, toId: b, expiresAt: later() }
    await db.insert(teamPrompts).values(prompt)
    await expect(db.insert(teamPrompts).values(prompt)).rejects.toThrow()
    await expect(
      db.insert(teamPrompts).values({ ...prompt, kind: 'apply', fromId: b, toId: a }),
    ).rejects.toThrow() // an application names the team

    await db.delete(teams).where(eq(teams.id, team!.id))
    expect(await db.select().from(teamMembers)).toEqual([])
  })
})

describe('market', () => {
  it('keeps a listed item out of the bag and never equipped', async () => {
    const row = await item(a, { location: 'market' })
    expect(row.location).toBe('market')
    expect((await item(a)).location).toBe('bag')
    await expect(item(a, { location: 'warehouse', equippedSlot: 'Weapon' })).rejects.toThrow()
  })

  it('checks prices, duration and one listing per item', async () => {
    const row = await item(a, { location: 'market' })
    const listing = {
      sellerId: a,
      inventoryItemId: row.id,
      category: '0_0_7_1',
      hours: 8,
      fee: 260,
      expiresAt: later(),
    }
    await expect(db.insert(marketListings).values(listing)).rejects.toThrow() // no price
    await expect(
      db.insert(marketListings).values({ ...listing, priceStone: 1_000_001 }),
    ).rejects.toThrow()
    await expect(
      db.insert(marketListings).values({ ...listing, priceGold: 5, hours: 10 }),
    ).rejects.toThrow()
    await db.insert(marketListings).values({ ...listing, priceStone: 500, priceGold: 5 })
    await expect(
      db.insert(marketListings).values({ ...listing, priceStone: 600 }),
    ).rejects.toThrow()
  })

  it('refuses a negative wallet and drops a warehouse row with its item', async () => {
    await expect(
      db.update(characters).set({ marketStone: -1 }).where(eq(characters.id, a)),
    ).rejects.toThrow()
    const row = await item(b, { location: 'warehouse' })
    await db.insert(marketWarehouse).values({ inventoryItemId: row.id, ownerId: b, source: 0 })
    await db.delete(inventoryItems).where(eq(inventoryItems.id, row.id))
    expect(await db.select().from(marketWarehouse)).toEqual([])
  })
})

describe('arena and rankings', () => {
  it('starts a ninja at tier 0 with the initial score', async () => {
    const [row] = await db.insert(arenaPlayers).values({ characterId: a }).returning()
    expect(row).toMatchObject({ tier: 0, score: 93500, streak: 0, fights: 0, wins: 0 })
    await expect(db.insert(arenaPlayers).values({ characterId: b, tier: 22 })).rejects.toThrow()
  })

  it('stores one opponent per slot matching its kind', async () => {
    await db.insert(arenaOpponents).values([
      { characterId: a, slot: 0, kind: 'npc', npcId: 'n401001' },
      { characterId: a, slot: 1, kind: 'player', opponentId: b },
      { characterId: a, slot: 2, kind: 'referee', refereePlace: -3 },
    ])
    await expect(
      db.insert(arenaOpponents).values({ characterId: a, slot: 3, kind: 'player' }),
    ).rejects.toThrow()
    await expect(
      db.insert(arenaOpponents).values({ characterId: a, slot: 18, kind: 'npc', npcId: 'n1' }),
    ).rejects.toThrow()
  })

  it('keeps one weekly toll gate entry per ninja, gate and week', async () => {
    const entry = { gateId: 100001, week: '2026-10-12', characterId: a, schedule: 60 }
    await db.insert(tollGateWeekly).values(entry)
    await expect(db.insert(tollGateWeekly).values(entry)).rejects.toThrow()
    await expect(
      db.insert(tollGateWeekly).values({ ...entry, characterId: b, schedule: 101 }),
    ).rejects.toThrow()
  })
})
