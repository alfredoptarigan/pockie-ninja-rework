import { describe, expect, it } from 'vitest'
import { buildCandidates } from './build-glossary-candidates.ts'

const source = {
  lg_Scene_BackGround_2101: 'Tambang Batu',
  lg_Scene_BackGround_121: 'Desa Air',
  lg_name_n33017: 'Sunflower',
  lg_name_n11001: 'Ketua Desa Api dalam aula',
  lg_HP1_itemname: 'Healing Powder',
  lg_avatar45: 'Uzumaki Naruto ＋0',
  lg_name_avatar45: 'Uzumaki Naruto',
  lg_SkillName_101802: 'Sandki No Jutsu',
  lg_Task_10001: 'Latihan Ninjutsu',
  lg_EffortTitle01: 'Murid Ninja',
  lg_name_n99999: '<font color="#fff"> </font>',
}

const reborn = {
  'scene__2101--name': 'Smelting Mountains',
  'scene__211--name': 'Water Village',
  'npc__11001--name': 'Village Elder',
  'monster__33017--name': 'Sunflower',
  'item__160006--name': 'Healing Powder',
  'item__290045--name': 'Naruto Uzumaki',
  'quest__10001--name': 'Ninjutsu Training',
  title__1: 'Beginner Ninja',
}

const candidates = buildCandidates({
  source,
  reborn,
  npcs: {
    n11001: { Name: 'name_n11001' },
    n33017: { Name: 'name_n33017' },
    n99999: { Name: 'name_n99999' },
  },
  items: {
    'i160006 ': { Name: 'HP1_itemname', class: 'PharmacyItem' },
    i290045: { Name: 'avatar45', class: 'AvatarItem' },
  },
})
const byKey = Object.fromEntries(candidates.map((c) => [c.key, c]))

describe('buildCandidates', () => {
  it('suggests Reborn names by id, remapping the renumbered villages', () => {
    expect(byKey.lg_Scene_BackGround_2101?.reborn).toBe('Smelting Mountains')
    expect(byKey.lg_Scene_BackGround_121?.reborn).toBe('Water Village')
  })

  it('looks NPCs up under npc__ first and monster__ second', () => {
    expect(byKey.lg_name_n11001).toMatchObject({
      kind: 'npc',
      id: 'n11001',
      reborn: 'Village Elder',
    })
    expect(byKey.lg_name_n33017?.reborn).toBe('Sunflower')
  })

  it('maps items by trimmed id and outfits through the 2900NN item id', () => {
    expect(byKey.lg_HP1_itemname).toMatchObject({ kind: 'item', id: 'i160006' })
    expect(byKey.lg_name_avatar45).toMatchObject({ kind: 'outfit', reborn: 'Naruto Uzumaki' })
    expect(byKey.lg_avatar45).toBeUndefined()
  })

  it('covers skills, quests and titles, and keeps names without a suggestion', () => {
    expect(byKey.lg_SkillName_101802).toMatchObject({ kind: 'skill', source: 'Sandki No Jutsu' })
    expect(byKey.lg_SkillName_101802?.reborn).toBeUndefined()
    expect(byKey.lg_Task_10001?.reborn).toBe('Ninjutsu Training')
    expect(byKey.lg_EffortTitle01).toMatchObject({ kind: 'title', reborn: 'Beginner Ninja' })
  })

  it('skips names that are empty once HTML tags are removed', () => {
    expect(byKey.lg_name_n99999).toBeUndefined()
  })
})
