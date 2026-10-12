import { describe, expect, it } from 'vitest'
import { createRandom } from './random.js'

describe('createRandom', () => {
  it('is deterministic for a seed', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    )
  })

  it('returns integers in [0, n) and spreads them out', () => {
    const random = createRandom(7)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const value = random.int(10)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(10)
      seen.add(value)
    }
    expect(seen.size).toBe(10)
  })

  it('returns inclusive ranges', () => {
    const random = createRandom(1)
    for (let i = 0; i < 100; i++) {
      const value = random.between(9, 10)
      expect([9, 10]).toContain(value)
    }
  })
})
