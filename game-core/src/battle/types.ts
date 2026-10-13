// Shared types of the fight engine (FightSystem.java, SkillSystem.java, BuffSystem.java).

/**
 * One row of skill.ini (server/data/game/skills.json) plus its section id. Missing keys default
 * like SkillInfo.java does: numbers 0, no script.
 */
export interface SkillInput {
  id: number
  /** 1 active, 2 trigger, 3 passive (ignored in fights). */
  type: number
  quomodo?: number
  probability?: number
  /** Element tree (0-9) whose SkillAdd raises the chance; -1 or absent: none. */
  skilladdtype?: number
  /** skilladd.ini row a passive (type 3) adds to the stats. */
  skilladd?: number
  priority?: number
  effect?: number
  decmp?: number
  canbecounter?: number
  /** Skill level (GetLevel); the ninjutsu scripts pick their numbers by it. */
  level?: number
  mul?: number
  add?: number
  selfmul?: number
  selfadd?: number
  javascript?: string
  /** Id written to the replay (defaults to `id`). */
  secondid?: number
}

export interface FighterInput {
  name: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  minAttack: number
  maxAttack: number
  atkTime: number
  hit: number
  dodge: number
  /** CritMul */
  crit: number
  critAttach: number
  tough: number
  /** ParryMul: chance source of the parry skills 7777 / 8888 */
  parry: number
  pierce: number
  defense: number
  neglectDefense: number
  /** CounterMul: percent chance to strike back after being hit */
  counter: number
  /** PriorityMul: chance to strike first when attacked */
  priority: number
  /** DecDamage: percent less damage taken (capped at 100; negative takes more). */
  decDamage?: number
  /** ReboundAttach: percent of the raw damage reflected to the attacker. */
  rebound?: number
  /** AbsorptionDamage: percent of the raw damage taken that comes back as HP. */
  absorb?: number
  /** VampiricHP / VampiricMP: percent of the damage dealt healed as HP / MP. */
  vampiricHp?: number
  vampiricMp?: number
  /** SkillAdd0 ... SkillAdd9: per-element ninjutsu bonus; ToInt(SkillAddN * 0.01) percent. */
  skillAdd?: number[]
  /**
   * Avatar level used by the execute skills (aoyi). Players: `avatarLevelOf(PlayerAvatarID)`;
   * NPCs: their CounterBombMul when it is not -1. Absent = NPC rule `trunc(level / 3) - 5`.
   */
  avatarLevel?: number
  /**
   * Reborn talents (decision 8): active ones only, levels capped by `talentCap`. Keys 1-8 as in
   * `game-core/src/reborn/talents.ts`.
   */
  talents?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, number>>
  /** HP percent below which the outfit ultimate can fire at a gap of 0 (default 15; 20 at 5 stars). */
  secretThreshold?: number
  /** Clothing != 0 (players) or CounterBombMul > 0 (NPCs): can kick a bomb back (skill 1828). */
  kicksBombs?: boolean
  /** Attack and trigger skills. Absent = the generic skills every fighter has (7777, 8888). */
  skills?: SkillInput[]
}

export type Side = 'attackers' | 'defenders'

/** A buff added to or removed from a fighter (FightValue AddBuff / DelBuff with role index). */
export interface BuffChange {
  role: number
  buff: number
}

/**
 * One replay entry (FightValue). Event ids: 1 begin action, 2 end action, 3 cannot move (stun,
 * freeze, ...), 5 priority strike, 6 bomb kicked back (actor: the kicker), 7 counter, 9 buff tick
 * or buff change, 14 skill, 20 death, 21 next fighter.
 */
export interface FightEvent {
  actor: number
  event: number
  target?: number
  /** Skill id for 5 / 7 / 14, buff id for a ticking buff (event 9). */
  skillId?: number
  /**
   * HP the target loses (TargetLastDamage: after mitigation and absorption, so it can be negative;
   * for the execute skills the script damage).
   */
  damage?: number
  hit?: boolean
  crit?: boolean
  parry?: boolean
  /** HP the actor itself loses, e.g. a poison tick (SelfLastDamage). */
  selfDamage?: number
  /** MP the actor spends (DecMP). */
  decMp?: number
  /** MP the target loses to the strike (TargetDecMP). */
  targetDecMp?: number
  /** The strike ignored defence (IsNeglectDef; the client shows it). */
  neglectDef?: boolean
  /** Rebound the actor takes, after its own mitigation (BackDamage; included in selfDamage). */
  backDamage?: number
  /** HP / MP the actor gains from vampiric strikes or healing scripts (IncHP / IncMP). */
  incHp?: number
  incMp?: number
  /** Damage a shield of the target / of the actor took instead of HP (TargetShield / SelfShield). */
  targetShield?: number
  selfShield?: number
  /** Number of strikes the client animates (AttackCount, skill 40036). */
  attackCount?: number
  addBuffs?: BuffChange[]
  delBuffs?: BuffChange[]
}

