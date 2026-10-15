// Home (Reborn's scene 4101, main.js @3589900) under /api/game/home: six farm fields. An empty
// field takes a seed bought for Stones (Reborn's `purchasePlot`); the crop ripens on the server
// clock and a ripe field is harvested into the bag (`removePlot`). Each action locks the character
// row, then the farm row. Seed prices, times and yields are HOME_PLACEHOLDERS.
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  HOME_FARM_PLOTS,
  HOME_PLACEHOLDERS,
  homePlantSchema,
  homePlotSchema,
  type FarmPlot,
  type HomeResult,
  type HomeView,
} from '../../../../shared/src/schemas/home.js'
import type { Db } from '../../db/client.js'
import { characters, homeFarms } from '../../db/schema.js'
import { requireBagRoom } from '../../game/bag.js'
import { grantItems, type Tx } from '../../game/progress.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { bad, characterView, withCharacter, type CharacterRow } from '../gates/common.js'

const MINUTE_MS = 60_000
const SEEDS = HOME_PLACEHOLDERS.farmSeeds

type Plots = (FarmPlot | null)[]

/** Always six entries, whatever the stored array holds. */
const normalize = (stored: Plots | undefined): Plots =>
  Array.from({ length: HOME_FARM_PLOTS }, (_, i) => stored?.[i] ?? null)

export const homeView = (plots: Plots | undefined, now: number): HomeView => ({
  serverNow: now,
  plots: normalize(plots),
  seeds: SEEDS.map((seed) => ({ ...seed })),
})

async function lockFarm(tx: Tx, characterId: string) {
  await tx.insert(homeFarms).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(homeFarms)
    .where(eq(homeFarms.characterId, characterId))
    .for('update')
  return normalize(row!.plots)
}

const saveFarm = (tx: Tx, characterId: string, plots: Plots) =>
  tx.update(homeFarms).set({ plots }).where(eq(homeFarms.characterId, characterId))

async function plant(tx: Tx, character: CharacterRow, plot: number, crop: string) {
  const now = Date.now()
  const seed = SEEDS.find((s) => s.crop === crop)
  if (!seed) throw bad('unknown_seed', 'That seed is not sold here.')
  const plots = await lockFarm(tx, character.id)
  if (plots[plot]) throw bad('plot_busy', 'Something already grows in this field.')
  if (character.stone < seed.cost) throw bad('not_enough', 'Not enough Stones.')
  await tx
    .update(characters)
    .set({ stone: character.stone - seed.cost })
    .where(eq(characters.id, character.id))
  const next = plots.map((p, i) =>
    i === plot ? { crop, readyAt: now + seed.minutes * MINUTE_MS } : p,
  )
  await saveFarm(tx, character.id, next)
  return { plots: next, now }
}

async function harvest(tx: Tx, character: CharacterRow, plot: number) {
  const now = Date.now()
  const plots = await lockFarm(tx, character.id)
  const field = plots[plot]
  if (!field) throw bad('plot_empty', 'Nothing grows in this field.')
  if (field.readyAt > now) throw bad('not_ready', 'The crop is not ripe yet.')
  const count = SEEDS.find((s) => s.crop === field.crop)?.yield ?? 1
  const crops = Array.from({ length: count }, () => ({ itemId: field.crop, bound: false }))
  await requireBagRoom(tx, character.id, crops)
  await grantItems(tx, character.id, crops)
  const next = plots.map((p, i) => (i === plot ? null : p))
  await saveFarm(tx, character.id, next)
  return { plots: next, now, harvested: { crop: field.crop, count } }
}

export async function homeRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const [row] = await db.select().from(homeFarms).where(eq(homeFarms.characterId, character.id))
    return homeView(row?.plots, Date.now())
  })
  app.post('/plant', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { plot, crop } = homePlantSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character): Promise<HomeResult> => {
      const done = await plant(tx, character, plot, crop)
      return {
        home: homeView(done.plots, done.now),
        character: await characterView(tx, character.id),
      }
    })
  })
  app.post('/harvest', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { plot } = homePlotSchema.parse(request.body)
    return withCharacter(db, request, async (tx, character): Promise<HomeResult> => {
      const done = await harvest(tx, character, plot)
      return {
        home: homeView(done.plots, done.now),
        character: await characterView(tx, character.id),
        harvested: done.harvested,
      }
    })
  })
}

export default homeRoutes
