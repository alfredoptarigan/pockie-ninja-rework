import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { singleGate } from '../../db/schema.js'
import { errorCode, setUpNinja, today } from './test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(13)
  await ninja.set({ stone: 5000 })
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const post = (path: string, body?: object) =>
  ninja.client.post(`/api/game/gates/las-noches${path}`, body)
const gateRow = async () =>
  (await db.select().from(singleGate).where(eq(singleGate.characterId, ninja.characterId)))[0]
const setRun = (values: Partial<typeof singleGate.$inferInsert>) =>
  db.insert(singleGate).values({ characterId: ninja.characterId, ...values })

describe('Las Noches', () => {
  it('shows the entry options and today’s runs', async () => {
    const view = (await ninja.client.get('/api/game/gates/las-noches')).json()
    expect(view).toEqual({
      bestFloor: 0,
      runsLeft: 3,
      maxRuns: 3,
      options: { first: { floor: 1, stone: 1000 }, half: null },
      run: null,
    })
  })

  it('starts on floor 1 for 1000 Stone with one free life', async () => {
    const response = await post('/start', { mode: 'first' })
    expect(response.statusCode).toBe(200)
    expect(response.json().lasNoches.run).toMatchObject({
      floor: 1,
      pot: 0,
      lives: 1,
      nextNpcId: 'n900001',
      lifePrice: 6,
    })
    expect((await ninja.row()).stone).toBe(4000)
    expect(errorCode(await post('/start', { mode: 'first' }))).toBe('run_active')
  })

  it('starts at 50% of the best floor for its Stone price', async () => {
    await setRun({ bestFloor: 101 })
    const response = await post('/start', { mode: 'half' })
    expect(response.json().lasNoches.run.floor).toBe(50)
    expect((await ninja.row()).stone).toBe(5000 - 2324)
  })

  it.each([
    ['below level 13', () => ninja.set({ level: 12 }), 'too_low'],
    ['outside Demon City', () => ninja.set({ sceneId: 2601 }), 'not_here'],
    ['without Stone', () => ninja.set({ stone: 999 }), 'no_stone'],
    ['after three runs today', () => setRun({ runsDay: today(), runsToday: 3 }), 'daily_limit'],
  ])('refuses to start %s', async (_case, arrange, code) => {
    await arrange()
    expect(errorCode(await post('/start', { mode: 'first' }))).toBe(code)
  })

  it('refuses a 50% start without a best floor', async () => {
    expect(errorCode(await post('/start', { mode: 'half' }))).toBe('no_best_floor')
  })

  it('a loss with a life left uses it and refills HP', async () => {
    await setRun({ currentFloor: 170, potExp: 501, lives: 1 })
    await ninja.set({ hp: 5 })
    const body = (await post('/fight')).json()
    expect(body.won).toBe(false)
    expect(body.potPaid).toBeNull()
    expect(body.lasNoches.run).toMatchObject({ floor: 170, pot: 501, lives: 0 })
    expect(body.character.hp).toBe(body.character.maxHp)
  })

  it('a loss without lives halves the pot, pays it and ends the run', async () => {
    await setRun({ currentFloor: 170, potExp: 501, lives: 0, bestFloor: 3 })
    const body = (await post('/fight')).json()
    expect(body).toMatchObject({ won: false, potPaid: 250 })
    expect(body.lasNoches).toMatchObject({ run: null, runsLeft: 2, bestFloor: 3 })
    expect(await gateRow()).toMatchObject({ currentFloor: null, potExp: 0, runsToday: 1 })
  })

  it('buys a life for 6 + 2n Gold', async () => {
    await setRun({ currentFloor: 4, lives: 0, livesBought: 1 })
    await ninja.set({ gold: 8 })
    const response = await post('/buy-life')
    expect(response.json().lasNoches.run).toMatchObject({ lives: 1, livesBought: 2, lifePrice: 10 })
    expect((await ninja.row()).gold).toBe(0)
    expect(errorCode(await post('/buy-life'))).toBe('no_gold')
  })

  it('withdraw pays the pot and counts the run', async () => {
    await setRun({ currentFloor: 4, potExp: 120, lives: 1 })
    const before = await ninja.row()
    const body = (await post('/withdraw')).json()
    expect(body.potPaid).toBe(120)
    expect(body.lasNoches.run).toBeNull()
    const after = await ninja.row()
    expect(after.level > before.level || after.exp === before.exp + 120).toBe(true)
    expect(errorCode(await post('/withdraw'))).toBe('no_run')
  })
})
