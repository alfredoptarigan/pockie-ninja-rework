// The learnable ninjutsu lists must match skill.ini: active or trigger rows for the ninjutsu,
// passive rows for the element passives.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ELEMENT_PASSIVES, LEARNABLE_NINJUTSU } from './ninjutsu.js'

const skills = JSON.parse(
  readFileSync(new URL('../../../server/data/game/skills.json', import.meta.url), 'utf8'),
) as Record<string, { type: number; level: number }>

describe('ninjutsu id lists (UpSkilCfg.ini)', () => {
  it('lists the 40 learnable ninjutsu as level 1 active or trigger skills', () => {
    expect(new Set(LEARNABLE_NINJUTSU).size).toBe(40)
    for (const id of LEARNABLE_NINJUTSU) {
      expect(skills[id]).toMatchObject({ level: 1 })
      expect([1, 2]).toContain(skills[id]!.type)
    }
  })

  it('lists the 10 element passives as passive skills', () => {
    expect(ELEMENT_PASSIVES).toEqual([2801, 2802, 2803, 2804, 2805, 2806, 2807, 2808, 2809, 2810])
    for (const id of ELEMENT_PASSIVES) expect(skills[id]).toMatchObject({ type: 3, level: 1 })
  })
})
