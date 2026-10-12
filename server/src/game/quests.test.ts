import type { Random } from '@pockie/game-core'
import { describe, expect, it } from 'vitest'
import { questItemDrops } from './quests.js'

const roll = (value: number): Random => ({ next: () => 0, int: () => value, between: (min) => min })

describe('questItemDrops (TaskMonsterDrop.ini)', () => {
  // Quest 10004 collects i140006 from n33006 in 2101 at 85%.
  const quests = [{ taskId: 10004, state: 0, progress: [] }]

  it('drops below DropProbability, scaled by the VIP factor', () => {
    expect(questItemDrops(quests, 'n33006', 2101, roll(84))).toEqual(['i140006'])
    expect(questItemDrops(quests, 'n33006', 2101, roll(90))).toEqual([])
    expect(questItemDrops(quests, 'n33006', 2101, roll(90), 1.25)).toEqual(['i140006'])
  })
})
