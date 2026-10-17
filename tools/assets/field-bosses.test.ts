import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import bosses from '../../client/src/generated/field-bosses.json'
import roster from '../../server/data/game/reborn/field-bosses.json'
import { paths } from './paths.ts'

it('exports the 21 standing Reborn bosses with outdoor animations', () => {
  expect(Object.keys(roster)).toHaveLength(21)
  for (const scene of ['2702', '2703', '2704', '2801', '2802', '2803', '2804'])
    expect(roster).not.toHaveProperty(scene)
  for (const scene of ['2103', '2203', '2303', '2403', '2503'])
    expect(roster[scene as keyof typeof roster].artId).toBe('n310070')
  for (const [scene, boss] of Object.entries(roster)) {
    const art = bosses[boss.npcId as keyof typeof bosses]
    expect(art, `scene ${scene}: ${boss.npcId}`).toBeDefined()
    expect(art.sheet.frames).toBeGreaterThan(1)
    expect(art.sheet.durations).toHaveLength(art.sheet.frames)
    expect(existsSync(join(paths.assets, art.sheet.file.replace('/assets/', '')))).toBe(true)
  }
})
