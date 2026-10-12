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

/** Sums of skill, buff, equipment and collection bonuses. All default to 0. */
export interface Bonuses {
  strength: number
  agility: number
  stamina: number
  hp: number
  hpMul: number
  mp: number
  mpMul: number
  minAttack: number
  maxAttack: number
  attackMul: number
  atkTimeMul: number
  dodge: number
  dodgeMul: number
  parry: number
  parryMul: number
  hit: number
  crit: number
  critAttach: number
  defense: number
  counter: number
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
}

const idiv = (a: number, b: number) => (b === 0 ? 0 : Math.trunc(a / b))
const BASE_CRIT_ATTACH = 230
const BASE_COUNTER = 5

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
    minAttack: Math.trunc((1 + b('minAttack')) * attackMul * 0.001),
    maxAttack: Math.trunc((1 + b('maxAttack')) * attackMul * 0.001),
    atkTime: Math.trunc(
      avatar.AtkTime / ((1000 + idiv(agility, avatar.AgiAtkAdd) * 10 + b('atkTimeMul')) * 0.001),
    ),
    dodge: Math.trunc((idiv(agility, avatar.DodgeAdd) + b('dodge')) * (100 + b('dodgeMul')) * 0.01),
    parry: Math.trunc(
      (idiv(strength, avatar.StrParryAdd) + b('parry')) * (100 + b('parryMul')) * 0.01,
    ),
    hit: b('hit'),
    crit: b('crit'),
    critAttach: BASE_CRIT_ATTACH + b('critAttach'),
    defense: b('defense'),
    counter: BASE_COUNTER + b('counter'),
    weaponClass: avatar.Popsinger,
  }
}
