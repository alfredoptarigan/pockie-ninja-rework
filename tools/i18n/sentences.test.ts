import { describe, expect, it } from 'vitest'
import { fillTemplate, tierName, toTemplate, validate } from './sentences.ts'

describe('toTemplate', () => {
  it('replaces numbers in text but not in markup or {@n:...} placeholders', () => {
    const text = "Strength +13<font color='#00b034'> Lv.2 </font>{@0:zone} x3"
    expect(toTemplate(text)).toEqual({
      template: "Strength +⟨0⟩<font color='#00b034'> Lv.⟨1⟩ </font>{@0:zone} x⟨2⟩",
      numbers: ['13', '2', '3'],
    })
  })

  it('gives identical templates to texts that differ only in numbers', () => {
    expect(toTemplate('Agility +14').template).toBe(toTemplate('Agility +120').template)
  })
})

describe('fillTemplate', () => {
  it('puts the original numbers back in their slots, even when reordered', () => {
    expect(fillTemplate('Reach level ⟨1⟩ to get ⟨0⟩ Stone', ['50', '10'])).toBe(
      'Reach level 10 to get 50 Stone',
    )
  })
})

describe('validate', () => {
  const template = "Pergi ke<font color='#00b034'> {@0:zone} </font>[line]bunuh ⟨0⟩ monster"

  it('accepts a translation that keeps markup, placeholders and slots', () => {
    expect(
      validate(
        template,
        "Go to<font color='#00b034'> {@0:zone} </font>[line]and defeat ⟨0⟩ monsters",
      ),
    ).toEqual([])
  })

  it('reports lost markup, placeholders or number slots', () => {
    expect(validate(template, 'Go to {@0:zone} and defeat ⟨0⟩ monsters')).toContain(
      'markup or placeholders differ',
    )
    expect(
      validate(template, "Go to<font color='#00b034'> {@0:zone} </font>[line]defeat the monsters"),
    ).toContain('number slots differ')
    expect(validate('Halo', '')).toContain('empty')
  })
})

describe('tierName', () => {
  const names = {
    lg_avatar45: "<font color='#ff8a00'>Naruto Uzumaki +0</font>",
    lg_avatar4005: 'Deidara +0',
  }

  it('derives upgrade tiers from the +0 name for both id ranges', () => {
    expect(tierName('lg_avatar1045', names)).toBe("<font color='#ff8a00'>Naruto Uzumaki +10</font>")
    expect(tierName('lg_avatar145', names)).toBe("<font color='#ff8a00'>Naruto Uzumaki +1</font>")
    expect(tierName('lg_avatar4045', names)).toBe('Deidara +2')
  })

  it('ignores keys that are not outfit tiers', () => {
    expect(tierName('lg_TaskDes_10006', names)).toBeUndefined()
  })
})
