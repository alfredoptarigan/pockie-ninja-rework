// Explore spots (OutSearchSystem): search a spot in the current scene, reveal five cards and pay
// out the picked one, with a global cooldown and a daily search count.
import { createRandom } from '@pockie/game-core'
import { randomInt, randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { exploreSearchSchema, explorePeekSchema } from '../../../../shared/src/schemas/explore.js'
import type { Db } from '../../db/client.js'
import { characterExploreSpots, characters, inventoryItems } from '../../db/schema.js'
import { EXPLORE_MIN_HP, fightMonster, type FightRewards } from '../../game/combat.js'
import {
  item,
  exploreClipName,
  exploreCooldownSeconds,
  exploreSpot,
  exploreSpotIds,
} from '../../game/data.js'
import {
  advanceStar,
  cardGranted,
  peekCost,
  seniorKey,
  SENIOR_FORBIDDEN_SCENES,
  CARDS_PER_SEARCH,
  dailyExploreTotal,
  requiredItems,
  rollCard,
  rollStarBonus,
  type ExploreCard,
  type StarState,
} from '../../game/explore.js'
import { expUpdate, grantItems, removeItems, rookieHandIns, type Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import { characterOf, lockCharacter, requireAlive, requireUser, toCharacter } from './characters.js'
import { RATE_LIMITS } from './rate-limits.js'

type CharacterRow = typeof characters.$inferSelect

const spotParams = z.object({ spotId: z.string().regex(/^\d{1,6}$/, 'Unknown spot.') })

const bad = (code: string, message: string) => new HttpError(400, code, message)
const utcDay = (now: Date) => now.toISOString().slice(0, 10)

function exploreStatus(character: CharacterRow, now: Date) {
  const total = dailyExploreTotal(character.level)
  const used = character.exploreDay === utcDay(now) ? character.exploreUsed : 0
  const endsAt = character.exploreLastAt
    ? character.exploreLastAt.getTime() + exploreCooldownSeconds() * 1000
    : 0
  return {
    remaining: Math.max(0, total - used),
    total,
    used,
    cooldownEndsAt: endsAt > now.getTime() ? new Date(endsAt).toISOString() : null,
  }
}

const publicStatus = ({ used: _used, ...status }: ReturnType<typeof exploreStatus>) => status

async function bagCount(tx: Tx, characterId: string, itemId: string) {
  const rows = await tx
    .select({ count: inventoryItems.count })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.characterId, characterId),
        eq(inventoryItems.itemId, itemId),
        isNull(inventoryItems.equippedSlot),
      ),
    )
  return rows.reduce((sum, row) => sum + row.count, 0)
}

interface PendingSearch {
  searchId: string
  spotId: string
  sceneId: number
  mode: 'normal' | 'senior'
  cards: ExploreCard[]
  revealed: number[]
  peekCount: number
  star: StarState
  starBonus: ReturnType<typeof rollStarBonus>
  rewards: FightRewards
}

function pendingView(search: PendingSearch, character: CharacterRow) {
  const spot = exploreSpot(search.spotId)!
  return {
    searchId: search.searchId,
    spotId: search.spotId,
    mode: search.mode,
    cards: search.cards.map((card, index) => (search.revealed.includes(index) ? card : null)),
    peek: {
      count: search.peekCount,
      limit: Number(spot.CanLookCount),
      cost: peekCost(spot, search.peekCount, 'gold'),
    },
    star: { ...search.star, perStar: Number(spot.StarUp) },
    starBonus: search.starBonus,
    explore: publicStatus(exploreStatus(character, new Date())),
    character: toCharacter(character),
  }
}

/** Two initially active 60-cell bags (PackSystem). Geometry/expanded bags need schema support. */
async function requireBagRoom(
  tx: Tx,
  characterId: string,
  awards: FightRewards['items'],
  reserve = 0,
) {
  const bag = await tx
    .select({
      itemId: inventoryItems.itemId,
      bound: inventoryItems.bound,
      count: inventoryItems.count,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.characterId, characterId), isNull(inventoryItems.equippedSlot)))
  let used = bag.reduce((sum, row) => sum + Number(item(row.itemId)?.ItemShapeType ?? 1), 0)
  for (const award of awards) {
    const config = item(award.itemId)
    const max = Number(config?.ItemMaxFoldNum ?? 1)
    const stack = bag.find(
      (row) => row.itemId === award.itemId && row.bound === award.bound && row.count < max,
    )
    if (stack) stack.count += 1
    else {
      used += Number(config?.ItemShapeType ?? 1)
      bag.push({ itemId: award.itemId, bound: award.bound, count: 1 })
    }
  }
  if (used + reserve > 120)
    throw bad('bag_full', 'Your bag is full. Free at least six cells before exploring.')
}

