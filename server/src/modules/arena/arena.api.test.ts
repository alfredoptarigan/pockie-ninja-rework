import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import {
  arenaOpponents,
  arenaRevenges,
  characterPets,
  inventoryItems,
  mails,
} from '../../db/schema.js'
import { adoptPetItem } from '../pets/kennel.js'
import { addLog } from './store.js'
import { refreshArenaSnapshot } from './snapshot.js'
import { arenaTestApp, errorCode, today, yesterday, type Ninja } from './test-setup.js'

// Each test registers two or three ninjas (argon2), slow on a loaded machine.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const { db, close } = createTestDb()
let setup: ReturnType<typeof arenaTestApp>
let a: Ninja

beforeEach(async () => {
  await truncateAll(db)
  setup = arenaTestApp(db)
  a = await setup.ninja('Attacker')
})
afterEach(() => setup.app.close())
afterAll(() => close())

const fight = (ninja: Ninja, slot = 0) => ninja.client.post('/api/game/arena/fight', { slot })

/** Two tier 2 ninjas at 100000; `slot` 0 of the attacker points at the (weakened) defender. */
async function playerPair() {
  const d = await setup.ninja('Defender')
  await a.join({ tier: 2, score: 100000 })
  await d.join({ tier: 2, score: 100000 })
  await d.weaken()
  await setup.aim(a, 0, d)
  return d
}

describe('joining', () => {
  it('the first look joins at initscore with a snapshot and 18 tier 0 NPCs', async () => {
    const response = await a.client.get('/api/game/arena')
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(view).toMatchObject({
      tier: 0,
      score: 93500,
      place: null,
      freeTriesLeft: 20,
      tryGold: 0,
      freeRefreshAt: null,
      bossReady: false,
      bossNpcId: 'n310019',
    })
    expect(view.slots).toHaveLength(18)
    expect(view.slots.every((s: { kind: string }) => s.kind === 'npc')).toBe(true)
    const row = await a.arena()
    expect(row.snapshot).toMatchObject({ fighter: { name: 'Attacker' }, look: { clothing: 3 } })
  })
})

describe('tries and Gold', () => {
  it('after 20 free tries a fight costs 8 Gold; no Gold refuses before a try is used', async () => {
    await a.join({ day: today(), triesUsed: 20 })
    await a.set({ gold: 7 })
    expect(errorCode(await fight(a))).toBe('no_gold')
    expect(await a.arena()).toMatchObject({ triesUsed: 20, triesBought: 0 })
    await a.set({ gold: 8 })
    const response = await fight(a)
    expect(response.statusCode).toBe(200)
    expect(response.json().arena).toMatchObject({ triesBought: 1, tryGold: 8 })
    expect((await a.row()).gold).toBe(0)
  })

  it('at most 15 tries are bought a day; a new UTC day resets every counter', async () => {
    await a.join({ day: today(), triesUsed: 20, triesBought: 15 })
    await a.set({ gold: 100 })
    expect(errorCode(await fight(a))).toBe('no_tries')
    await a.setArena({ day: yesterday(), duelsUsed: 10 })
    const response = await fight(a)
    expect(response.statusCode).toBe(200)
    expect(await a.arena()).toMatchObject({
      day: today(),
      triesUsed: 1,
      triesBought: 0,
      duelsUsed: 0,
    })
    expect((await a.row()).gold).toBe(100)
  })

  it('a beaten slot is refused before anything is charged', async () => {
    await a.join()
    await db.update(arenaOpponents).set({ beaten: true }).where(eq(arenaOpponents.slot, 3))
    expect(errorCode(await fight(a, 3))).toBe('beaten')
    expect((await a.arena()).triesUsed).toBe(0)
  })

  it('refresh: one free per hour, then 20 Gold', async () => {
    await a.join()
    const first = await a.client.post('/api/game/arena/refresh')
    expect(first.statusCode).toBe(200)
    expect(first.json().arena.freeRefreshAt).not.toBeNull()
    expect(errorCode(await a.client.post('/api/game/arena/refresh'))).toBe('no_gold')
    await a.set({ gold: 25 })
    await db.update(arenaOpponents).set({ beaten: true })
    const paid = await a.client.post('/api/game/arena/refresh')
    expect(paid.statusCode).toBe(200)
    expect((await a.row()).gold).toBe(5)
    expect(paid.json().arena.slots.some((s: { beaten: boolean }) => s.beaten)).toBe(false)
    await a.setArena({ freeRefreshAt: new Date(Date.now() - 3_600_000) })
    expect((await a.client.post('/api/game/arena/refresh')).statusCode).toBe(200)
    expect((await a.row()).gold).toBe(5)
  })
})

