// PLACEHOLDERS: Reborn keeps the Shichibukai attempts, tile odds and effects, rolls per floor, boss
// stats, rewards, card prizes and exchange list on its server (its client only shows them:
// main.js @3707500-3780000). These are ours until the user confirms them. Reborn's own client
// rules are SHICHIBUKAI_RULES (shared/src/schemas/shichibukai.ts); its 9 boards (tile grid,
// paths, chest and boss tiles) are boards.json, copied from its client.
import type { TileEvent } from '../../../../shared/src/schemas/shichibukai.js'

export const SHICHIBUKAI_PLACEHOLDERS = {
  /** Expeditions a day (Reborn's "Attempts"), reset at 00:00 UTC. */
  attemptsPerDay: 3,
  /** Rolls on a floor: ceil(shortest path to the boss / this) + rollsExtra. */
  tilesPerRoll: 3.5,
  rollsExtra: 4,
  /**
   * What an event tile (Reborn's affair 1) holds, by weight; chest tiles (affair 5) are always
   * chests and the end tile is the boss.
   */
  tileWeights: [
    [0, 30],
    [1, 10],
    [2, 10],
    [3, 25],
    [4, 8],
    [6, 7],
    [7, 5],
    [8, 5],
  ] satisfies [TileEvent, number][],
  /** Blessing: + HP and MP percent; Curse: - HP percent; Marauder: - HP percent, then a card. */
  blessingPct: 30,
  cursePct: 20,
  marauderPct: 15,
  /** HP percent a curse or marauder never goes under. */
  minHpPct: 10,
  /** Points tile: this x floor x difficulty. */
  tilePoints: 10,
  /** Whirlpool: carries the ninja 1 to this many tiles further on. */
  whirlpoolReach: 6,
  /**
   * The boss of floor f is the Scroll Dungeons boss f - 1, at the challenger's level (at least 30)
   * with their gear (armed like a dungeon boss) and per mille hpMul / attackMul of
   * difficulty[d - 1] + floorStep * (f - 1) + power[p]. The ninja fights at the run's HP and MP.
   * Tuned by simulation (rules.test.ts): an equally geared level-30 ninja with no learned skills
   * at full HP wins Easy floor 1 at 100% about 9 in 10 times, Easy floor 9 at 100% about 3 in 5,
   * Nightmare floor 1 at 100% about 2 in 5 and Nightmare floor 9 at 150% almost never.
   */
  bossMul: {
    difficulty: [-150, -100, -50, 0],
    floorStep: 15,
    power: { 50: -150, 100: 0, 150: 100 },
  },
  /** Stars by boss power (Reborn: "the boss's power decides your score"). */
  stars: { 50: 1, 100: 3, 150: 5 },
  /** Boss EXP: expPerLevel x boss level x (1 + (floor - 1) / 4) x difficulty x power / 100. */
  expPerLevel: 40,
  /** Boss points: pointsPerFloor x floor x difficulty x power / 100. */
  pointsPerFloor: 50,
  /**
   * Card prizes: five drawn (with repeats) from the entries whose `floor` is at most the run's
   * floor. Items from the Tsunade Pub pool.
   */
  cardPrizes: [
    { itemId: 'i160010', floor: 1 }, // Healing Draught
    { itemId: 'i160020', floor: 1 }, // Chakra Draught
    { itemId: 'i150110', floor: 1 }, // Level 3 Stone Bag
    { itemId: 'i150172', floor: 1 }, // Level 5 Exp Bag
    { itemId: 'i100004', floor: 1 }, // Seal Breaker
    { itemId: 'i150112', floor: 3 }, // Level 5 Stone Bag
    { itemId: 'i150177', floor: 3 }, // Level 10 Exp Bag
    { itemId: 'i120002', floor: 4 }, // Exp Seal
    { itemId: 'i160102', floor: 5 }, // Blue Outfit Wishing Pot
    { itemId: 'i152046', floor: 6 }, // Level 10 Stone Bag
    { itemId: 'i150302', floor: 7 }, // Lucky Gem
    { itemId: 'i171002', floor: 8 }, // Blue Card Pack
    { itemId: 'i160103', floor: 9 }, // Orange Outfit Wishing Pot
  ],
  /**
   * Exchange (Reborn's "Supply" ship): points for items. Reborn sells its Shichibukai / Royal
   * Shichibukai gear (item ids 334730-334749), which our data does not have.
   */
  exchange: [
    { itemId: 'i150177', points: 300 }, // Level 10 Exp Bag
    { itemId: 'i120002', points: 600 }, // Exp Seal
    { itemId: 'i150302', points: 1_500 }, // Lucky Gem
    { itemId: 'i171002', points: 2_500 }, // Blue Card Pack
    { itemId: 'i160103', points: 4_000 }, // Orange Outfit Wishing Pot
    { itemId: 'i160111', points: 8_000 }, // S-Rank Outfit Wishing Pot
    { itemId: 'i159102', points: 10_000 }, // Recast Talisman*3
    { itemId: 'i160104', points: 20_000 }, // Legend Wishing Pot
  ],
} as const
