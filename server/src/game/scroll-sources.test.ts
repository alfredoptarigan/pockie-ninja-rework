// Decision 19 scroll sources: pub-fight combo prize and the S-Rank treasure pool.
import { readFileSync } from 'node:fs'
import { createRandom } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { item } from './data.js'
import { scrollComboPrizes, sevenDayScrolls } from './scroll-sources.js'

describe('scroll combo prizes', () => {
  it('lists the twelve 7-day scrolls', () => {
    expect(sevenDayScrolls()).toHaveLength(12)
    for (const id of sevenDayScrolls()) expect(item(id)).toMatchObject({ ScrollDays: 7 })
  })

  it('awards one 7-day scroll about 5% of the time', () => {
    const random = createRandom(42)
    let hits = 0
    for (let i = 0; i < 20000; i++) {
      const prizes = scrollComboPrizes(random)
      expect(prizes.length).toBeLessThanOrEqual(1)
      if (prizes.length) {
        hits++
        expect(sevenDayScrolls()).toContain(prizes[0]!.itemId)
      }
    }
    expect(hits / 20000).toBeGreaterThan(0.04)
    expect(hits / 20000).toBeLessThan(0.06)
  })
})

describe('S-Rank treasure pool', () => {
  it('holds the 12 permanent scrolls at 1% of the pool weight', () => {
    const data = JSON.parse(
      readFileSync(new URL('./treasure-data.json', import.meta.url), 'utf8'),
    ) as { rewards: { BoxId: string; ItemId: string; Odds: number; Config: number }[] }
    const pool = data.rewards.filter((row) => row.BoxId === 'i159000' && row.Config === 0)
    const scrolls = pool.filter((row) => item(row.ItemId)?.class === 'SkillScrollItem')
    expect(scrolls.map((row) => row.ItemId).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `i${540101 + i}`),
    )
    for (const row of scrolls) expect(item(row.ItemId)).toMatchObject({ ScrollDays: 0 })
    const share =
      scrolls.reduce((sum, row) => sum + row.Odds, 0) / pool.reduce((sum, row) => sum + row.Odds, 0)
    expect(share).toBeCloseTo(0.01, 3)
  })
})