export interface Replay {
  seed: number
  fighters: {
    index: number
    side: Side
    name: string
    level: number
    maxHp: number
    startHp: number
    hp: number
    maxMp: number
    startMp: number
    mp: number
  }[]
  events: FightEvent[]
  winner: Side
}

/** UserSkillReturn.java */
export const SKILL_SUCCESS = 0
export const SKILL_NO_MANA = 1
export const SKILL_CANT_USE = 2
export const SKILL_LOSE = 3

export interface ActiveBuff {
  id: number
  saveData: number
  /** SaveData1 (0 when absent). */
  saveData1?: number
  lifeTime: number
  startTime: number
}

/** FightObject: a fighter during the fight. */
export interface Fighter extends FighterInput {
  skillAdd: number[]
  decDamage: number
  rebound: number
  absorb: number
  vampiricHp: number
  vampiricMp: number
  index: number
  side: Side
  startHp: number
  startMp: number
  initAtkTime: number
  /** AtkTimeMul / AtkTimeAdd of FightSystem.ChangeAtkTime. */
  atkTimeMul: number
  atkTimeAdd: number
  initDefense: number
  /** DefenseMul / DefenseAdd of FightSystem.ChangeDefense. */
  defenseMul: number
  defenseAdd: number
  initHit: number
  hitMulAdd: number
  /** InitMinAtk / InitMaxAtk and the MinAtkMul / MaxAtkMul percent of FightSystem.ChangeAtk. */
  initMinAttack: number
  initMaxAttack: number
  minAtkMul: number
  maxAtkMul: number
  next: number
  /** Parry percent set by buffs 11841 / 11824. */
  parryPercent: number
  initDodge: number
  dodgeMulAdd: number
  /** Turn flags lowered by control buffs: <= 0 means no action / no normal attack / no skills. */
  canMove: number
  canAttack: number
  canUseSkill: number
  /** The type 3 buff that holds the shield, its HP left and hits left (-1 unlimited). */
  shieldBuff: ActiveBuff | null
  shieldDamage: number
  shieldCount: number
  buffs: ActiveBuff[] | null
  attackSkills: SkillInput[]
  triggerSkills: SkillInput[]
  opponent: Fighter | null
}

/** The `fightsystem` object the original scripts receive. */
export interface FightContext {
  randInt(min: number, max: number): number
  getDamage(fighter: Fighter): number
  /** FightSystem.Attack: hit, crit, parry, defence, rebound, ..., then HP loss and triggers. */
  attack(
    self: Fighter,
    target: Fighter,
    damage: number,
    fv: FightEvent,
    timer: number,
    selfDamage?: number,
  ): void
  /** FightSystem.Damage(obj, damage): raw HP loss of `victim`, without a FightValue. */
  damage(victim: Fighter, amount: number): void
  /** FightSystem.Damage(obj, damage, fv, timer): raw HP loss that also clears cleartype-1 buffs. */
  damageWithValue(victim: Fighter, amount: number, fv: FightEvent, timer: number): void
  addBuff(
    target: Fighter,
    buffId: number,
    timer: number,
    fv: FightEvent,
    saveData?: number,
    saveData1?: number,
  ): void
  removeBuff(target: Fighter, buffId: number, timer: number, fv: FightEvent): void
  getBuff(target: Fighter, buffId: number): ActiveBuff | undefined
  changeNextAtkTime(target: Fighter, amount: number): void
  changeHit(target: Fighter, add: number): void
  /** ChangeAtkTime: AtkTime = InitAtkTime * 100 / (100 + mul) - add; refused when it would be <= 0. */
  changeAtkTime(target: Fighter, atkTimeMul: number, atkTimeAdd: number): void
  /** ChangeDefense: Defense = InitDefense * (100 + mul) / 100 + add; mul defaults to the current. */
  changeDefense(target: Fighter, defenseAdd: number, defenseMul?: number): void
  changeDodge(target: Fighter, add: number): void
  /** ChangeAtk with MinAtkAdd / MaxAtkAdd kept (nothing ported sets them). */
  changeAtk(target: Fighter, minAtkMul: number, maxAtkMul: number): void
  /** ChangeSkill(skill, id) + UserSkill: use another skill.ini row instead, recorded under its id. */
  changeSkill(
    self: Fighter,
    target: Fighter,
    skill: SkillInput,
    fv: FightEvent,
    timer: number,
  ): number
  /** ChangeSkill(skill, 1) + UserSkill: fall back to the normal attack. */
  normalAttack(self: Fighter, target: Fighter, fv: FightEvent, timer: number): number
}

export type SkillScript = (
  ctx: FightContext,
  self: Fighter,
  target: Fighter,
  fv: FightEvent,
  timer: number,
  /** The skill.ini row being used (always passed by the engine). */
  skill?: SkillInput,
) => number
