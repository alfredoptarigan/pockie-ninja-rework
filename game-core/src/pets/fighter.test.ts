import { describe, expect, it } from 'vitest'
import { petFighterInput } from './fighter.js'

describe('petFighterInput', () => {
  it('builds FighterInput.pet with Halo and Help rows and sums prop and Pass bonuses', () => {
    const { pet, bonuses } = petFighterInput({
      species: 'i320002',
      avatar: 10050,
      level: 50,
      growth: 120,
      bases: { attack: 14, defence: 8, disturb: 10, active: 10, savvy: 8 },
      skills: [
        { id: 40001, type: 2, ispet: 2 },
        { id: 40058, type: 2, ispet: 1 },
        { id: 40043, type: 3, ispet: 3 },
      ],
      passAdds: [{ DefenseSkill: 10 }],
    })
    expect(pet).toEqual({
      species: 'i320002',
      avatar: 10050,
      level: 50,
      totals: { attack: 854, defence: 488, disturb: 610, active: 610, savvy: 488 },
      skills: [
        { id: 40001, type: 2, ispet: 2 },
        { id: 40058, type: 2, ispet: 1 },
      ],
    })
    expect(bonuses).toMatchObject({
      minAttack: 5,
      maxAttack: 5,
      defense: 64,
      hit: 33,
      dodge: 27,
      crit: 13,
    })
  })
})
