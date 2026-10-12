// Pure damage formulas from Damage.java / FightSystem.Attack (docs/original-data/battle.md).
// Java float arithmetic is mirrored with Math.fround where the original used floats.
const f = Math.fround

export const hitChance = (dodge: number, hit: number) =>
  dodge <= hit ? 100 : 100 - Math.trunc(f(f(dodge - hit) / 16))

/** Percent chance to crit (0 when CritMul does not beat Tough). */
export const critChance = (critMul: number, tough: number) => {
  const c = critMul - tough
  return c > 0 ? Math.trunc(c / 16) : 0
}

export function applyCrit(damage: number, critAttach: number, c: number) {
  const multiplier = f(f(critAttach + f(f(c * 0.125) * 0.01)) * 0.01)
  return multiplier > 1 ? Math.trunc(f(damage * multiplier)) : damage
}

export const applyParry = (damage: number, parry: number) =>
  parry > 0 ? Math.trunc(damage * (100 - parry) * 0.01) : damage

const DEFENSE_CONSTANT = 1354

export function applyDefense(damage: number, defense: number, neglectDefense: number) {
  const def = f(Math.max(1 - DEFENSE_CONSTANT, defense - neglectDefense))
  return Math.max(0, Math.trunc(f(damage * f(1 - f(def / f(def + DEFENSE_CONSTANT))))))
}
