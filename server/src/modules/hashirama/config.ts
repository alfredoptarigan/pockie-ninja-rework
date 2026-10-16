// PLACEHOLDERS: Reborn keeps Hashirama vs Madara's numbers and the Fortune Wheel's catalogue on its
// server (hashiramaState / fortuneWheelOpen; the event was closed live). Everything below is ours
// until the user confirms it. The spec's own values (a 48-hour battle, 24 hours to spend the
// spins, sides final, winner by total damage, a tie pays both sides, the winning side's spins plus
// each side's top 3 bonus, 3 chosen prizes + grand prize + mystery slices, one Unique reward on the
// wheel, a free spin every N paid spins, unbound rewards) live in HASHIRAMA_RULES and the routes.
import type { FortuneRarity, HashiramaSide } from '../../../../shared/src/schemas/hashirama.js'
import type { BuildName } from '../dungeons/bosses.js'

const FIRE = 0
// Scroll skill ids (reborn/scroll-skills.json).
const IZANAGI = 1831
const AMATERASU = 18091

export interface Leader {
  name: string
  /** Reborn pose image (`/assets/reborn/poses/<pose>.webp`). */
  pose: number
  /** Playable clothing id. */
  clothing: number
  build: BuildName
  nation: number
  skills: number[]
}

export interface WheelReward {
  id: string
  itemId?: string
  kind: 'item' | 'spins' | 'bankaiCoins'
  amount: number
  rarity: FortuneRarity
  /** Wins allowed per ninja per event; null = unlimited. */
  max: number | null
}

export const HASHIRAMA_PLACEHOLDERS = {
  /** Ours (Reborn shows no gate). */
  minLevel: 1,
  /** Seconds between attacks (Reborn: "Catch your breath: attack again in Ns"). */
  attackCooldownSeconds: 30,
  /** Rows per side's leaderboard (the window pages 5 at a time). */
  leaderboardSize: 50,
  /** Spins for everyone on the winning side who dealt damage, and each side's top 3 bonus. */
  rewards: { winnerSpins: 5, topSpins: [10, 6, 3] as [number, number, number] },
  /**
   * The leader each side attacks (Madara's side attacks Hashirama and the reverse), scaled on the
   * challenger's level and gear like a dungeon boss, plus `leaderStatMul`. Tuned by simulation
   * (rules.test.ts, levels 30-85): an equally geared ninja with no learned skills never beats a
   * leader and takes off about 40-50% of its HP before falling, so the damage measures the ninja.
   */
  leaders: {
    madara: {
      name: 'Madara Uchiha',
      pose: 170,
      clothing: 170,
      build: 'Bloodluster',
      nation: FIRE,
      skills: [IZANAGI, AMATERASU],
    },
    hashirama: {
      name: 'Hashirama Senju',
      pose: 188,
      clothing: 188,
      build: 'Fortress',
      nation: FIRE,
      skills: [],
    },
  } satisfies Record<HashiramaSide, Leader>,
  leaderStatMul: { hpMul: 2000, attackMul: -300 },
  wheel: {
    goldSpinCost: 50,
    bonusEvery: 10,
    /** Chance in percent of the grand prize slice (0 once won). */
    grandChance: 1,
    /** Chance in percent of a chosen reward's slice, by its rarity; mystery slices share the rest. */
    choiceChance: { common: 20, uncommon: 16, rare: 12, epic: 8, legendary: 4 },
    /**
     * Grand prize per side: that leader's own outfit (Reborn's 290170 / 290188).
     * A ninja without a side gets Hashirama's.
     */
    grand: {
      madara: {
        id: 'grand-madara',
        itemId: 'i290170',
        kind: 'item',
        amount: 1,
        rarity: 'legendary',
        max: 1,
      },
      hashirama: {
        id: 'grand-hashirama',
        itemId: 'i290188',
        kind: 'item',
        amount: 1,
        rarity: 'legendary',
        max: 1,
      },
    } satisfies Record<HashiramaSide, WheelReward>,
    pools: [
      {
        id: 'unique',
        label: 'Unique',
        unique: true,
        rewards: [
          // S-Rank Outfit Wishing Pot, Luxury Pet Box, a wing (Fallen Wings), Kyuubi Naruto outfit
          {
            id: 'u-outfit-pot',
            itemId: 'i160111',
            kind: 'item',
            amount: 1,
            rarity: 'legendary',
            max: 1,
          },
          {
            id: 'u-pet-box',
            itemId: 'i152045',
            kind: 'item',
            amount: 1,
            rarity: 'legendary',
            max: 1,
          },
          { id: 'u-wing', itemId: 'i218000', kind: 'item', amount: 1, rarity: 'legendary', max: 1 },
          {
            id: 'u-kyuubi',
            itemId: 'i290098',
            kind: 'item',
            amount: 1,
            rarity: 'legendary',
            max: 1,
          },
        ] satisfies WheelReward[],
      },
      {
        id: 'extras',
        label: 'Extras',
        unique: false,
        rewards: [
          // Healing / Chakra Draught x5, Level 5 / 10 Exp Bag, Blue Card Pack, Lucky Gem, Legend
          // Wishing Pot, Luxury Outfit Box (named items only: the wheel shows their names)
          { id: 'x-hp', itemId: 'i160010', kind: 'item', amount: 5, rarity: 'common', max: null },
          { id: 'x-mp', itemId: 'i160020', kind: 'item', amount: 5, rarity: 'common', max: null },
          {
            id: 'x-exp',
            itemId: 'i150172',
            kind: 'item',
            amount: 1,
            rarity: 'uncommon',
            max: null,
          },
          { id: 'x-cards', itemId: 'i171002', kind: 'item', amount: 1, rarity: 'rare', max: 5 },
          { id: 'x-gem', itemId: 'i150302', kind: 'item', amount: 1, rarity: 'rare', max: 5 },
          {
            id: 'x-legend-pot',
            itemId: 'i160104',
            kind: 'item',
            amount: 1,
            rarity: 'epic',
            max: 2,
          },
          { id: 'x-exp-10', itemId: 'i150177', kind: 'item', amount: 1, rarity: 'rare', max: null },
          {
            id: 'x-outfit-box',
            itemId: 'i152044',
            kind: 'item',
            amount: 1,
            rarity: 'epic',
            max: 3,
          },
        ] satisfies WheelReward[],
      },
    ],
    /** One picked evenly on a mystery slice. */
    mystery: [
      { id: 'm-spin', kind: 'spins', amount: 1, rarity: 'uncommon', max: null },
      { id: 'm-spins', kind: 'spins', amount: 2, rarity: 'rare', max: null },
      { id: 'm-bankai', kind: 'bankaiCoins', amount: 100, rarity: 'rare', max: null },
      // Level 3 Stone Bag, Level 10 Stone Bag
      { id: 'm-stone-3', itemId: 'i150110', kind: 'item', amount: 1, rarity: 'common', max: null },
      {
        id: 'm-stone-10',
        itemId: 'i152046',
        kind: 'item',
        amount: 1,
        rarity: 'uncommon',
        max: null,
      },
    ] satisfies WheelReward[],
  },
} as const
