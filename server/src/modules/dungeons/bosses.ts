// Reborn's Scroll Dungeons boss pool (chunk 54 `y`/`b`, reborn-lazy-features.md "Scroll Dungeons")
// mapped onto our fighter model. Reborn's boss stats and skills are server-side (unknown), so:
// - Outfit: the boss's Reborn outfit (its pose id is the clothing id) when our data has it; the
//   three our data lacks get the closest outfit we have (noted per row). The outfit gives the
//   avatar stats, the ultimate, 7777/8888 and the passive, as for a player.
// - Level: the challenger's, at least 45 (the unlock level).
// - Gear: the challenger's own equipment bonuses, so the boss scales with the ninja facing it,
//   with at least a same-level weapon's attack (BOSS_WEAPON_PER_LEVEL).
// - Skills: the scroll skills the boss drops (its "unique fighting style").
// - Village passive: the canon village's element for Naruto bosses; none for Bleach and Pain.
// - Build: Reborn names only; BUILDS reads each name as stat bonuses in our Bonuses terms.
import type { Bonuses, FighterInput } from '@pockie/game-core'
import { DUNGEON_RULES, type DungeonDrop } from '../../../../shared/src/schemas/dungeons.js'
import { playerFighterFrom, skillRows } from '../../game/combat.js'
import { outfitForClothing, rebornScrollSkills } from '../../game/data.js'
import { sumBonuses } from '../../game/nonfight-buffs.js'

/** Base chance of every timed scroll (Reborn: all drops 2%). */
export const BASE_CHANCE = 2

interface Build {
  bonuses: Partial<Bonuses>
  /** VampiricMP: percent of the damage dealt that comes back as MP (not a Bonuses term). */
  vampiricMp?: number
}

/**
 * Our reading of Reborn's build names. Mul terms are per mille on top of 1000 (attackMul, hpMul,
 * mpMul, atkTimeMul) or percent of the rating (dodgeMul, defenseMul, ...); the rest are percents.
 * Tuned by simulation: an equally geared level-45 ninja with no learned skills wins 20-80% of the
 * time (the bosses with two scroll skills are the hardest).
 */
export const BUILDS = {
  /** Drinks blood: heals from its hits. */
  Bloodluster: { bonuses: { vampiricHp: 10, hpMul: -150 } },
  /** Big HP and defence, weaker hits. */
  Tank: { bonuses: { hpMul: 200, defenseMul: 20, attackMul: -250 } },
  /** Crits often and hard. */
  Punisher: { bonuses: { critMul: 50, critAttach: 80, hpMul: -100 } },
  /** Reflects damage and strikes back. */
  Rebounder: { bonuses: { rebound: 10, counter: 5, attackMul: -100, hpMul: -100 } },
  /** All attack, little HP. */
  Kamikaze: { bonuses: { attackMul: 300, hpMul: -300 } },
  /** Many small, sure hits. */
  'Chip Damager': { bonuses: { atkTimeMul: 300, hitMul: 20, attackMul: -250 } },
  /** Deep chakra that refills from its hits. */
  'Chakra Eater': { bonuses: { mpMul: 500 }, vampiricMp: 30 },
  /** Raw attack through defence. */
  'Brute Force': {
    bonuses: { attackMul: 200, pierceMul: 30, neglectDefenseMul: 30, dodgeMul: -50, hpMul: -100 },
  },
  /** Defence, parry and toughness; slow. */
  Fortress: {
    bonuses: { defenseMul: 40, parryMul: 30, toughMul: 30, decDamage: 5, atkTimeMul: -250 },
  },
  /** Fast, evasive, strikes first. */
  Speedster: { bonuses: { atkTimeMul: 200, dodgeMul: 20, priority: 10, hpMul: -250 } },
} satisfies Record<string, Build>

export type BuildName = keyof typeof BUILDS

/** Nation indexes (0 Fire, 1 Water, 2 Earth, 3 Wind, 4 Lightning); -1 has no element passive. */
const FIRE = 0
const WATER = 1
const WIND = 3
const NO_VILLAGE = -1

export interface Boss {
  index: number
  name: string
  build: BuildName
  /** Reborn pose image = Reborn's outfit (clothing) id. */
  pose: number
  /** Our outfit (clothing id): stats, skills and replay art. */
  clothing: number
  nation: number
  /** Dropped scroll skills by Reborn name and our skill id. */
  drops: { name: string; skill: number }[]
}

// Scroll skill ids (reborn/scroll-skills.json, skill names from Reborn's locale).
const IZANAGI = 1831
const ART_OF_RINNE_REBIRTH = 1833
const IZANAMI = 1834
const KIRIN = 1835
const SPRENGER = 1836
const WATER_COLLIDING_WAVE = 18041
const SAND_BURIAL = 18042
const REVERSE_LOTUS = 18043
const BLACK_COFFIN = 18044
const SINGLE_BLADE_CREMATION = 18045
const ROYAL_HOLLOW_FLASH = 18046
const AMATERASU = 18091

