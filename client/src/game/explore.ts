// Explore spots (server/src/modules/game/explore.ts): what the Explore window shows and offers.
// The server re-checks every rule; this only decides which buttons are enabled and how results
// read.
import type { Character } from '@pockie/shared'
import { plainText } from './text'
import type {
  ExploreCard,
  ExploreResult,
  ExploreSpot,
  ExploreStar,
  ExploreStatus,
  InventoryItem,
} from './types'
import data from './world-data.json'
import { DEFEATED_REASON, isDefeated, itemNameKey } from './world'

export const MAX_STARS = 5

const exploreMonsters = data.exploreMonsters as Record<string, string>

/** Whole seconds of rest left at `now` (ms since epoch); 0 when the ninja may explore. */
export function cooldownLeft(cooldownEndsAt: string | null, now: number) {
  if (!cooldownEndsAt) return 0
  return Math.max(0, Math.ceil((Date.parse(cooldownEndsAt) - now) / 1000))
}

/** "4:05" */
export const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export const itemName = (itemId: string) => plainText(itemNameKey(itemId), 'an unknown item')

export const bagCount = (bag: InventoryItem[], itemId: string) =>
  bag.filter((item) => item.itemId === itemId).reduce((sum, item) => sum + item.count, 0)

export type ExploreBlock = 'defeated' | 'too_low' | 'daily_limit' | 'cooldown' | 'missing_item'

/**
 * Why `spot` cannot be explored now, in the order the server checks (CheckCanSearch), or null.
 * Keys are left to the server while the bag is still loading.
 */
export function exploreBlock(
  spot: ExploreSpot,
  status: ExploreStatus,
  character: Character,
  bag: InventoryItem[] | undefined,
  now: number,
): ExploreBlock | null {
  if (isDefeated(character)) return 'defeated'
  if (character.level < spot.requireLevel) return 'too_low'
  if (status.remaining <= 0) return 'daily_limit'
  if (cooldownLeft(status.cooldownEndsAt, now) > 0) return 'cooldown'
  if (bag && spot.requireItems.some((need) => bagCount(bag, need.itemId) < need.count)) {
    return 'missing_item'
  }
  return null
}

const keysText = (spot: ExploreSpot) =>
  spot.requireItems.map((need) => `${need.count} x ${itemName(need.itemId)}`).join(' and ')

/** The reason shown next to a disabled Explore button (the server's wording). */
export function blockMessage(block: ExploreBlock, spot: ExploreSpot, secondsLeft: number) {
  switch (block) {
    case 'defeated':
      return DEFEATED_REASON
    case 'too_low':
      return `You need level ${spot.requireLevel} to explore there.`
    case 'daily_limit':
      return 'You cannot explore any more today.'
    case 'cooldown':
      return `Resting. You can explore again in ${formatCountdown(secondsLeft)}.`
    case 'missing_item':
      return `You need ${keysText(spot)} to explore there.`
  }
}

/** What a search costs, for the spot list and the confirmation. */
export const costText = (spot: ExploreSpot) =>
  spot.requireItems.length === 0 ? 'Free' : keysText(spot)

export const starText = (star: ExploreStar) =>
  star.level >= MAX_STARS
    ? `All ${MAX_STARS} stars earned`
    : `${star.progress} / ${star.perStar} searches to the next star`

// roleoutsearch.tab `ClipName`: the scene element that opens a field's first spot (the big tree);
// expert spots have none. Not in the imported ini data, so kept here.
const CLIP_EXCEPTIONS: Record<string, string> = { '23011': 'OutCity_1109', '26041': 'OutCity_1109' }
export const exploreClip = (spotId: string) =>
  spotId.endsWith('1') ? (CLIP_EXCEPTIONS[spotId] ?? 'OutCity_1110') : undefined

/** Explore monsters are level variants (n330261) drawn and named like their base (n33026). */
export function exploreMonster(monsterId: string) {
  const id = exploreMonsters[monsterId] ?? monsterId
  return { id, name: plainText(`lg_name_${id}`, 'a monster') }
}

/** Short description of a card (the four the player did not get). */
export function cardText(card: ExploreCard) {
  switch (card.type) {
    case 'fight':
      return `A fight with ${exploreMonster(card.monsterId).name}`
    case 'stone':
      return `${card.amount} Stone`
    case 'game':
      return 'A mini-game'
    case 'nothing':
      return 'Nothing'
    default:
      return itemName(card.itemId)
  }
}

/** What the player's own card brought. */
export function outcomeText({ card, fight }: Pick<ExploreResult, 'card' | 'fight'>) {
  switch (card.type) {
    case 'fight':
      return `You ran into ${exploreMonster(card.monsterId).name} and ${
        fight?.won ? 'won' : 'lost'
      } the fight.`
    case 'stone':
      return `You found a pouch with ${card.amount} Stone.`
    case 'game':
      return 'You found a mini-game. Mini-games are not open yet.'
    case 'nothing':
      return 'You found nothing this time.'
    default:
      return card.granted
        ? `You found ${itemName(card.itemId)}.`
        : `You found ${itemName(card.itemId)}, but it got away.`
  }
}
