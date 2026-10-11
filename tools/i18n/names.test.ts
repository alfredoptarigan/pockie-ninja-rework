import { describe, expect, it } from 'vitest'
import type { Candidate } from './build-glossary-candidates.ts'
import { applyName, groupNames, mergeNames } from './names.ts'

const candidates: Candidate[] = [
  { key: 'lg_name_n33017', kind: 'npc', id: 'n33017', source: 'Sunflower', reborn: 'Sunflower' },
  { key: 'lg_name_n33018', kind: 'npc', id: 'n33018', source: 'Sunflower', reborn: 'Sunflower' },
  { key: 'lg_Scene_BackGround_2101', kind: 'scene', id: '2101', source: 'Tambang Batu' },
  {
    key: 'lg_avatar_x',
    kind: 'item',
    id: 'i1',
    source: "<font color='#ff8a00'>Paket Pemula</font>",
  },
]

describe('groupNames', () => {
  it('merges identical names into one unit and orders scenes before NPCs and items', () => {
    const { units, keysByUnit } = groupNames(candidates)
    expect(units.map((u) => [u.kind, u.source])).toEqual([
      ['scene', 'Tambang Batu'],
      ['npc', 'Sunflower'],
      ['item', 'Paket Pemula'],
    ])
    expect(keysByUnit[1]).toEqual(['lg_name_n33017', 'lg_name_n33018'])
  })
})

describe('applyName', () => {
  it('keeps the original markup around the English name', () => {
    expect(applyName("<font color='#ff8a00'>Paket Pemula</font>", 'Newbie Pack')).toBe(
      "<font color='#ff8a00'>Newbie Pack</font>",
    )
    expect(applyName('Tambang Batu', 'Smelting Mountains')).toBe('Smelting Mountains')
  })
})

describe('mergeNames', () => {
  it('fans each unit result out to all of its keys and reports missing units', () => {
    const { keysByUnit } = groupNames(candidates)
    const { glossary, missing } = mergeNames(candidates, keysByUnit, {
      0: { en: 'Smelting Mountains', usedReborn: true },
      1: { en: 'Sunflower', usedReborn: true },
    })
    expect(glossary.lg_name_n33018).toEqual({ kind: 'npc', source: 'Sunflower', en: 'Sunflower' })
    expect(glossary.lg_Scene_BackGround_2101?.en).toBe('Smelting Mountains')
    expect(missing).toEqual([2])
  })
})
