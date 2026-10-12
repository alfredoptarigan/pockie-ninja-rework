import { describe, expect, it } from 'vitest'
import type { characters } from '../db/schema.js'
import { expUpdate } from './progress.js'

type CharacterRow = typeof characters.$inferSelect

describe('expUpdate (LevelSystem.AutoAddExp)', () => {
  // AvatarID 3: HP and MP 200 + 20 per level, Stamina 1300 + 65 per level, MaxHP/MPAdd 1400.
  const ninja = { avatarId: 3, level: 1, exp: 0, hp: 5, mp: 7 } as CharacterRow

  it('refills HP and MP to the new maximum on a level-up', () => {
    // Level 1 -> 2 costs 15 EXP; level 2: (int)(240 * (1000 + 1430/1400*10) * 0.001) = 242.
    expect(expUpdate(ninja, 15)).toEqual({ level: 2, exp: 0, hp: 242, mp: 242, levelsGained: 1 })
  })

  it('leaves HP and MP alone without a level-up', () => {
    expect(expUpdate(ninja, 14)).toEqual({ level: 1, exp: 14, hp: 5, mp: 7, levelsGained: 0 })
  })
})
