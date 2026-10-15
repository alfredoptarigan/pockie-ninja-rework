// Home farm: buying a seed into an empty field for Stones, the server-clock ripening and the
// harvest into the bag (bag room first).
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HOME_FARM_PLOTS,
  HOME_PLACEHOLDERS,
  type HomeResult,
  type HomeView,
} from '../../../../shared/src/schemas/home.js'
import { createTestDb, truncateAll } from '../../../test/helpers.js'
import { homeFarms, inventoryItems } from '../../db/schema.js'
import { BAG_CELLS, itemCells } from '../../game/bag.js'
import { errorCode, setUpNinja } from '../gates/test-setup.js'

const { db, close } = createTestDb()
let ninja: Awaited<ReturnType<typeof setUpNinja>>

beforeEach(async () => {
  await truncateAll(db)
  ninja = await setUpNinja(db)
  await ninja.set({ stone: 10_000 })
})
afterEach(() => ninja.app.close())
afterAll(() => close())

const [GRASS, EGGPLANT] = HOME_PLACEHOLDERS.farmSeeds
const view = async () => (await ninja.client.get('/api/game/home')).json<HomeView>()
const plant = (plot: number, crop: string = GRASS!.crop) =>
  ninja.client.post('/api/game/home/plant', { plot, crop })
const harvest = (plot: number) => ninja.client.post('/api/game/home/harvest', { plot })
/** Moves every crop's ripening into the past. */
const ripen = async () => {
  const [row] = await db
    .select()
    .from(homeFarms)
    .where(eq(homeFarms.characterId, ninja.characterId))
  const plots = row!.plots.map((p) => p && { ...p, readyAt: Date.now() - 1 })
  await db.update(homeFarms).set({ plots }).where(eq(homeFarms.characterId, ninja.characterId))
}

describe('Home farm', () => {
  it('starts with six empty fields, the seed list and the server clock', async () => {
    const before = Date.now()
    const home = await view()
    expect(home.plots).toEqual(Array(HOME_FARM_PLOTS).fill(null))
    expect(home.seeds).toEqual(HOME_PLACEHOLDERS.farmSeeds)
    expect(home.serverNow).toBeGreaterThanOrEqual(before)
  })

  it('plants a seed for Stones and times it on the server clock', async () => {
    const before = Date.now()
    const response = await plant(2, EGGPLANT!.crop)
    expect(response.statusCode).toBe(200)
    const result = response.json<HomeResult>()
    expect(result.character.stone).toBe(10_000 - EGGPLANT!.cost)
    const field = result.home.plots[2]!
    expect(field.crop).toBe(EGGPLANT!.crop)
    expect(field.readyAt).toBeGreaterThanOrEqual(before + EGGPLANT!.minutes * 60_000)
    expect(errorCode(await plant(2))).toBe('plot_busy')
  })

  it('refuses unknown seeds, missing Stones and fields out of range', async () => {
    expect(errorCode(await plant(0, 'i170099'))).toBe('unknown_seed')
    await ninja.set({ stone: GRASS!.cost - 1 })
    expect(errorCode(await plant(0))).toBe('not_enough')
    expect((await plant(HOME_FARM_PLOTS)).statusCode).toBe(400)
    expect((await view()).plots[0]).toBeNull()
  })

  it('harvests a ripe field into the bag and empties it', async () => {
    await plant(0)
    expect(errorCode(await harvest(0))).toBe('not_ready')
    expect(errorCode(await harvest(1))).toBe('plot_empty')
    await ripen()
    const response = await harvest(0)
    expect(response.statusCode).toBe(200)
    const result = response.json<HomeResult>()
    expect(result.harvested).toEqual({ crop: GRASS!.crop, count: GRASS!.yield })
    expect(result.home.plots[0]).toBeNull()
    const crops = await ninja.bag(GRASS!.crop)
    expect(crops.reduce((sum, row) => sum + row.count, 0)).toBe(GRASS!.yield)
  })

  it('keeps the crop in the field when the bag is full', async () => {
    await plant(0)
    await ripen()
    const filler = 'i260100'
    const rows = Math.floor(BAG_CELLS / itemCells(filler))
    await db
      .insert(inventoryItems)
      .values(
        Array.from({ length: rows }, () => ({ characterId: ninja.characterId, itemId: filler })),
      )
    expect(errorCode(await harvest(0))).toBe('bag_full')
    expect((await view()).plots[0]?.crop).toBe(GRASS!.crop)
  })
})
