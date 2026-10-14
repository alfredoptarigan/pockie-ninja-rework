// Pet core (m6 decisions 15-16): PET_ATTACK skill_chonggong_40001.js, the Pass skill bonuses
// (skilladd rows of `ispet` 3), and the regeneration auras 11861-11863 with their control-buff
// resistance (11888). The remaining Halo and Help scripts are ported by task 6
// (game-core/src/pets/skill-ledger.md).
import { equipBonuses } from '../../equipment/props.js'
import type { Bonuses } from '../../stats.js'
import type { BuffScripts } from '../buffs.js'
import {
  SKILL_SUCCESS,
  type FightContext,
  type Fighter,
  type FightEvent,
  type SkillScript,
} from '../types.js'

const BUFF_FREEZE = 11802
const BUFF_FLAME = 11804
const BUFF_WARM_BLOODED = 11814
const BUFF_PEG = 11840
const BUFF_PARRY = 11841
const BUFF_ICE_BREATH = 11879
export const REGEN_AURAS = [11861, 11862, 11863] as const
const BUFF_AURA_RESIST = 11888
const PET_ATTACK_RATE = 0.75
const FREEZE_BONUS = 200
const LOW_HP_RATE = 0.2

/** skill_chonggong_40001.js: 75% of the master's damage; Ice Breath (11879) may freeze. */
const petAttack: SkillScript = (ctx, self, target, fv, timer) => {
  const peg = ctx.getBuff(target, BUFF_PEG)
  const damage = ctx.getDamage(self) * PET_ATTACK_RATE
  const parry = ctx.getBuff(target, BUFF_PARRY)
  ctx.attack(self, target, damage, fv, timer)
  if (fv.hit !== true || peg) return SKILL_SUCCESS
  const breath = ctx.getBuff(self, BUFF_ICE_BREATH)
  if (!breath || ctx.randInt(0, 99) >= breath.saveData) return SKILL_SUCCESS
  const bonus = FREEZE_BONUS * (1 + 0.01 * Math.trunc(self.skillAdd[1]! * 0.01))
  for (const id of [BUFF_FREEZE, BUFF_FLAME, BUFF_WARM_BLOODED]) {
    if (ctx.getBuff(target, id)) ctx.removeBuff(target, id, timer, fv)
  }
  ctx.addBuff(target, BUFF_FREEZE, timer, fv, bonus, 0)
  if (parry) ctx.addBuff(target, BUFF_PARRY, timer, fv)
  return SKILL_SUCCESS
}

export const PET_CORE_SKILLS: Record<string, SkillScript> = {
  'skill/skill_chonggong_40001.js': petAttack,
}

/** Matches the *Skill names of skilladd.ini (MaxHPMulSKill keeps its original typo). */
const SKILL_TERM = /S[Kk]ill$/

/**
 * SkillSystem.RefreshSkillProperty for the pet's slotted Pass skills: each skilladd row adds its
 * *Skill terms like the *Equip ones. `rows` are the `skillAdd` maps of pet-skills.json.
 */
export function petPassBonuses(
  rows: readonly Readonly<Record<string, number>>[],
): Partial<Bonuses> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    for (const [name, value] of Object.entries(row)) {
      if (!SKILL_TERM.test(name)) continue
      const term = name.replace(SKILL_TERM, 'Equip')
      totals[term] = (totals[term] ?? 0) + value
    }
  }
  return equipBonuses(totals)
}

/**
 * The control buffs' OnAdd (11804, 11808, 11810-11813, 11815, 11820, 11833): under a regeneration
 * aura, `value` (a duration or a burn count) shrinks by the aura's SaveData % 100 percent and 11888
 * is added. The first aura found wins (11861, then 11862, then 11863).
 */
export function regenAuraResist(
  ctx: FightContext,
  self: Fighter,
  value: number,
  fv: FightEvent,
  timer: number,
) {
  const aura = REGEN_AURAS.map((id) => ctx.getBuff(self, id)).find((buff) => buff)
  if (!aura) return value
  const shortened = Math.trunc(value * (100 - (aura.saveData % 100)) * 0.01)
  ctx.addBuff(self, BUFF_AURA_RESIST, timer, fv)
  return shortened
}

/**
 * buff_zaishengguanghuan0-2 (11861-11863): below 20% HP the owner heals SaveData1 percent of
 * MaxHP once and the aura ends (11861 only when SaveData1 is set). The skills that raise
 * SaveData / SaveData1 are task 6's.
 */
const regenAura = (id: number, needsRate: boolean): BuffScripts => ({
  onAdd: (_ctx, _self, buff) => {
    buff.saveData = 0
    buff.saveData1 = 0
  },
  onActivation: (ctx, self, buff, fv, timer) => {
    if (self.hp >= self.maxHp * LOW_HP_RATE) return
    const rate = buff.saveData1 ?? 0
    if (needsRate && rate === 0) return
    const heal = Math.trunc(self.maxHp * rate * 0.01)
    self.hp += heal
    fv.incHp = heal
    ctx.removeBuff(self, id, timer, fv)
  },
  onRemove: (_ctx, self, buff) => {
    self.skillAdd[6] = self.skillAdd[6]! - 100 * Math.trunc(buff.saveData * 0.01)
  },
})

export const PET_CORE_BUFFS: Record<string, BuffScripts> = {
  'buff/buff_zaishengguanghuan0_11861.js': regenAura(11861, true),
  'buff/buff_zaishengguanghuan1_11862.js': regenAura(11862, false),
  'buff/buff_zaishengguanghuan2_11863.js': regenAura(11863, false),
}
