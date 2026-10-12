import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { pubFightLineups } from '../../db/schema.js'
import { errorCode, setUpNinja, today } from './test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.ready(16, 2601)
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const pub = () => ninja.client.get('/api/game/gates/pub')
const lineups = () =>
  db.select().from(pubFightLineups).where(eq(pubFightLineups.characterId, ninja.characterId))

describe('pub fights', () => {
  it('the first look picks three different NPCs of the scene’s library', async () => {
    const view = (await pub()).json()
    expect(view).toMatchObject({ sceneId: 2601, fightsToday: 0, maxFights: 999, nextPullAt: null })
    expect(new Set(view.lineup).size).toBe(3)
    for (const id of view.lineup) expect(id).toMatch(/^n80000(0\d|1[0-5])$/)
    expect((await pub()).json().lineup).toEqual(view.lineup)
  })

  it('has no pub outside the neutral fields', async () => {
    await ninja.set({ sceneId: 171 })
    expect(errorCode(await pub())).toBe('not_here')
  })

  it('pulls once per hour', async () => {
    const response = await ninja.client.post('/api/game/gates/pub/pull')
    expect(response.statusCode).toBe(200)
    expect(response.json().pub.lineup).toHaveLength(3)
    expect(response.json().pub.nextPullAt).not.toBeNull()
    expect((await lineups())[0]!.npcIds).toEqual(response.json().pub.lineup)
    expect(errorCode(await ninja.client.post('/api/game/gates/pub/pull'))).toBe('pull_cooldown')
    await ninja.set({ pubFightPulledAt: new Date(Date.now() - 3_600_000) })
    expect((await ninja.client.post('/api/game/gates/pub/pull')).statusCode).toBe(200)
  })

  it('needs full HP and stops at 999 fights a day', async () => {
    await ninja.set({ hp: 1 })
    expect(errorCode(await ninja.client.post('/api/game/gates/pub/fight'))).toBe('not_full_hp')
    await ninja.ready(16, 2601)
    await ninja.set({ pubFightDay: today(), pubFightsToday: 999 })
    expect(errorCode(await ninja.client.post('/api/game/gates/pub/fight'))).toBe('daily_limit')
  })

  it('a fight counts for today; a loss leaves 1 HP, a win pulls a new line-up', async () => {
    const response = await ninja.client.post('/api/game/gates/pub/fight')
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.npcIds).toHaveLength(3)
    expect(body.pub.fightsToday).toBe(1)
    expect((await ninja.row()).pubFightsToday).toBe(1)
    if (!body.won) expect(body.character.hp).toBe(1)
    else expect(body.pub.lineup).toHaveLength(3)
  })
})
