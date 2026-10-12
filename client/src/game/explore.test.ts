import { describe, expect, it } from 'vitest'
import { character, potion } from '../test/game'
import {
  blockMessage,
  cardText,
  cooldownLeft,
  exploreBlock,
  exploreClip,
  exploreMonster,
  formatCountdown,
  outcomeText,
  starText,
} from './explore'
import type { ExploreResult, ExploreSpot, ExploreStatus, InventoryItem } from './types'

const NOW = Date.parse('2026-10-12T10:00:00Z')
const free: ExploreSpot = {
  id: '21011',
  nameKey: 'lg_OutSearch_21011',
  requireLevel: 1,
  requireItems: [],
  star: { level: 0, progress: 0, perStar: 2 },
}
const expert: ExploreSpot = {
  ...free,
  id: '21012',
  nameKey: 'lg_OutSearch_21012',
  requireItems: [{ itemId: 'i150046', count: 1 }],
}
const ready: ExploreStatus = { remaining: 7, total: 7, cooldownEndsAt: null }
const key: InventoryItem = { ...potion, itemId: 'i150046', count: 1 }

describe('cooldownLeft', () => {
  it('counts whole seconds up to the end of the rest', () => {
    expect(cooldownLeft('2026-10-12T10:04:59.200Z', NOW)).toBe(300)
    expect(cooldownLeft('2026-10-12T10:00:01Z', NOW)).toBe(1)
  })

  it('is 0 without a cooldown or once it has passed', () => {
    expect(cooldownLeft(null, NOW)).toBe(0)
    expect(cooldownLeft('2026-10-12T09:59:59Z', NOW)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('shows minutes and padded seconds', () => {
    expect(formatCountdown(300)).toBe('5:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(9)).toBe('0:09')
  })
})

describe('exploreBlock', () => {
  const block = (
    overrides: {
      spot?: ExploreSpot
      status?: Partial<ExploreStatus>
      hp?: number
      level?: number
      bag?: InventoryItem[]
    } = {},
  ) =>
    exploreBlock(
      overrides.spot ?? free,
      { ...ready, ...overrides.status },
      { ...character, hp: overrides.hp ?? 100, level: overrides.level ?? 1 },
      overrides.bag,
      NOW,
    )

  it('lets a ready ninja explore', () => {
    expect(block()).toBeNull()
    expect(block({ spot: expert, bag: [key] })).toBeNull()
  })

  it('checks in the server’s order: alive, level, daily searches, rest, keys', () => {
    const everything = {
      spot: { ...expert, requireLevel: 11 },
      status: { remaining: 0, cooldownEndsAt: '2026-10-12T10:03:00Z' },
      bag: [],
      hp: 0,
    }
    expect(block(everything)).toBe('defeated')
    expect(block({ ...everything, hp: 1 })).toBe('too_low')
    expect(block({ ...everything, hp: 1, level: 11 })).toBe('daily_limit')
    expect(
      block({ ...everything, hp: 1, level: 11, status: { ...everything.status, remaining: 1 } }),
    ).toBe('cooldown')
    expect(block({ spot: expert, bag: [] })).toBe('missing_item')
  })

  it('counts every stack of the key and leaves keys to the server while the bag loads', () => {
    const two = { ...expert, requireItems: [{ itemId: 'i150046', count: 2 }] }
    expect(block({ spot: two, bag: [key] })).toBe('missing_item')
    expect(block({ spot: two, bag: [key, { ...key, id: 'other' }] })).toBeNull()
    expect(block({ spot: two, bag: undefined })).toBeNull()
  })

  it('ends the rest when the countdown reaches 0', () => {
    expect(block({ status: { cooldownEndsAt: '2026-10-12T10:00:00Z' } })).toBeNull()
  })
})

describe('blockMessage', () => {
  it('uses the server’s wording, with the time left for a rest', () => {
    expect(blockMessage('defeated', free, 0)).toBe('You were defeated. Revive first.')
    expect(blockMessage('too_low', { ...free, requireLevel: 11 }, 0)).toBe(
      'You need level 11 to explore there.',
    )
    expect(blockMessage('daily_limit', free, 0)).toBe('You cannot explore any more today.')
    expect(blockMessage('cooldown', free, 272)).toBe('Resting. You can explore again in 4:32.')
    expect(blockMessage('missing_item', expert, 0)).toBe(
      'You need 1 x Smelting Mountains Secret Key to explore there.',
    )
  })
})

describe('starText', () => {
  it('shows the searches to the next star, or that all stars are earned', () => {
    expect(starText({ level: 1, progress: 1, perStar: 2 })).toBe('1 / 2 searches to the next star')
    expect(starText({ level: 5, progress: -1, perStar: 2 })).toBe('All 5 stars earned')
  })
})

describe('exploreClip', () => {
  it('points the first spot of a field at its scene clip (roleoutsearch.tab ClipName)', () => {
    expect(exploreClip('21011')).toBe('OutCity_1110')
    expect(exploreClip('23011')).toBe('OutCity_1109')
  })

  it('gives the expert spots no clip', () => {
    expect(exploreClip('21012')).toBeUndefined()
  })
})

describe('exploreMonster', () => {
  it('maps a level variant to the monster it is drawn and named as', () => {
    expect(exploreMonster('n330261')).toEqual({ id: 'n33026', name: 'Sushi' })
    expect(exploreMonster('n99999')).toEqual({ id: 'n99999', name: 'a monster' })
  })
})

describe('cardText', () => {
  it('describes what a card held', () => {
    expect(cardText({ type: 'fight', monsterId: 'n330261' })).toBe('A fight with Sushi')
    expect(cardText({ type: 'stone', amount: 671 })).toBe('671 Stone')
    expect(cardText({ type: 'key', itemId: 'i150046', bound: true })).toBe(
      'Smelting Mountains Secret Key',
    )
    expect(cardText({ type: 'game' })).toBe('A mini-game')
    expect(cardText({ type: 'nothing' })).toBe('Nothing')
  })
})

describe('outcomeText', () => {
  const result = (card: ExploreResult['card'], fight: ExploreResult['fight'] = null) =>
    ({ card, fight }) as ExploreResult

  it('tells the player what their card held', () => {
    expect(outcomeText(result({ type: 'stone', amount: 671, granted: true }))).toBe(
      'You found a pouch with 671 Stone.',
    )
    expect(
      outcomeText(result({ type: 'item', itemId: 'i160006', bound: false, granted: true })),
    ).toBe('You found Healing Powder.')
    expect(
      outcomeText(result({ type: 'pet', itemId: 'i283017', bound: true, granted: false })),
    ).toBe('You found Sunflower +0, but it got away.')
    expect(outcomeText(result({ type: 'game', granted: true }))).toBe(
      'You found a mini-game. Mini-games are not open yet.',
    )
    expect(outcomeText(result({ type: 'nothing', granted: true }))).toBe(
      'You found nothing this time.',
    )
  })

  it('tells how a fight went', () => {
    const card = { type: 'fight' as const, monsterId: 'n330261', granted: true }
    const fight = (won: boolean) => ({ won }) as ExploreResult['fight']
    expect(outcomeText(result(card, fight(true)))).toBe('You ran into Sushi and won the fight.')
    expect(outcomeText(result(card, fight(false)))).toBe('You ran into Sushi and lost the fight.')
  })
})
