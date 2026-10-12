import { describe, expect, it } from 'vitest'
import levels from '../../../server/data/game/levels.json'
import glossary from '../../../tools/i18n/glossary.json'
import sprites from '../generated/sprites.json'
import { landingCopy, LANDING_LEVEL_CAP } from './landing-copy'

it('uses the original level cap in both legacy seed sentences', () => {
  expect(LANDING_LEVEL_CAP).toBe(levels.role.maxlevel)
  expect(landingCopy('We keep the level cap at 100, just like the original.')).toBe(
    'We keep the level cap at 90, just like the original.',
  )
  expect(landingCopy('A level table that tops out at 100.')).toBe(
    'A level table that tops out at 90.',
  )
  expect(landingCopy('The level cap is 90. Over 100 items await.')).toBe(
    'The level cap is 90. Over 100 items await.',
  )
})

describe('landing character names', () => {
  const ids = { naruto: 45, ichigo: 1, sasuke: 48, rukia: 74, gaara: 46 } as const
  it('matches every sprite name to the canonical glossary entry', () => {
    const names = glossary as Record<string, { en: string }>
    for (const [slug, id] of Object.entries(ids))
      expect(sprites[slug as keyof typeof sprites].name).toBe(names[`lg_name_avatar${id}`]!.en)
  })

  it('corrects old names without changing ordinary copy', () => {
    expect(
      landingCopy('From Uzumaki Naruto and Uchiha Sasuke to Kurosaki Ichigo and Kuchiki Rukia.'),
    ).toBe('From Naruto Uzumaki and Sasuke Uchiha to Ichigo Kurosaki and Rukia Kuchiki.')
    expect(landingCopy('Naruto Uzumaki, Gaara, and 100 rewards.')).toBe(
      'Naruto Uzumaki, Gaara, and 100 rewards.',
    )
  })
})

const legacyScenes = [
  ['Forge Highlands', 2101],
  ['Sunset Wasteland', 2102],
  ['Blazing Gorge', 2103],
  ['Green Path', 2201],
  ['Flowing Blossom River', 2202],
  ['Thousand Peaks', 2301],
  ['Thunder Ladder', 2302],
  ['Dragon Tamer Valley', 2801],
  ['Endless Night Ruins', 2701],
  ['Endless Night', 2701],
  ['Valley of Lost Souls', 2702],
  ['Plain of Despair', 2704],
] as const
it.each(legacyScenes)('matches legacy scene %s to glossary scene %i', (oldName, id) => {
  const names = glossary as Record<string, { en: string }>
  expect(landingCopy(oldName)).toBe(names[`lg_Scene_BackGround_${id}`]!.en)
})
