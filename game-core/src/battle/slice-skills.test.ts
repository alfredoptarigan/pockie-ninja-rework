// Guard: every skill the starting outfits and the 2101-2501 monsters use has a ported script, and
// so does every outfit ultimate with a script in the backup.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type SkillInput } from './fight.js'
import { NEW_ULTIMATE_SKILL_IDS, newUltimateSkill } from './scripts/execute.js'
import { SKILL_SCRIPTS } from './skills.js'

const data = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../../server/data/game/${name}.json`, import.meta.url), 'utf8'),
  ) as T

const skills = data<Record<string, Omit<SkillInput, 'id'>>>('skills')
const row = (id: number): SkillInput => ({ id, ...skills[id]! })

const outfitSkills = data<{ AvatarID: number }[]>('creation-outfits').map(({ AvatarID }) => {
  const add =
    data<Record<string, Record<string, number>>>('avatar-skills')[
      `i29${String(AvatarID).padStart(4, '0')}`
    ]!
  return [add.SkillID1, add.SkillID2, add.SkillID3, add.SkillID4].filter((id) => id! > 0)
})

const records = data<Record<string, Record<string, number>>>('npc-records')
const values = data<Record<string, { r: number | number[] }>>('npc-record-values')
/** Every monster spawned in the 21xx-25xx fields (RefresNpc.ini) that has a skill record. */
const fieldMonsters = Object.entries(data<Record<string, { r: string | string[] }>>('scene-npcs'))
  .filter(([sceneId]) => /^2[1-5]\d\d$/.test(sceneId))
  .flatMap(([, scene]) => [scene.r].flat().map((line) => line.split(',')[0]!))
  .filter((id) => records[id]?.AttackSkill !== undefined || records[id]?.TriggerSkill !== undefined)
const monsterSkills = [...new Set(fieldMonsters)].map((id) =>
  [records[id]!.AttackSkill, records[id]!.TriggerSkill]
    .filter((rec) => rec !== undefined)
    .flatMap((rec) => [values[rec]!.r].flat()),
)

describe('skills of the M2 slice', () => {
  it.each([...outfitSkills, ...monsterSkills].flat().map((id) => [id!]))(
    'skill %i is scripted, script-less or passive',
    (id) => {
      const skill = row(id)
      expect(skill.type).toBeGreaterThan(0)
      if (skill.type !== 3 && skill.javascript) {
        expect(SKILL_SCRIPTS[skill.javascript]).toBeTypeOf('function')
      }
    },
  )

  it('simulates a starting ninja against the field boss with imported skill rows', () => {
    const fighter = (overrides: Partial<FighterInput>): FighterInput => ({
      name: 'x',
      level: 10,
      hp: 300,
      maxHp: 300,
      mp: 300,
      maxMp: 300,
      minAttack: 30,
      maxAttack: 40,
      atkTime: 1000,
      hit: 0,
      dodge: 0,
      crit: 0,
      critAttach: 230,
      tough: 0,
      parry: 0,
      pierce: 0,
      defense: 150,
      neglectDefense: 0,
      counter: 0,
      priority: 0,
      ...overrides,
    })
    const replay = simulateFight({
      attackers: [fighter({ avatarLevel: 0, skills: outfitSkills[3]!.map((id) => row(id!)) })],
      defenders: [fighter({ skills: monsterSkills[4]!.map(row) })],
      seed: 11,
    })
    const used = new Set(replay.events.map((e) => e.skillId))
    expect([...used].some((id) => id && id > 40000)).toBe(true)
    expect(replay).toEqual(
      simulateFight({
        attackers: [fighter({ avatarLevel: 0, skills: outfitSkills[3]!.map((id) => row(id!)) })],
        defenders: [fighter({ skills: monsterSkills[4]!.map(row) })],
        seed: 11,
      }),
    )
  })
})

describe('monster skills in live content', () => {
  // Every file that spawns NPCs into a fight: fields, timed bosses, explore ghosts, toll gates,
  // Las Noches, pub fights and arena tiers. NPC ids are picked out of any string value.
  const spawnFiles = [
    'scene-npcs',
    'scene-timed-npcs',
    'explore-gost-factory',
    'toll-gate-groups',
    'single-gate',
    'pub-fights',
    'arena-tiers',
  ]
  const npcIds = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value === 'string') value.match(/\bn\d+\b/g)?.forEach((id) => npcIds.add(id))
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  spawnFiles.forEach((name) => collect(data(name)))
  const liveSkills = new Set(
    [...npcIds].flatMap((id) =>
      [records[id]?.AttackSkill, records[id]?.TriggerSkill]
        .filter((rec) => rec !== undefined)
        .flatMap((rec) => [values[rec]!.r].flat()),
    ),
  )

  // Known gaps from the 2026-10-13 skills audit (.claude/plans/skills-gaps.plan.md). Remove an id
  // here when its script lands; a new id showing up means live content gained an unported skill.
  const unportedKnown = [5, 6, 7, 8]

  it('has a script for every live monster skill but the known gaps', () => {
    const unported = [...liveSkills]
      .filter((id) => {
        const skill = row(id)
        return (
          skill.type !== 3 && skill.javascript !== undefined && !SKILL_SCRIPTS[skill.javascript]
        )
      })
      .sort((a, b) => a - b)
    expect(unported).toEqual(unportedKnown)
  })
})

describe('outfit ultimates (avatar-skills.json SkillID1)', () => {
  const ultimates = new Set(
    Object.values(data<Record<string, { SkillID1: number }>>('avatar-skills')).map(
      (add) => add.SkillID1,
    ),
  )
  // skill_aoyi_2215.js ... 2220.js are missing from the backup (the server fell back to skill 1).
  const missing = [2215, 2216, 2217, 2218, 2219, 2220]

  it('has a script for every ultimate but the six missing from the backup', () => {
    const unported = [...ultimates].filter((id) => {
      const js = row(id).javascript
      return row(id).type !== 3 && js !== undefined && !SKILL_SCRIPTS[js]
    })
    expect(unported).toEqual(missing)
  })

  it('builds the new ultimate rows exactly like skill.ini', () => {
    for (const id of NEW_ULTIMATE_SKILL_IDS) {
      const { level: _level, skillvalue: _value, ...ini } = skills[id] as Record<string, unknown>
      expect(newUltimateSkill(id)).toEqual({ id, ...ini })
    }
  })
})