const POOL: Omit<Boss, 'index'>[] = [
  {
    name: 'Madara Uchiha',
    build: 'Bloodluster',
    pose: 170,
    // Reborn's 290170 is not in our data: Itachi Uchiha (Uchiha, same passive 2082).
    clothing: 49,
    nation: FIRE,
    drops: [
      { name: 'Izanagi', skill: IZANAGI },
      { name: 'Reverse Lotus', skill: REVERSE_LOTUS },
    ],
  },
  {
    name: 'Itachi Uchiha',
    build: 'Tank',
    pose: 49,
    clothing: 49,
    nation: FIRE,
    drops: [
      { name: 'Izanami', skill: IZANAMI },
      { name: 'Amaterasu', skill: AMATERASU },
    ],
  },
  {
    name: 'Kisame Hoshigaki',
    build: 'Punisher',
    pose: 107,
    clothing: 107,
    nation: WATER,
    drops: [{ name: 'Water Colliding Wave', skill: WATER_COLLIDING_WAVE }],
  },
  {
    name: '3rd Form Aizen',
    build: 'Rebounder',
    pose: 75,
    // Our avatar 75 has no stats and no motion art: Sosuke Aizen (same passive 2082).
    clothing: 55,
    nation: NO_VILLAGE,
    drops: [{ name: 'Black Coffin', skill: BLACK_COFFIN }],
  },
  {
    name: 'Hollowified Ichigo',
    build: 'Kamikaze',
    pose: 5,
    clothing: 5,
    nation: NO_VILLAGE,
    drops: [{ name: 'Royal Hollow Flash', skill: ROYAL_HOLLOW_FLASH }],
  },
  {
    name: 'Yamamoto Genryusai',
    build: 'Chip Damager',
    pose: 178,
    // Reborn's 290178 is not in our data: Jiraiya (elder fire user, same passive 2002).
    clothing: 57,
    nation: NO_VILLAGE,
    drops: [{ name: 'Single Blade Cremation', skill: SINGLE_BLADE_CREMATION }],
  },
  {
    // Reborn's pose 6 (its "2nd Release Ulquiorra"); our clothing 6 is that art.
    name: 'White Ulquiorra',
    build: 'Chakra Eater',
    pose: 6,
    clothing: 6,
    nation: NO_VILLAGE,
    drops: [{ name: 'Royal Hollow Flash', skill: ROYAL_HOLLOW_FLASH }],
  },
  {
    name: 'Byakuya Kuchiki',
    build: 'Brute Force',
    pose: 84,
    clothing: 84,
    nation: NO_VILLAGE,
    drops: [{ name: 'Sprenger', skill: SPRENGER }],
  },
  {
    name: 'Pain',
    build: 'Fortress',
    pose: 106,
    clothing: 106,
    nation: NO_VILLAGE,
    drops: [{ name: 'Art of Rinne Rebirth', skill: ART_OF_RINNE_REBIRTH }],
  },
  {
    name: 'Hebi Sasuke',
    build: 'Speedster',
    pose: 111,
    clothing: 111,
    nation: FIRE,
    drops: [
      { name: 'Kirin', skill: KIRIN },
      { name: 'Amaterasu', skill: AMATERASU },
    ],
  },
  {
    name: 'Gaara',
    build: 'Rebounder',
    pose: 46,
    clothing: 46,
    nation: WIND,
    drops: [{ name: 'Sand Burial', skill: SAND_BURIAL }],
  },
]

export const BOSSES: Boss[] = POOL.map((boss, index) => ({ ...boss, index }))

/** A boss's drops as items: our 7-day scroll stands in for Reborn's 3-hour one. */
export function bossDrops(boss: Boss): DungeonDrop[] {
  return boss.drops.map(({ name, skill }) => {
    const scroll = rebornScrollSkills()[String(skill)]!
    return {
      name,
      chance: BASE_CHANCE,
      itemId: scroll.sevenDayItem,
      permanentItemId: scroll.permanentItem,
    }
  })
}

/**
 * PLACEHOLDER, NOT REBORN'S: the boss's least weapon attack per level (about a same-level 2011
 * weapon: 143-170 at 61), used when the challenger's own is lower, so a ninja who takes off their
 * weapon does not face an unarmed boss.
 */
export const BOSS_WEAPON_PER_LEVEL = { minAttack: 2.3, maxAttack: 2.8 }

/** The challenger's gear bonuses with at least BOSS_WEAPON_PER_LEVEL's weapon attack. */
export const armedGear = (gear: Partial<Bonuses>, level: number): Partial<Bonuses> => ({
  ...gear,
  minAttack: Math.max(gear.minAttack ?? 0, Math.round(BOSS_WEAPON_PER_LEVEL.minAttack * level)),
  maxAttack: Math.max(gear.maxAttack ?? 0, Math.round(BOSS_WEAPON_PER_LEVEL.maxAttack * level)),
})

/**
 * The boss as a fighter at `level` with the challenger's gear bonuses (armed at least like a
 * same-level weapon), at full HP and MP.
 */
export function bossFighter(boss: Boss, level: number, gear: Partial<Bonuses>): FighterInput {
  const build: Build = BUILDS[boss.build]
  const { avatarId } = outfitForClothing(boss.clothing)
  const fighter = playerFighterFrom(
    { name: boss.name, avatarId, gender: 0, level, hp: 0, mp: 0, nation: boss.nation },
    [],
    sumBonuses(armedGear(gear, level), build.bonuses),
    skillRows(boss.drops.map((drop) => drop.skill)),
  )
  return {
    ...fighter,
    hp: fighter.maxHp,
    mp: fighter.maxMp,
    ...(build.vampiricMp && { vampiricMp: build.vampiricMp }),
  }
}

export const bossLevel = (challengerLevel: number) =>
  Math.max(DUNGEON_RULES.minLevel, challengerLevel)
