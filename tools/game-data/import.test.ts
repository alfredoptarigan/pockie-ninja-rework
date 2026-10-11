import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { coerce, groupBy, tableRows, type Row } from './import.ts'

describe('coerce', () => {
  it('turns plain numbers into numbers and leaves everything else alone', () => {
    expect(coerce('42')).toBe(42)
    expect(coerce('-1')).toBe(-1)
    expect(coerce('1.5')).toBe(1.5)
    expect(coerce('007')).toBe('007')
    expect(coerce('i250100')).toBe('i250100')
    expect(coerce('0,100;3,10')).toBe('0,100;3,10')
  })
})

describe('groupBy', () => {
  it('groups index-numbered rows by an id field', () => {
    const rows = {
      '0': { ID: 90000, SetpSeq: 0 },
      '1': { ID: 90001, SetpSeq: 0 },
      '2': { ID: 90000, SetpSeq: 1 },
    }
    expect(groupBy(rows, 'ID')).toEqual({
      '90000': [{ SetpSeq: 0 }, { SetpSeq: 1 }],
      '90001': [{ SetpSeq: 0 }],
    })
  })
})

describe('tableRows', () => {
  it('turns column arrays into rows and can skip the header row', () => {
    const table = { ID: ['ID', '1', '2'], Cloth: ['Cloth', '39', '65'] }
    expect(tableRows(table, { skipHeader: true })).toEqual([
      { ID: 1, Cloth: 39 },
      { ID: 2, Cloth: 65 },
    ])
  })
})

// Spot checks against the committed import (server/data/game), from docs/original-data/*.md.
const data = (name: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../server/data/game', `${name}.json`), 'utf8'),
  )

describe('imported game data', () => {
  it('keeps monster n33017 (Sunflower) as in the original', () => {
    expect(data('npcs').n33017).toMatchObject({
      class: 'NormalNpc',
      Level: 2,
      MaxHP: 15,
      MinAtk: 9,
      MaxAtk: 10,
      AtkTime: 1004,
      NpcExp: 8,
      DropLibID: 3000001,
    })
  })

  it('keeps the first Fire Village tutorial quest and its talk step', () => {
    expect(data('tasks')['90000']).toMatchObject({
      TaskBaseType: 4,
      RequireCountry: 0,
      RewardExp: 5,
      RewardMoney: '0,100;3,10',
      RewardItem: 'i159104,1',
      NextTaskID: 90001,
    })
    const [step] = data('sub-tasks')['90000'] as Row[]
    expect(step).toMatchObject({ SubTaskType: 3, TargetConfiger: 'n11001', SubmitSceneID: 111 })
  })

  it('keeps Naruto base stats and growth', () => {
    expect(data('avatar-stats')['45']).toMatchObject({
      Strength: 2800,
      StrengthUp: 140,
      Agility: 2400,
      AgilityUp: 120,
      Stamina: 2400,
      StaminaUp: 120,
      Popsinger: 4,
    })
    expect(data('avatar-skills').i290045).toMatchObject({ SkillID1: 1945, SkillID4: 2042 })
  })

  it('has the level cap at 90 and the first EXP steps', () => {
    const levels = data('levels')
    expect(levels.role.maxlevel).toBe(90)
    expect(levels.levelexp['2']).toBe(15)
  })

  it('offers 10 starting outfits, 5 per gender', () => {
    const outfits = data('creation-outfits') as Row[]
    expect(outfits).toHaveLength(10)
    expect(outfits.filter((row) => row.Sex === 0)).toHaveLength(5)
  })

  it('maps nations to their village and first field', () => {
    expect(data('nation-scenes')['4']).toEqual({ castle: 131, field: 2301, login: 131 })
  })
})
