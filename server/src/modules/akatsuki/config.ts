// PLACEHOLDERS: Reborn keeps the Akatsuki hunt on its server (akatsukiEventAccess,
// akatsukiHuntState: live it answered `{ open: false }` / `{ enabled: false }`, the icon reading
// "Akatsuki Hunt: coming soon"). Everything below is ours until the user confirms it. The spec's
// own values (4 pairs, bait x2 for 1 hour once a day, Reborn's red outfit per member, Zetsu as
// the informant, Obito never met) live in AKATSUKI_RULES and AkatsukiView.
import type { Bonuses } from '@pockie/game-core'
import type { AkatsukiMember, AkatsukiPairKey } from '../../../../shared/src/schemas/akatsuki.js'
import type { BuildName } from '../dungeons/bosses.js'

const FIRE = 0
const WATER = 1
const EARTH = 2
const WIND = 3
const NO_VILLAGE = -1

// Scroll skill ids (reborn/scroll-skills.json) the members fight with.
const ART_OF_RINNE_REBIRTH = 1833
const IZANAMI = 1834
const WATER_COLLIDING_WAVE = 18041
const AMATERASU = 18091

export interface MemberBuild {
  name: string
  /** Our outfit (clothing id): stats, skills, replay art and Reborn pose image. */
  clothing: number
  build: BuildName
  nation: number
  skills: number[]
  /**
   * Reborn's red outfit (redOutfitId 2950xx, its level-60 outfit tier, absent from our data):
   * our same outfit at +21, the AvatarLevel whose UseLevel is 60.
   */
  redOutfit: string
}

export const AKATSUKI_PLACEHOLDERS = {
  /** Reborn: server switch (closed live). Ours: open. */
  open: true,
  /** Ours (Reborn shows no gate): no ambush or hunt under this level. */
  minLevel: 20,
  /** Ambush chance per won field fight, in percent (doubled by bait). */
  ambushChancePercent: 10,
  /** Fight order and pairing (canon partners); the key names the ambush entrance art. */
  pairs: [
    { key: 'clay', members: ['deidara', 'sasori'] },
    { key: 'ritual', members: ['hidan', 'kakuzu'] },
    { key: 'paper', members: ['pain', 'konan'] },
    { key: 'crows', members: ['itachi', 'kisame'] },
  ] satisfies { key: AkatsukiPairKey; members: [AkatsukiMember, AkatsukiMember] }[],
  /**
   * Per mille hpMul / attackMul on both members of pair N (on top of the challenger's own gear
   * bonuses, like a dungeon boss). Tuned by simulation (rules.test.ts) at levels 30-80: an
   * equally geared ninja with no learned skills beats the first pair about 55% of the time, the
   * second 45%, the last two about 30% (fewer at high level).
   */
  pairStatMul: [-300, -290, -300, -305],
  members: {
    deidara: {
      name: 'Deidara',
      clothing: 105,
      build: 'Kamikaze',
      nation: EARTH,
      skills: [],
      redOutfit: 'i2944250',
    },
    sasori: {
      name: 'Sasori',
      clothing: 23,
      build: 'Rebounder',
      nation: WIND,
      skills: [],
      redOutfit: 'i2921230',
    },
    hidan: {
      name: 'Hidan',
      clothing: 104,
      build: 'Bloodluster',
      nation: NO_VILLAGE,
      skills: [],
      redOutfit: 'i2944240',
    },
    kakuzu: {
      name: 'Kakuzu',
      clothing: 103,
      build: 'Tank',
      nation: NO_VILLAGE,
      skills: [],
      redOutfit: 'i2944230',
    },
    itachi: {
      name: 'Itachi',
      clothing: 49,
      build: 'Punisher',
      nation: FIRE,
      skills: [AMATERASU, IZANAMI],
      redOutfit: 'i2921490',
    },
    kisame: {
      name: 'Kisame',
      clothing: 107,
      build: 'Chakra Eater',
      nation: WATER,
      skills: [WATER_COLLIDING_WAVE],
      redOutfit: 'i2944270',
    },
    pain: {
      name: 'Pain',
      clothing: 106,
      build: 'Fortress',
      nation: NO_VILLAGE,
      skills: [ART_OF_RINNE_REBIRTH],
      redOutfit: 'i2944260',
    },
    konan: {
      name: 'Konan',
      clothing: 108,
      build: 'Speedster',
      nation: NO_VILLAGE,
      skills: [],
      redOutfit: 'i2944280',
    },
  } satisfies Partial<Record<AkatsukiMember, MemberBuild>>,
} as const

export const pairBonuses = (pairIndex: number): Partial<Bonuses> => {
  const mul = AKATSUKI_PLACEHOLDERS.pairStatMul[pairIndex]!
  return { hpMul: mul, attackMul: mul }
}
