// Hunt, Chain Attack and Adventure with Jiraiya (reborn-windows-A-L.md "Hunt", "Chain Attack",
// "Chain Attack Progress", "Finish this task instantly?", "Adventure with Jiraiya", "Adventure
// Complete!"; reborn-lazy-features.md "Battle guard"). GET /api/game/{hunt,chain-attack,adventure}.
import { z } from 'zod'
import type { Character, MonsterDrop } from './game.js'

// --- Chain Attack --------------------------------------------------------------------------------

/**
 * Reborn's client: at most 30 monsters, 3 minutes each, Instant Finish costs 5 Gift Certificates
 * per started 3 minutes left. Reborn also spends 1 energy per monster; we have no energy (M3
 * decision 1), so a chain costs nothing to start.
 */
export const CHAIN_ATTACK_RULES = {
  maxMonsters: 30,
  secondsPerMonster: 180,
  instantCouponsPerStep: 5,
} as const

/** Gift Certificates to finish now with `remainingMs` left: 5 x ceil(remaining / 180 s). */
export const instantFinishCost = (remainingMs: number) =>
  remainingMs <= 0
    ? 0
    : CHAIN_ATTACK_RULES.instantCouponsPerStep *
      Math.ceil(remainingMs / 1000 / CHAIN_ATTACK_RULES.secondsPerMonster)

export const chainAttackStartSchema = z
  .object({
    monsterId: z.string().regex(/^n\d+$/, 'Unknown monster.'),
    amount: z.number().int().min(1).max(CHAIN_ATTACK_RULES.maxMonsters),
  })
  .strict()
export type ChainAttackStartInput = z.input<typeof chainAttackStartSchema>

export interface ChainAttack {
  monsterId: string
  nameKey: string
  level: number
  amount: number
  startedAt: string
  endsAt: string
  /** Reborn's "Item Drops Chance" list (names only, as in GET /scene). */
  drops: MonsterDrop[]
}

export interface ChainAttackView {
  chain: ChainAttack | null
}

export interface ChainAttackClaimResult {
  /** Monsters fought (the finished part of the chain; it stops at the first loss). */
  fought: number
  won: number
  rewards: {
    exp: number
    stone: number
    items: { itemId: string; bound: boolean }[]
    levelsGained: number
    lost?: number
  }
  akatsukiAmbush?: { pair: string; members: [string, string] }
  character: Character
}

// --- Hunt ----------------------------------------------------------------------------------------

/** Reborn's client: the Hunt window (150 wide) shows three 50px monster avatars. */
export const HUNT_RULES = { monsters: 3 } as const

/**
 * PLACEHOLDER: Reborn keeps these on its server (the Arena NPC only says it gives "more arena
 * tickets"). Confirm with the user: hunts a UTC day, used arena challenges a finished hunt gives
 * back, and how far below the ninja's level a hunted monster may be.
 */
export const HUNT_PLACEHOLDERS = {
  huntsPerDay: 3,
  arenaTries: 5,
  levelsBelow: 10,
} as const

export interface HuntMonster {
  id: string
  nameKey: string
  level: number
  /** A scene where it spawns (the window travels there). */
  sceneId: number
  killed: boolean
}

export interface HuntView {
  /** Empty while no hunt runs (Reborn hides the window then). */
  monsters: HuntMonster[]
  huntsToday: number
  huntsPerDay: number
  arenaTries: number
}

export interface HuntCompleteResult {
  hunt: HuntView
  /** Used arena challenges given back today (never more than were used). */
  arenaTriesRestored: number
  character: Character
}

// --- Adventure with Jiraiya ----------------------------------------------------------------------

/** Reborn's client: up to 24 hours; a special item at 12h (5%) or 24h (10%). */
export const ADVENTURE_RULES = {
  maxHours: 24,
  specialChances: [
    { hours: 24, percent: 10 },
    { hours: 12, percent: 5 },
  ],
} as const

/**
 * PLACEHOLDER: Reborn keeps these on its server. Confirm with the user: rewards per full hour
 * (character EXP scales with the ninja's level), and the special find (Special Treasure Jar).
 */
