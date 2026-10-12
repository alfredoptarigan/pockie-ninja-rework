/**
 * Seeded random numbers (mulberry32) so a fight can be replayed and tested from its seed.
 * The original used java.util.Random; exact sequences cannot match anyway, only distributions.
 */
export interface Random {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [0, n). */
  int(n: number): number
  /** Integer in [min, max]. */
  between(min: number, max: number): number
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  return { next, int, between: (min, max) => min + int(max - min + 1) }
}