describe('a fight against a ninja', () => {
  it('moves Elo zero-sum, pays the tier Honor, logs both sides and mails the defender', async () => {
    const d = await playerPair()
    const response = await fight(a)
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({ won: true, scoreDelta: 1000, honor: 10 })
    expect(body.looks).toEqual([{ clothing: 3 }, { clothing: 3 }])
    expect(body.arena.slots[0]).toMatchObject({ beaten: true, kind: 'player', name: 'Defender' })
    expect(await a.arena()).toMatchObject({ score: 101000, streak: 1, fights: 1, wins: 1 })
    expect(await d.arena()).toMatchObject({ score: 99000, streak: 0, fights: 1, wins: 0 })
    expect((await a.row()).honor).toBe(10)
    expect((await d.row()).honor).toBe(0)
    expect(await a.logs()).toMatchObject([{ kind: 'attack', result: 1, scoreDelta: 1000 }])
    expect(await d.logs()).toMatchObject([{ kind: 'defense', result: 0, scoreDelta: -1000 }])
    const [mail] = await db.select().from(mails).where(eq(mails.recipientId, d.id))
    expect(mail).toMatchObject({
      category: 'arena',
      templateKey: 'arena_defense_lost',
      params: { attacker: 'Attacker', score: -1000 },
    })
    expect(errorCode(await fight(a))).toBe('beaten')

    const [log] = (await a.client.get('/api/game/arena/logs')).json().logs
    const replay = (await a.client.get(`/api/game/arena/logs/${log.id}`)).json()
    expect(replay.replay.winner).toBe('attackers')
    expect(errorCode(await d.client.get(`/api/game/arena/logs/${log.id}`))).toBe('no_log')
  })

  it('two attackers on one defender at once queue up and keep the scores consistent', async () => {
    const d = await playerPair()
    const c = await setup.ninja('Third')
    await c.join({ tier: 2, score: 100000 })
    await setup.aim(c, 0, d)
    const [first, second] = await Promise.all([fight(a), fight(c)])
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const deltas = [first.json().scoreDelta, second.json().scoreDelta]
    const total = (await a.arena()).score + (await c.arena()).score + (await d.arena()).score
    expect(total).toBe(300000)
    expect((await d.arena()).score).toBe(100000 - deltas[0] - deltas[1])
    expect(await d.arena()).toMatchObject({ fights: 2 })
    expect(await d.logs()).toHaveLength(2)
    // The second fight saw the first one's result: beating a 99000 defender gains less.
    expect(deltas.sort((x, y) => y - x)).toEqual([1000, 988])
  })

  it('keeps the last 15 arena logs', async () => {
    await a.join()
    await db.transaction(async (tx) => {
      for (let i = 0; i < 16; i++)
        await addLog(tx, {
          characterId: a.id,
          kind: 'attack',
          opponentName: `n${i}`,
          result: 1,
          replay: {},
        })
    })
    expect(await a.logs()).toHaveLength(15)
  })
})

describe('the active pet', () => {
  it('gets no EXP from an arena win (M6 decision 12)', async () => {
    const [egg] = await db
      .insert(inventoryItems)
      .values({ characterId: a.id, itemId: 'i320002', bound: true })
      .returning()
    await db.transaction(async (tx) => adoptPetItem(tx, await a.row(), egg!))
    await db.update(characterPets).set({ active: true }).where(eq(characterPets.characterId, a.id))
    await playerPair()
    expect((await fight(a)).json().won).toBe(true)
    const [pet] = await db.select().from(characterPets).where(eq(characterPets.characterId, a.id))
    expect(pet).toMatchObject({ exp: 0, level: 1 })
  })
})

