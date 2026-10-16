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
    expect(view).toMatchObject({
      bestFloor: 0,
      runsLeft: 3,
      maxRuns: 3,
      options: { first: { floor: 1, stone: 1000 }, half: null },
      run: null,
      preview: {
        npcId: 'n900001',
        nameKey: 'lg_name_n900001',
        hp: 124,
        minAttack: 20,
        maxAttack: 25,
        exp: 355,
        skills: [],
      },
    })
  })

  it('starts on floor 1 for 1000 Stone with two lives', async () => {
    const response = await post('/start', { mode: 'first' })
    expect(response.statusCode).toBe(200)
    expect(response.json().lasNoches.run).toMatchObject({
      floor: 1,
      pot: 0,
      lives: 2,
      nextNpcId: 'n900001',
      lifePrice: 6,
    })
    expect((await gateRow())!.mode).toBe(2)
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
    await setRun({ currentFloor: 170, potExp: 501, lives: 2 })
    await ninja.set({ hp: 5 })
    const body = (await post('/fight')).json()
    expect(body.won).toBe(false)
    expect(body.potPaid).toBeNull()
    expect(body.lasNoches.run).toMatchObject({ floor: 170, pot: 250, lives: 1 })
    expect(body.character.hp).toBe(body.character.maxHp)
  })

  it('the final loss wipes the bank, blocks fighting and waits for Claim', async () => {
    await setRun({ currentFloor: 170, potExp: 501, lives: 1, bestFloor: 3 })
    const before = await ninja.row()
    const body = (await post('/fight')).json()
    expect(body).toMatchObject({ won: false, potPaid: null })
    expect(body.lasNoches).toMatchObject({
      run: { floor: 170, lives: 0, pot: 0 },
      runsLeft: 3,
      bestFloor: 3,
    })
    expect((await ninja.row()).exp).toBe(before.exp)
    expect(errorCode(await post('/fight'))).toBe('no_lives')
    const claim = (await post('/withdraw')).json()
    expect(claim).toMatchObject({ potPaid: 0, lasNoches: { run: null, runsLeft: 2 } })
    expect(errorCode(await post('/withdraw'))).toBe('no_run')
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

describe('Las Noches auto Gold', () => {
  it.each([
    [1, 28],
    [2, 58],
    [3, 91],
  ])('charges %i runs once', async (runs, price) => {
    await ninja.set({ gold: 100 })
    const responses = await Promise.all([post('/auto', { runs }), post('/auto', { runs })])
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect((await ninja.row()).gold).toBe(100 - price)
    expect(await gateRow()).toMatchObject({ mode: 1, autoRunsBought: runs })
  })
  it('refuses insufficient Gold without starting', async () => {
    await ninja.set({ gold: 27 })
    expect(errorCode(await post('/auto', { runs: 1 }))).toBe('no_gold')
    expect((await ninja.row()).gold).toBe(27)
    expect(await gateRow()).toBeUndefined()
  })
  it('refuses invalid and unavailable run counts', async () => {
    await ninja.set({ gold: 100 })
    expect((await post('/auto', { runs: 4 })).statusCode).toBe(400)
    await setRun({ runsDay: today(), runsToday: 2 })
    expect(errorCode(await post('/auto', { runs: 2 }))).toBe('daily_limit')
    expect((await ninja.row()).gold).toBe(100)
  })
})

describe('auto catch-up', () => {
  it('processes elapsed floors only once under concurrent loads', async () => {
    await setRun({
      mode: 1,
      currentFloor: 1,
      autoRunsLeft: 1,
      autoRunsBought: 1,
      autoEndFloor: 160,
      autoReachFloor: 3,
      autoTickAt: new Date(Date.now() - 61000),
    })
    await Promise.all([
      ninja.client.get('/api/game/gates/las-noches'),
      ninja.client.get('/api/game/gates/las-noches'),
    ])
    expect(await gateRow()).toMatchObject({ currentFloor: 3, mode: 1, bestFloor: 2 })
    const pot = (await gateRow())!.potExp
    expect(pot).toBe(355 + 374)
    await ninja.client.get('/api/game/gates/las-noches')
    expect((await gateRow())!.potExp).toBe(pot)
  })
  it('pays completed runs once and ends auto mode', async () => {
    await setRun({
      mode: 1,
      currentFloor: 1,
      autoRunsLeft: 1,
      autoRunsBought: 1,
      autoEndFloor: 160,
      autoReachFloor: 1,
      autoTickAt: new Date(Date.now() - 31000),
    })
    await Promise.all([
      ninja.client.get('/api/game/gates/las-noches'),
      ninja.client.get('/api/game/gates/las-noches'),
    ])
    expect(await gateRow()).toMatchObject({ currentFloor: null, mode: 0, runsToday: 1, potExp: 0 })
  })
  it('stops, resumes without another charge, and claims', async () => {
    await ninja.set({ gold: 100 })
    await post('/auto', { runs: 1 })
    await post('/auto-stop')
    expect((await gateRow())!.mode).toBe(2)
    await post('/auto', { runs: 1 })
    expect((await ninja.row()).gold).toBe(72)
    await post('/auto-stop')
    await post('/withdraw')
    expect(await gateRow()).toMatchObject({ mode: 0, autoRunsLeft: 0 })
  })
})

describe('auto run boundaries', () => {
  it('claim preserves other purchased runs while paused', async () => {
    await setRun({
      mode: 2,
      currentFloor: 2,
      potExp: 355,
      autoRunsLeft: 3,
      autoRunsBought: 3,
      autoEndFloor: 160,
      autoReachFloor: 160,
    })
    const response = await post('/withdraw')
    expect(response.json().potPaid).toBe(355)
    expect(await gateRow()).toMatchObject({
      mode: 2,
      currentFloor: 1,
      potExp: 0,
      runsToday: 1,
      autoRunsLeft: 2,
    })
  })
  it('catches up all three runs after a long absence', async () => {
    await setRun({
      mode: 1,
      currentFloor: 1,
      autoRunsLeft: 3,
      autoRunsBought: 3,
      autoEndFloor: 160,
      autoReachFloor: 160,
      autoTickAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    const result = (await ninja.client.get('/api/game/gates/las-noches')).json()
    expect(await gateRow()).toMatchObject({
      mode: 2,
      currentFloor: 161,
      runsToday: 3,
      autoRunsLeft: 0,
      bestFloor: 160,
      floor50Broadcast: true,
    })
    expect(
      result.broadcasts.filter((m: { key: string }) => m.key === 'SingleGate_231'),
    ).toHaveLength(1)
    expect(
      result.broadcasts.filter((m: { key: string }) => m.key === 'SingleGate_303'),
    ).toHaveLength(10)
    const before = await ninja.row()
    expect((await ninja.client.get('/api/game/gates/las-noches')).json().broadcasts).toEqual([])
    expect(await ninja.row()).toEqual(before)
  })
})
