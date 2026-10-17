import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import bosses from '../../client/src/generated/field-bosses.json'
import { paths } from './paths.ts'

it('exports a real outdoor animation for every timed field boss', () => {
  const scenes = JSON.parse(
    readFileSync(join(paths.gameData, 'scene-timed-npcs.json'), 'utf8'),
  ) as Record<string, { r: string[] }>
  for (const [scene, rows] of Object.entries(scenes)) {
    const id = rows.r[0]!.split(',')[0]! as keyof typeof bosses
    const art = bosses[id]
    expect(art, `scene ${scene}: ${id}`).toBeDefined()
    expect(art.sheet.frames).toBeGreaterThan(1)
    expect(art.sheet.durations).toHaveLength(art.sheet.frames)
    expect(existsSync(join(paths.assets, art.sheet.file.replace('/assets/', '')))).toBe(true)
  }
})
