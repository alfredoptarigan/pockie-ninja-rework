// The learnable ninjutsu lists must match skill.ini: active or trigger rows for the ninjutsu,
// passive rows for the element passives.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ELEMENT_PASSIVES, LEARNABLE_NINJUTSU, NATION_PASSIVES, skillChance } from './ninjutsu.js'

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

  it('gives each of the five nations one element passive (NationUpSkill.ini)', () => {
    expect(NATION_PASSIVES).toEqual([2801, 2802, 2803, 2805, 2804])
    for (const id of NATION_PASSIVES) expect(ELEMENT_PASSIVES).toContain(id)
  })
})

describe('skillChance (Reborn cast chance)', () => {
  const add = [0, 0, 0, 3, 0, 0, 0, 0, 0, 1503]

  it('adds SkillAddN of the skill element tree', () => {
    expect(skillChance({ probability: 24, skilladdtype: 3 }, add)).toBe(27)
  })

  it('caps the bonus at 30, so an outfit damage passive adds 30 (Reborn tooltip)', () => {
    expect(skillChance({ probability: 31, skilladdtype: 9 }, add)).toBe(61)
  })

  it('never lets a negative SkillAdd lower the chance', () => {
    expect(skillChance({ probability: 20, skilladdtype: 0 }, [-15])).toBe(20)
  })

  it('uses the plain probability without a tree', () => {
    expect(skillChance({ probability: 40 }, add)).toBe(40)
    expect(skillChance({ probability: 40, skilladdtype: -1 }, add)).toBe(40)
    expect(skillChance({}, add)).toBe(0)
  })
})
