// Explore spots (OutSearchSystem): search a spot in the current scene, reveal five cards and pay
// out the picked one, with a global cooldown and a daily search count.
import { createRandom } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { characterExploreSpots, characters, inventoryItems } from '../../db/schema.js'
import { EXPLORE_MIN_HP, fightMonster, type FightRewards } from '../../game/combat.js'
import { exploreCooldownSeconds, exploreSpot, exploreSpotIds } from '../../game/data.js'
import {
  advanceStar,
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

// GetBonus: a pet egg card is only handed out half of the time.
const PET_CARD_CHANCE = 50
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
    .where(and(eq(inventoryItems.characterId, characterId), eq(inventoryItems.itemId, itemId)))
  return rows.reduce((sum, row) => sum + row.count, 0)
}

export async function exploreRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/explore', { config: { rateLimit: RATE_LIMITS.read } }, async (request) => {
    const character = await characterOf(db, requireUser(request).id)
    const stars = await db
      .select()
      .from(characterExploreSpots)
      .where(eq(characterExploreSpots.characterId, character.id))
    return {
      ...publicStatus(exploreStatus(character, new Date())),
      spots: exploreSpotIds(character.sceneId).map((id) => {
        const spot = exploreSpot(id)!
        const star = stars.find((s) => String(s.spotId) === id)
        return {
          id,
          nameKey: `lg_OutSearch_${id}`,
          requireLevel: Number(spot.RequireLevel),
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

  app.post('/explore/:spotId', { config: { rateLimit: RATE_LIMITS.explore } }, async (request) => {
    const { spotId } = spotParams.parse(request.params)
    const userId = requireUser(request).id
    const spot = exploreSpot(spotId)
    if (!spot) throw new HttpError(404, 'unknown_spot', 'There is no such place to explore.')

    return db.transaction(async (tx) => {
      // Row lock: concurrent searches queue here and see each other's cooldown.
      const character = await lockCharacter(tx, userId)
      const now = new Date()
      const status = exploreStatus(character, now)

      // CheckCanSearch
      requireAlive(character, 'explore')
      if (!exploreSpotIds(character.sceneId).includes(spotId)) {
        throw bad('not_here', 'That place is not in this area.')
      }
      if (character.level < Number(spot.RequireLevel)) {
        throw bad('too_low', 'Your level is too low to explore there.')
      }
      if (status.remaining <= 0) throw bad('daily_limit', 'You cannot explore any more today.')
      if (status.cooldownEndsAt) throw bad('cooldown', 'You need to rest before exploring again.')
      const stoneCost = Number(spot.RequireStone ?? 0)
      if (character.stone < stoneCost) throw bad('no_stone', 'You do not have enough Stone.')
      const needed = requiredItems(spot)
      for (const { itemId, count } of needed) {
        if ((await bagCount(tx, character.id, itemId)) < count) {
          throw bad('missing_item', 'You need a key to explore there.')
        }
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
        exploreLastAt: now,
        exploreDay: utcDay(now),
        exploreUsed: status.used + 1,
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

      // The player's card (index 0) is paid out; the other four are only revealed.
      const cards = Array.from({ length: CARDS_PER_SEARCH }, () => rollCard(spot, random))
      const card = cards[0]!
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
        granted = card.type !== 'pet' || random.int(100) < PET_CARD_CHANCE
        if (granted) toGrant.push({ itemId: card.itemId, bound: card.bound })
      }
      rewards.items.push(...toGrant)
      await grantItems(tx, character.id, toGrant)

      // `rewards` already holds the search's loot, so hand-ins go in `questRewards`.
      const { completed, rewards: questRewards } = await rookieHandIns(tx, character.id)
      const [updated] = await tx.select().from(characters).where(eq(characters.id, character.id))
      return {
        spotId,
        star: { ...star, perStar: Number(spot.StarUp) },
        starBonus,
        card: { ...card, granted } as ExploreCard & { granted: boolean },
        otherCards: cards.slice(1),
        fight,
        rewards,
        completed,
        questRewards,
        explore: publicStatus(exploreStatus(updated!, new Date())),
        character: toCharacter(updated!),
      }
    })
  })
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