export const ADVENTURE_PLACEHOLDERS = {
  charExpPerHourPerLevel: 200,
  bankaiExpPerHour: 100,
  clanExpPerHour: 25,
  specialItemId: 'i152100',
} as const

export interface AdventureRewards {
  charExp: number
  bankaiExp: number
  clanExp: number
}

export interface AdventureView {
  active: boolean
  startedAt: string | null
  /** Full hours so far (0-24). */
  hours: number
  /** What returning now pays. */
  rewards: AdventureRewards
}

export interface AdventureReturnResult {
  story: string
  totalHours: number
  rewards: AdventureRewards
  specialItem: { itemId: string } | null
  adventure: AdventureView
  character: Character
}

// --- Battle guard --------------------------------------------------------------------------------

/** Reborn's `3198.lt()` toasts, sent as the 400 errors of a refused battle. */
export const BATTLE_GUARD = {
  adventure: 'You are on an adventure with Jiraiya! Return from your adventure first.',
  chainAttack: 'Cannot start a battle while chain attack is in progress.',
} as const

/** Reborn's flavour lines (`zh`): the active window rotates them, the return picks a story. */
export const JIRAIYA_LINES = [
  'Exploring the ancient ruins of Uzushiogakure...',
  'Checking out the old Iwagakure rock formations...',
  'Visiting the Great Naruto Bridge in the Land of Waves...',
  'Investigating a hidden cave near Takigakure...',
  "Passing through the Forest of Death for old times' sake...",
  'Studying ancient scrolls at Mount Myōboku...',
  'Sharing stories with merchants at a roadside tea house...',
  "Tracking mysterious footprints near Orochimaru's old hideout...",
  'Training under a waterfall in the Land of Iron...',
  'Observing the sunset from the top of Hokage Rock...',
  'Navigating through the Demon Desert in the Land of Wind...',
  'Gathering medicinal herbs in the Valley of the End...',
  'Crossing the Tenchi Bridge under heavy fog...',
  'Resting at a hot spring village between the Land of Fire and Earth...',
  'Deciphering old stone tablets at the Naka Shrine...',
  'Scouting an abandoned Akatsuki base near Amegakure...',
  'Fishing for giant carp at a lake near Kumogakure...',
  'Climbing the cliffs of the Land of Lightning...',
  'Wandering through the bamboo forests of the Land of Hot Water...',
  'Helping villagers rebuild a bridge destroyed in the last war...',
  "Meditating at the ruins of the Rikudō Sennin's temple...",
  'Exchanging intel with a traveling merchant from Sunagakure...',
  'Dodging wild boars on a forest trail near Konoha...',
  'Mapping uncharted caves beneath the Land of Earth...',
  'Sheltering from a thunderstorm in an old watchtower...',
  'Sparring with Jiraiya near a mountain stream...',
  'Collecting rare mushrooms in the Shikkotsu Forest...',
  'Sneaking past a bandit camp in the Land of Rivers...',
  "Reading Jiraiya's latest manuscript draft by campfire...",
  'Discovering an old Summoning Contract buried in sand...',
  'Visiting the ruins of the Land of Whirlpools...',
  'Following a trail of chakra residue through a canyon...',
  'Negotiating safe passage through a samurai checkpoint...',
  'Investigating reports of a mysterious genjutsu in a nearby village...',
  'Eavesdropping on missing-nin at a border tavern...',
  'Training with toads at a hidden pond south of Konoha...',
  'Sketching maps of an underground river system...',
  'Eating ramen at a famous shop in a small border town...',
  'Watching the stars and plotting the next route from a hilltop...',
  'Dodging traps in an abandoned shinobi training ground...',
  'Trading supplies with a caravan heading to Kirigakure...',
  "Repairing gear at a blacksmith's forge in the countryside...",
  'Listening to local legends about tailed beasts at an inn...',
  'Crossing a rickety rope bridge over a deep ravine...',
  'Tending to an injured hawk found along the road...',
  'Practicing chakra control while walking on a rushing river...',
  'Exploring a hidden library beneath a crumbling fortress...',
  'Helping a lost child find their way back to a farming village...',
  'Decoding a cipher left behind by a former Anbu operative...',
  'Setting up camp under an enormous ancient tree...',
] as const
