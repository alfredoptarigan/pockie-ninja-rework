/**
 * Character combat stats, ported from RefreshSystem.java (see docs/original-data/characters.md).
 * Integer divisions and the double-then-int casts follow the Java code.
 */

/** One row of RoleInitProperty.ini (server/data/game/avatar-stats.json), original field names. */
export interface AvatarStats {
  Strength: number
  StrengthUp: number
  Agility: number
  AgilityUp: number
  Stamina: number
  StaminaUp: number
  MaxHP: number
  MaxHPUp: number
  MaxHPAdd: number
  MaxMP: number
  MaxMPUp: number
  MaxMPAdd: number
  StrAtkAdd: number
  AgiAtkAdd: number
  DodgeAdd: number
  StrParryAdd: number
  AtkTime: number
  Popsinger: number
}

/** SkillAdd0..9 (`allskilladdN`, RefreshSystem.java 381-390): one per skill element tree. */
export const SKILL_ADD_COUNT = 10
export type SkillAddKey = `skillAdd${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`

/**
 * Sums of skill, buff, equipment and collection bonuses. All default to 0. Names follow the
 * RefreshSystem terms: `x` is the `xMul` rating add, `xMul` its `xMulMul` percent multiplier.
 */
export interface Bonuses extends Record<SkillAddKey, number> {
  strength: number
  agility: number
  stamina: number
  hp: number
  hpMul: number
  mp: number
  mpMul: number
  minAttack: number
  maxAttack: number
  /** AbsAddAtkMul: added to both attack multipliers. */
  attackMul: number
  minAttackMul: number
  maxAttackMul: number
  atkTimeMul: number
  dodge: number
  dodgeMul: number
  parry: number
  parryMul: number
  hit: number
  hitMul: number
  crit: number
  critMul: number
  critAttach: number
  defense: number
  defenseMul: number
  pierce: number
  pierceMul: number
  tough: number
  toughMul: number
  neglectDefense: number
  neglectDefenseMul: number
  counter: number
  counterBomb: number
  vampiricHp: number
  decDamage: number
  absorb: number
  rebound: number
  priority: number
  luck: number
  expMul: number
  capMul: number
  dropMul: number
}

export interface CombatStats {
  level: number
  strength: number
  agility: number
  stamina: number
  maxHp: number
  maxMp: number
  minAttack: number
  maxAttack: number
  atkTime: number
  dodge: number
  parry: number
  hit: number
  crit: number
  critAttach: number
  defense: number
  counter: number
  weaponClass: number
  // Named like the FighterInput fields they feed.
  pierce: number
  tough: number
  neglectDefense: number
  priority: number
  decDamage: number
  rebound: number
  absorb: number
  vampiricHp: number
  counterBomb: number
  luck: number
  /** SkillAdd0..9 (×100: 3000 = +30% in the skill scripts). */
  skillAdd: number[]
  expMul: number
  capMul: number
  dropMul: number
}

const idiv = (a: number, b: number) => (b === 0 ? 0 : Math.trunc(a / b))
const BASE_CRIT_ATTACH = 230
const BASE_COUNTER = 5
/** `(int)(rating * (100 + percent) * 0.01)`, the shape of every MulMul term. */
const percentOf = (rating: number, percent: number) => Math.trunc(rating * (100 + percent) * 0.01)

export function deriveStats(
  avatar: AvatarStats,
  level: number,
  bonuses: Partial<Bonuses> = {},
): CombatStats {
  const b = (key: keyof Bonuses) => bonuses[key] ?? 0
  const strength = avatar.Strength + level * avatar.StrengthUp + b('strength')
  const agility = avatar.Agility + level * avatar.AgilityUp + b('agility')
  const stamina = avatar.Stamina + level * avatar.StaminaUp + b('stamina')

  const hpBase = avatar.MaxHP + level * avatar.MaxHPUp + b('hp')
  const mpBase = avatar.MaxMP + level * avatar.MaxMPUp + b('mp')
  const attackMul = 1000 + idiv(strength, avatar.StrAtkAdd) * 10 + b('attackMul')

  return {
    level,
    strength,
    agility,
    stamina,
    maxHp: Math.trunc(hpBase * (1000 + idiv(stamina, avatar.MaxHPAdd) * 10 + b('hpMul')) * 0.001),
    maxMp: Math.trunc(mpBase * (1000 + idiv(stamina, avatar.MaxMPAdd) * 10 + b('mpMul')) * 0.001),
    // 359-360
    minAttack: Math.trunc((1 + b('minAttack')) * (attackMul + b('minAttackMul')) * 0.001),
    maxAttack: Math.trunc((1 + b('maxAttack')) * (attackMul + b('maxAttackMul')) * 0.001),
    atkTime: Math.trunc(
      avatar.AtkTime / ((1000 + idiv(agility, avatar.AgiAtkAdd) * 10 + b('atkTimeMul')) * 0.001),
    ),
    dodge: percentOf(idiv(agility, avatar.DodgeAdd) + b('dodge'), b('dodgeMul')),
    parry: percentOf(idiv(strength, avatar.StrParryAdd) + b('parry'), b('parryMul')),
    hit: percentOf(b('hit'), b('hitMul')), // 363
    crit: percentOf(b('crit'), b('critMul')), // 364
    critAttach: BASE_CRIT_ATTACH + b('critAttach'),
    defense: percentOf(b('defense'), b('defenseMul')), // 370
    counter: BASE_COUNTER + b('counter'),
    weaponClass: avatar.Popsinger,
    pierce: percentOf(b('pierce'), b('pierceMul')), // 369
    tough: percentOf(b('tough'), b('toughMul')), // 379
    neglectDefense: percentOf(b('neglectDefense'), b('neglectDefenseMul')), // 366-367
    // 371-380, 391-393: plain sums.
    priority: b('priority'),
    decDamage: b('decDamage'),
    rebound: b('rebound'),
    absorb: b('absorb'),
    vampiricHp: b('vampiricHp'),
    counterBomb: b('counterBomb'),
    luck: b('luck'),
    skillAdd: Array.from({ length: SKILL_ADD_COUNT }, (_, i) => b(`skillAdd${i}` as SkillAddKey)),
    expMul: b('expMul'),
    capMul: b('capMul'),
    dropMul: b('dropMul'),
  }
}
