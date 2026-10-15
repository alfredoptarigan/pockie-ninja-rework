import { expect, it } from 'vitest'
import {
  panelPetSkills,
  panelSkills,
  panelStats,
  replayTechniques,
  techniqueIcon,
} from './battle-hud'
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

const panel = {
  minAttack: 60,
  maxAttack: 71.4,
  atkTime: 1160,
  neglectDefense: 36,
  defense: 248,
  pierce: 2,
  parry: 12,
  hit: 0,
  dodge: 90,
  crit: 74,
  tough: 0,
  skills: [1802, 40106, 2801],
  petSkills: [40106],
}

it('fills the skill grid with the loadout minus the pet skills, or the cast techniques', () => {
  const replay = {
    fighters: [{ panel }, {}],
    events: [{ actor: 1, event: 14, skillId: 1809 }],
  } as unknown as VisualReplay
  expect(panelSkills(replay, 0)).toEqual([1802, 2801])
  expect(panelPetSkills(replay, 0)).toEqual([40106])
  expect(panelSkills(replay, 1)).toEqual([1809])
  expect(panelPetSkills(replay, 1)).toEqual([])
})

it('lists the panel stat rows like Reborn', () => {
  const fighter = { panel } as unknown as VisualReplay['fighters'][number]
  expect(panelStats(fighter)).toEqual([
    [['Attack:', '60 - 71']],
    [['Speed:', '1.16']],
    [
      ['Break:', '36'],
      ['Def:', '248'],
    ],
    [
      ['Pierce:', '2'],
      ['Block:', '12'],
    ],
    [
      ['Hit:', '0'],
      ['Dodge:', '90'],
    ],
    [
      ['Crit:', '74'],
      ['Con:', '0'],
    ],
  ])
  expect(techniqueIcon(40181)).toContain('/40052.webp')
})
