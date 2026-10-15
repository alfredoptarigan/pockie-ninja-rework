import { expect, it } from 'vitest'
import { replayTechniques, techniqueIcon } from './battle-hud'
import type { VisualReplay } from './companions'

it('shows each fighter’s cast techniques once, excluding pets, normal attacks and status ticks', () => {
  const replay = {
    events: [
      { actor: 0, event: 14, skillId: 1809 },
      { actor: 0, event: 14, skillId: 1809 },
      { actor: 0, event: 14, skillId: 1 },
      { actor: 0, event: 9, skillId: 11802 },
      { actor: 0, event: 14, skillId: 2001, isPet: true },
      { actor: 1, event: 14, skillId: 2002 },
    ],
  } as VisualReplay
  expect(replayTechniques(replay, 0)).toEqual([1809])
  expect(replayTechniques(replay, 1)).toEqual([2002])
  expect(techniqueIcon(3809)).toContain('/1809.webp')
  expect(techniqueIcon(2801)).toContain('/2800.webp')
})
