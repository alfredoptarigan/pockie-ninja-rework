// Clan Events (Reborn's Clan window Events tab) under /api/game/clan-events: the clan level bar,
// Ninja Garden (garden.ts) and Picnic in Garden (picnic.ts). Every write runs in one transaction
// with lockClanOf's locks (character, then clan) and answers with the fresh view and character.
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  gardenLevelUpSchema,
  gardenPlantSchema,
  gardenPlotSchema,
  gardenRerollSchema,
  picnicOutfitSchema,
  type ClanLevelView,
  type GardenResult,
  type PicnicResult,
} from '../../../../shared/src/schemas/home.js'
import type { Db } from '../../db/client.js'
import { clanMembers, clans } from '../../db/schema.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { lockClanOf, type ClanContext } from '../clans/clans.js'
import { characterOf, requireUser } from '../game/characters.js'
import { RATE_LIMITS } from '../game/rate-limits.js'
import { characterView } from '../gates/common.js'
import {
  harvestTree,
  gardenView,
  levelUpTree,
  plantTree,
  rerollTree,
  skipCooldown,
  unlockPlot,
} from './garden.js'
import { clanLevelView, readProgress } from './level.js'
import {
  claimReward,
  contributeGiftCertificates,
  contributeOutfit,
  contributeStones,
  picnicView,
} from './picnic.js'

const READ = { config: { rateLimit: RATE_LIMITS.read } }
const WRITE = { config: { rateLimit: RATE_LIMITS.item } }

/** The caller's clan id and level (as committed in `db`), or a 404 without a clan. */
async function myClan(db: Tx | Db, characterId: string) {
  const [row] = await db
    .select({ clanId: clans.id, clanLevel: clans.level })
    .from(clanMembers)
    .innerJoin(clans, eq(clans.id, clanMembers.clanId))
    .where(eq(clanMembers.characterId, characterId))
  if (!row) throw new HttpError(404, 'no_clan', 'You are not in a clan.')
  return { characterId, ...row }
}

export async function clanEventRoutes(app: FastifyInstance, { db }: { db: Db }) {
  const me = async (request: FastifyRequest) =>
    myClan(db, (await characterOf(db, requireUser(request).id)).id)

  /** Runs `fn` with the clan locked; `view` builds the answer inside the same transaction. */
  const act = <R, V>(
    request: FastifyRequest,
    fn: (ctx: ClanContext, now: Date) => Promise<R>,
    view: (tx: Tx, characterId: string, now: Date, result: R) => Promise<V>,
  ) =>
    db.transaction(async (tx) => {
      const callerId = (await characterOf(tx, requireUser(request).id)).id
      const ctx = await lockClanOf(tx, callerId)
      const now = new Date()
      const result = await fn(ctx, now)
      return view(tx, callerId, now, result)
    })

  app.get('/', READ, async (request): Promise<ClanLevelView> => {
    const mine = await me(request)
    return clanLevelView(mine.clanLevel, (await readProgress(db, mine.clanId))?.exp ?? 0)
  })

  // --- Ninja Garden ---
  app.get('/garden', READ, async (request) => gardenView(db, await me(request)))

  const garden = <R>(
    request: FastifyRequest,
    fn: (ctx: ClanContext, now: Date) => Promise<R>,
    harvest?: (result: R) => GardenResult['harvest'],
  ) =>
    act(request, fn, async (tx, id, now, result): Promise<GardenResult> => ({
      garden: await gardenView(tx, await myClan(tx, id), now),
      character: await characterView(tx, id),
      ...(harvest && { harvest: harvest(result) }),
    }))

  app.post('/garden/unlock', WRITE, (request) => {
    const { plotIndex } = gardenPlotSchema.parse(request.body)
    return garden(request, (ctx) => unlockPlot(ctx, plotIndex))
  })
  app.post('/garden/plant', WRITE, (request) => {
    const { plotIndex, treeLevel, treeType } = gardenPlantSchema.parse(request.body)
    return garden(request, (ctx, now) => plantTree(ctx, plotIndex, treeLevel, treeType, now))
  })
  app.post('/garden/harvest', WRITE, (request) => {
    const { plotIndex } = gardenPlotSchema.parse(request.body)
    return garden(
      request,
      (ctx, now) => harvestTree(ctx, plotIndex, now),
      (harvest) => harvest,
    )
  })
  app.post('/garden/skip', WRITE, (request) => {
    const { plotIndex } = gardenPlotSchema.parse(request.body)
    return garden(request, (ctx, now) => skipCooldown(ctx, plotIndex, now))
  })
  app.post('/garden/reroll', WRITE, (request) => {
    const { payWith } = gardenRerollSchema.parse(request.body)
    return garden(request, (ctx) => rerollTree(ctx, payWith))
  })
  app.post('/garden/level-up', WRITE, (request) => {
    const { currentLevel, payWith } = gardenLevelUpSchema.parse(request.body)
    return garden(request, (ctx) => levelUpTree(ctx, currentLevel, payWith))
  })

  // --- Picnic in Garden ---
  app.get('/picnic', READ, async (request) => picnicView(db, await me(request)))

  const picnic = (
    request: FastifyRequest,
    fn: (ctx: ClanContext, now: Date) => Promise<number | PicnicResult['claimed']>,
  ) =>
    act(request, fn, async (tx, id, now, result): Promise<PicnicResult> => ({
      picnic: await picnicView(tx, await myClan(tx, id), now),
      character: await characterView(tx, id),
      ...(typeof result === 'number' ? { pointsAdded: result } : { claimed: result }),
    }))

  app.post('/picnic/stone', WRITE, (request) => picnic(request, contributeStones))
  app.post('/picnic/gift-certificates', WRITE, (request) =>
    picnic(request, contributeGiftCertificates),
  )
  app.post('/picnic/outfit', WRITE, (request) => {
    const { uid } = picnicOutfitSchema.parse(request.body)
    return picnic(request, (ctx, now) => contributeOutfit(ctx, uid, now))
  })
  app.post('/picnic/claim', WRITE, (request) => picnic(request, claimReward))
}

export default clanEventRoutes
