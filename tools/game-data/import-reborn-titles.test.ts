import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTitles } from './import-reborn-titles.ts'

const root = resolve(import.meta.dirname, '../..')

describe('Reborn titles (serverConfig.titles)', () => {
  it('maps each [stat id, value] line to an equipment term in our units', () => {
    expect(
      buildTitles({
        '0': [],
        '1': [
          [1, 13],
          [2, 13],
          [3, 13],
        ],
        '125': [
          [3, 80],
          [4, 80],
          [9, 60],
          [14, 60],
        ],
        '25': [[105, 20]],
      }),
    ).toEqual({
      '0': [],
      '1': [
        { name: 'StrengthEquip', value: 1300 },
        { name: 'AgilityEquip', value: 1300 },
        { name: 'StaminaEquip', value: 1300 },
      ],
      '25': [{ name: 'ParryMulEquip', value: 20 }],
      '125': [
        { name: 'StaminaEquip', value: 8000 },
        { name: 'DefenseEquip', value: 80 },
        { name: 'MaxHPMulEquip', value: 60 },
        { name: 'MaxMPMulEquip', value: 60 },
      ],
    })
  })

  it('fails loudly on a stat id titles do not map', () => {
    expect(() => buildTitles({ '1': [[18, 5]] })).toThrow(/18/)
  })

  it('ships Reborn table as imported', () => {
    const titles = JSON.parse(
      readFileSync(join(root, 'server/data/game/reborn/titles.json'), 'utf8'),
    ) as Record<string, unknown[]>
    expect(Object.keys(titles)).toHaveLength(116)
    expect(titles['13']).toEqual([
      { name: 'StrengthEquip', value: 500 },
      { name: 'AgilityEquip', value: 500 },
      { name: 'CritMulEquip', value: 16 },
      { name: 'PierceEquip', value: 25 },
    ])
    expect(titles['11']).toBeUndefined()
  })
})