export async function exploreRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Pending cards are process-local until the owned schema gains OutSearchBonus storage.
  const pending = new Map<string, PendingSearch>()
  const queues = new Map<string, Promise<void>>()
  app.addHook('onClose', async () => {
    pending.clear()
  })

  function requireSearch(character: CharacterRow, spotId: string, searchId: string) {
    const search = pending.get(character.id)
    if (!search || search.searchId !== searchId || search.spotId !== spotId) {
      throw bad('no_search', 'That search is no longer available. Start a new search.')
    }
    if (search.mode === 'normal' && character.sceneId !== search.sceneId) {
      throw bad('not_here', 'Return to the area where you started this search.')
    }
    return search
  }

  // Keep the memory update and DB commit together for requests in this process. All routes
  // still acquire the same PostgreSQL character row lock used by other game actions.
  async function locked<T>(
    userId: string,
    action: (
      tx: Tx,
      character: CharacterRow,
    ) => Promise<{ response: T; search: PendingSearch | null }>,
  ) {
    const previous = queues.get(userId) ?? Promise.resolve()
    let release = () => {}
    const queue = new Promise<void>((resolve) => {
      release = resolve
    })
    queues.set(userId, queue)
    await previous
    try {
      let characterId = ''
      const result = await db.transaction(async (tx) => {
        const character = await lockCharacter(tx, userId)
        characterId = character.id
        return action(tx, character)
      })
      if (result.search) pending.set(characterId, result.search)
      else pending.delete(characterId)
      return result.response
    } finally {
      release()
      if (queues.get(userId) === queue) queues.delete(userId)
    }
  }

  app.get('/explore', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const stars = await db
      .select()
      .from(characterExploreSpots)
      .where(eq(characterExploreSpots.characterId, character.id))
    return {
      ...publicStatus(exploreStatus(character, new Date())),
      cooldownSeconds: exploreCooldownSeconds(),
      ...(pending.has(character.id)
        ? { pending: pendingView(pending.get(character.id)!, character) }
        : {}),
      spots: exploreSpotIds(character.sceneId).map((id) => {
        const spot = exploreSpot(id)!
        const star = stars.find((s) => String(s.spotId) === id)
        return {
          id,
          nameKey: `lg_OutSearch_${id}`,
          clipName: exploreClipName(id),
          requireLevel: Number(spot.RequireLevel),
          senior: seniorKey(id),
          requireStone: Number(spot.RequireStone ?? 0),
          requireItems: requiredItems(spot),
          star: {
            level: star?.starLevel ?? 0,
            progress: star?.starProgress ?? 0,
            perStar: Number(spot.StarUp),
          },
        }
      }),
    }
  })

  app.post(
    '/explore/:spotId/peek',
    { config: { rateLimit: RATE_LIMITS.explorePeek } },
    async (request) => {
      const userId = requireUser(request).id
      const { spotId } = spotParams.parse(request.params)
      const input = explorePeekSchema.parse(request.body)
      return locked<ReturnType<typeof pendingView>>(userId, async (tx, character) => {
        const search = requireSearch(character, spotId, input.searchId)
        requireAlive(character, 'explore')
        const spot = exploreSpot(spotId)!
        if (search.revealed.includes(input.cardIndex)) {
          return { response: pendingView(search, character), search }
        }
        if (search.peekCount >= Number(spot.CanLookCount)) {
          throw bad('peek_limit', 'You cannot peek at any more cards in this search.')
        }
        const cost = peekCost(spot, search.peekCount, input.currency)
        if (!cost) throw bad('invalid_currency', 'This peek must be paid with Gold.')
        if (character[cost.currency] < cost.amount) {
          const name =
            cost.currency === 'giftCoupon'
              ? 'Gift Coupons'
              : cost.currency === 'gold'
                ? 'Gold'
                : 'Stone'
          throw bad(`no_${cost.currency}`, `You do not have enough ${name}.`)
        }
        const [updated] = await tx
          .update(characters)
          .set({ [cost.currency]: character[cost.currency] - cost.amount })
          .where(eq(characters.id, character.id))
          .returning()
        const next = {
          ...search,
          peekCount: search.peekCount + 1,
          revealed: [...search.revealed, input.cardIndex],
        }
        return { response: pendingView(next, updated!), search: next }
      })
    },
  )

  app.post('/explore/:spotId', { config: { rateLimit: RATE_LIMITS.explore } }, async (request) => {
    const userId = requireUser(request).id
    const { spotId } = spotParams.parse(request.params)
    const input = exploreSearchSchema.parse(
      request.body === undefined
        ? { action: 'quick' }
        : {
            action: 'quick',
            ...z.record(z.string(), z.unknown()).parse(request.body),
          },
    )
    const spot = exploreSpot(spotId)
    if (!spot) throw new HttpError(404, 'unknown_spot', 'There is no such place to explore.')
    return locked<ReturnType<typeof pendingView> | Awaited<ReturnType<typeof settleSearch>>>(
      userId,
      async (tx, character) => {
        requireAlive(character, 'explore')
        if (input.action === 'pick') {
          const search = requireSearch(character, spotId, input.searchId)
          const response = await settleSearch(tx, character, search, input.cardIndex)
          return { response, search: null }
        }
        if (pending.has(character.id))
          throw bad('search_pending', 'Choose a card from your current search first.')
        await requireBagRoom(tx, character.id, [], 6)
        const now = new Date()
        const status = exploreStatus(character, now)
        const mode = input.mode
        let stoneCost = 0
        let needed: { itemId: string; count: number }[]
        if (mode === 'senior') {
          if (SENIOR_FORBIDDEN_SCENES.includes(character.sceneId)) {
            throw bad('not_here', 'You cannot use an exploration key in this area.')
          }
          const key = seniorKey(spotId)
          if (!key) throw bad('no_senior_key', 'There is no senior exploration key for that place.')
          if (character.level < key.level)
            throw bad('too_low', `You need level ${key.level} to use that exploration key.`)
          needed = [{ itemId: key.itemId, count: 1 }]
        } else {
          if (!exploreSpotIds(character.sceneId).includes(spotId))
            throw bad('not_here', 'That place is not in this area.')
          if (character.level < Number(spot.RequireLevel))
            throw bad('too_low', 'Your level is too low to explore there.')
          if (status.remaining <= 0) throw bad('daily_limit', 'You cannot explore any more today.')
          if (status.cooldownEndsAt)
            throw bad('cooldown', 'You need to rest before exploring again.')
          stoneCost = Number(spot.RequireStone ?? 0)
          if (character.stone < stoneCost) throw bad('no_stone', 'You do not have enough Stone.')
          needed = requiredItems(spot)
        }
        for (const { itemId, count } of needed) {
          if ((await bagCount(tx, character.id, itemId)) < count)
            throw bad('missing_item', 'You need a key to explore there.')
        }
        // CostOutSearch
        for (const { itemId, count } of needed) await removeItems(tx, character.id, itemId, count)
        const [existing] = await tx
          .select()
          .from(characterExploreSpots)
          .where(
            and(
              eq(characterExploreSpots.characterId, character.id),
              eq(characterExploreSpots.spotId, Number(spotId)),
            ),
          )
        const star = advanceStar(
          existing && { level: existing.starLevel, progress: existing.starProgress },
          Number(spot.StarUp),
        )
        await saveStar(tx, character.id, Number(spotId), star)

        const random = createRandom(randomInt(2 ** 31))
        const rewards: FightRewards = { exp: 0, stone: 0, items: [], levelsGained: 0 }
        // Fight drops are granted by fightMonster; everything else is collected here.
        const toGrant: FightRewards['items'] = []
        let current: CharacterRow = {
          ...character,
          stone: character.stone - stoneCost,
          exploreLastAt: mode === 'normal' ? now : character.exploreLastAt,
          exploreDay: mode === 'normal' ? utcDay(now) : character.exploreDay,
          exploreUsed: mode === 'normal' ? status.used + 1 : character.exploreUsed,
        }

        // Star bonus: EXP or the spot's pet egg.
        const starBonus = rollStarBonus(spot, star, random)
        if (starBonus?.type === 'exp') {
          const { levelsGained, ...update } = expUpdate(current, starBonus.exp)
          current = { ...current, ...update }
          rewards.exp += starBonus.exp
          rewards.levelsGained += levelsGained
        } else if (starBonus) {
          toGrant.push({ itemId: starBonus.itemId, bound: true })
        }
        await requireBagRoom(tx, character.id, toGrant)
        await grantItems(tx, character.id, toGrant)
        rewards.items.push(...toGrant)
        await tx
          .update(characters)
          .set({
            stone: current.stone,
            level: current.level,
            exp: current.exp,
            hp: current.hp,
            mp: current.mp,
            exploreLastAt: current.exploreLastAt,
            exploreDay: current.exploreDay,
            exploreUsed: current.exploreUsed,
          })
          .where(eq(characters.id, character.id))

        const search: PendingSearch = {
          searchId: randomUUID(),
          spotId,
          mode,
          sceneId: character.sceneId,
          cards: Array.from({ length: CARDS_PER_SEARCH }, () => rollCard(spot, random)),
          revealed: [],
          peekCount: 0,
          star,
          starBonus,
          rewards,
        }
        if (input.action === 'start') {
          return { response: pendingView(search, current), search }
        }
        return { response: await settleSearch(tx, current, search, 0), search: null }
      },
    )
  })
}

