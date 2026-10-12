// Guard: every skill the starting outfits and the 2101-2501 monsters use has a ported script.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { simulateFight, type FighterInput, type SkillInput } from './fight.js'
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
const monsterSkills = ['n33017', 'n33006', 'n33026', 'n32001', 'n32002'].map((id) =>
  Object.values(records[id]!).flatMap((rec) => [values[rec]!.r].flat()),
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