describe('promotion', () => {
  it('the boss is locked below the tier end score', async () => {
    await a.join({ tier: 1, score: 99899 })
    expect(errorCode(await a.client.post('/api/game/arena/boss'))).toBe('boss_locked')
  })

  it('a boss win promotes, pays the new tier Honor, caps the score and lists tier 2 rivals', async () => {
    await a.join({ tier: 1, score: 150000 })
    await a.set({ level: 90 })
    // Bare hands deal 1 damage and lose on the 60 action cap; fists win.
    await db
      .insert(inventoryItems)
      .values({ characterId: a.id, itemId: 'i260100', equippedSlot: 'Weapon' })
    let body
    for (let i = 0; i < 10 && !body?.won; i++) {
      const response = await a.client.post('/api/game/arena/boss')
      expect(response.statusCode).toBe(200)
      body = response.json()
    }
    expect(body).toMatchObject({ won: true, promotedTo: 2, honor: 1200 })
    expect(body.looks[1]).toEqual({ npcId: 'n310029' })
    expect(await a.arena()).toMatchObject({ tier: 2, score: 110000 })
    expect((await a.row()).honor).toBe(1200)
    // Alone in the list: row A has no places, B and C are Referees and NPC fill.
    expect(body.arena.place).toBe(0)
    const kinds = body.arena.slots.map((s: { kind: string }) => s.kind)
    expect(kinds.slice(6, 12)).toEqual(Array(6).fill('referee'))
    expect(kinds.slice(0, 6)).toEqual(Array(6).fill('npc'))
  })
})

describe('revenge', () => {
  it('free the first time a day, then 10 Gold per revenge already used; +1 Honor', async () => {
    const d = await playerPair()
    // The defender beats the attacker first, so the attacker has a lost defence.
    await a.weaken()
    await setup.aim(d, 0, a)
    expect((await fight(d)).json().won).toBe(true)
    const [lost] = await a.logs()
    expect(lost).toMatchObject({ kind: 'defense', result: 0 })
    await d.weaken()

    const first = await a.client.post('/api/game/arena/revenge', { logId: lost!.id })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ won: true, honor: 11 })
    expect((await a.row()).gold).toBe(0)
    expect(await db.select().from(arenaRevenges)).toMatchObject([{ used: 1, day: today() }])

    expect(errorCode(await a.client.post('/api/game/arena/revenge', { logId: lost!.id }))).toBe(
      'no_gold',
    )
    await a.set({ gold: 10 })
    expect((await a.client.post('/api/game/arena/revenge', { logId: lost!.id })).statusCode).toBe(
      200,
    )
    expect((await a.row()).gold).toBe(0)
    expect((await a.arena()).triesUsed).toBe(2)
  })

  it('refuses anything but a lost defence before charging anything', async () => {
    const d = await playerPair()
    await fight(a)
    const [attack] = await a.logs()
    const [defence] = await d.logs()
    expect(errorCode(await a.client.post('/api/game/arena/revenge', { logId: attack!.id }))).toBe(
      'cannot_revenge',
    )
    // Another ninja's log is not yours to use.
    expect(errorCode(await a.client.post('/api/game/arena/revenge', { logId: defence!.id }))).toBe(
      'cannot_revenge',
    )
    expect((await a.arena()).triesUsed).toBe(1)
  })
})

describe('the defence snapshot', () => {
  it('refreshArenaSnapshot rebuilds it after an equip', async () => {
    await a.join()
    const before = (await a.arena()).snapshot as { fighter: { maxAttack: number } }
    const [fists] = await db
      .insert(inventoryItems)
      .values({ characterId: a.id, itemId: 'i260100' })
      .returning()
    expect((await a.client.post(`/api/game/items/${fists!.id}/equip`)).statusCode).toBe(200)
    // The coordinator calls this from the equip route (decision 9).
    await db.transaction((tx) => refreshArenaSnapshot(tx, a.id))
    const after = (await a.arena()).snapshot as {
      fighter: { maxAttack: number }
      look: { weaponItemId?: string }
    }
    expect(after.fighter.maxAttack).toBeGreaterThan(before.fighter.maxAttack)
    expect(after.look.weaponItemId).toBe('i260100')
  })

  it('is a no-op for a ninja who never opened the arena', async () => {
    await db.transaction((tx) => refreshArenaSnapshot(tx, a.id))
    expect(await a.arena()).toBeUndefined()
  })
})
