import { describe, expect, it } from 'vitest'
import { createRandom } from '../random.js'
import { canPull, comboRule, firstLineup, pullLineup, PULL_COOLDOWN_MS } from './pub-fight.js'

const pool = ['n1', 'n2', 'n3', 'n4', 'n5']
const rules = {
  '10': { MonsterConfig1: 'n1', MonsterConfig2: 'n2', MonsterConfig3: 'n3', RewardGrade: 1 },
  '11': { MonsterConfig1: 'n4', MonsterConfig2: 'n4', MonsterConfig3: 'n4', RewardGrade: 2 },
  '12': { MonsterConfig1: 'n2', MonsterConfig2: 'n5', RewardGrade: 3 },
}

describe('pub fight line-ups (PubMonsterFightSystem)', () => {
  it('the first line-up has three different NPCs from the library', () => {
    for (let seed = 0; seed < 50; seed++) {
      const lineup = firstLineup(pool, createRandom(seed))
      expect(new Set(lineup).size).toBe(3)
      for (const id of lineup) expect(pool).toContain(id)
    }
  })

  it('a pull may repeat NPCs', () => {
    const random = createRandom(4)
    const repeats = Array.from({ length: 200 }, () => pullLineup(pool, random)).filter(
      (lineup) => new Set(lineup).size < 3,
    )
    expect(repeats.length).toBeGreaterThan(0)
  })

  it('matches a sorted 3-combo first, else a 2-combo, else nothing', () => {
    expect(comboRule(['n3', 'n1', 'n2'], rules)).toBe('10')
    expect(comboRule(['n4', 'n4', 'n4'], rules)).toBe('11')
    expect(comboRule(['n5', 'n1', 'n2'], rules)).toBe('12')
    expect(comboRule(['n1', 'n1', 'n3'], rules)).toBeNull()
  })

  it('allows one pull per hour', () => {
    const now = new Date('2026-10-12T12:00:00Z')
    expect(canPull(null, now)).toBe(true)
    expect(canPull(new Date(now.getTime() - PULL_COOLDOWN_MS + 1), now)).toBe(false)
    expect(canPull(new Date(now.getTime() - PULL_COOLDOWN_MS), now)).toBe(true)
  })
})