async function settleSearch(
  tx: Tx,
  character: CharacterRow,
  search: PendingSearch,
  cardIndex: number,
) {
  const { spotId, star, starBonus, cards } = search
  const spot = exploreSpot(spotId)!
  const current = character
  const card = cards[cardIndex]!
  const random = createRandom(randomInt(2 ** 31))
  const rewards: FightRewards = { ...search.rewards, items: [...search.rewards.items] }
  const toGrant: FightRewards['items'] = []
  let granted = true
  let fight = null
  if (card.type === 'fight') {
    const result = await fightMonster(tx, current, card.monsterId, EXPLORE_MIN_HP)
    fight = { replay: result.replay, won: result.won }
    rewards.exp += result.rewards.exp
    rewards.stone += result.rewards.stone
    rewards.items.push(...result.rewards.items)
    rewards.levelsGained += result.rewards.levelsGained
  } else if (card.type === 'stone') {
    rewards.stone += card.amount
    await tx
      .update(characters)
      .set({ stone: current.stone + card.amount })
      .where(eq(characters.id, character.id))
  } else if ('itemId' in card) {
    granted = cardGranted(card, random)
    if (granted) toGrant.push({ itemId: card.itemId, bound: card.bound })
  }
  await requireBagRoom(tx, character.id, toGrant)
  rewards.items.push(...toGrant)
  await grantItems(tx, character.id, toGrant)

  // `rewards` already holds the search's loot, so hand-ins go in `questRewards`.
  const handIns = await rookieHandIns(tx, character.id)
  rewards.levelsGained += handIns.levelsGained
  const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
  return {
    spotId,
    star: { ...star, perStar: Number(spot.StarUp) },
    starBonus,
    card: { ...card, granted } as ExploreCard & { granted: boolean },
    otherCards: cards.filter((_, index) => index !== cardIndex),
    fight,
    rewards,
    completed: handIns.completed,
    questRewards: handIns.rewards,
    explore: publicStatus(exploreStatus(updated!, new Date())),
    character: toCharacter(updated!),
  }
}

async function saveStar(tx: Tx, characterId: string, spotId: number, star: StarState) {
  await tx
    .insert(characterExploreSpots)
    .values({ characterId, spotId, starLevel: star.level, starProgress: star.progress })
    .onConflictDoUpdate({
      target: [characterExploreSpots.characterId, characterExploreSpots.spotId],
      set: { starLevel: star.level, starProgress: star.progress },
    })
}
