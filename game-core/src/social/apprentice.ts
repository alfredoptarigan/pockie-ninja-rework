// Master and Apprentice. Reborn has only the Player List's empty "Apprentice" tab and a
// server-side FAQ page "Master and Apprentice" (reborn-windows-M-Z-hud.md "Player List"), so every
// rule below is ours. A request goes to a ninja by name; the levels decide who becomes the master.
// The apprentice graduates at `graduateLevel`, and then both sides get their reward.

/**
 * Every Master and Apprentice value in one place. PLACEHOLDER = Reborn keeps the value on its
 * server (or has none); ours is a guess the product owner must confirm.
 */
export const APPRENTICE_CONFIG = {
  /** PLACEHOLDER: a master must be at least this level. */
  masterMinLevel: 50,
  /** PLACEHOLDER: the lowest level that can take a master (the whisper and mail gate). */
  apprenticeMinLevel: 10,
  /**
   * PLACEHOLDER: the highest level that can take a master. Graduating needs at least 5 more
   * levels, so no one can collect the rewards by apprenticing a ninja about to graduate.
   */
  apprenticeMaxLevel: 35,
  /** PLACEHOLDER: the apprentice graduates on reaching this level. */
  graduateLevel: 40,
  /** PLACEHOLDER: apprentices one master can teach at once. */
  maxApprentices: 3,
  /** PLACEHOLDER: an unanswered request is dropped after 60 s (like trade and team prompts). */
  requestTtlMs: 60_000,
  /** PLACEHOLDER: what each side gets when an apprentice graduates. */
  rewards: {
    master: { stone: 50_000 },
    apprentice: { stone: 20_000 },
  },
} as const

export type ApprenticeRole = 'master' | 'apprentice'

export const canBeMaster = (level: number) => level >= APPRENTICE_CONFIG.masterMinLevel

export const canBeApprentice = (level: number) =>
  level >= APPRENTICE_CONFIG.apprenticeMinLevel && level <= APPRENTICE_CONFIG.apprenticeMaxLevel

/** What the sender of a request would become, or null when the two levels do not fit. */
export function senderRole(fromLevel: number, toLevel: number): ApprenticeRole | null {
  if (canBeMaster(fromLevel) && canBeApprentice(toLevel)) return 'master'
  if (canBeApprentice(fromLevel) && canBeMaster(toLevel)) return 'apprentice'
  return null
}

export const canGraduate = (apprenticeLevel: number) =>
  apprenticeLevel >= APPRENTICE_CONFIG.graduateLevel

const { masterMinLevel, apprenticeMinLevel, apprenticeMaxLevel } = APPRENTICE_CONFIG
/** The refusal when two levels do not fit. */
export const LEVEL_RULE = `A master must be level ${masterMinLevel}+ and an apprentice level ${apprenticeMinLevel}-${apprenticeMaxLevel}.`
