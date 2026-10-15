import type { GearView } from '@pockie/shared'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fists, outfitStats } from '../test/game'
import { imprintLines, ItemPanel } from './ItemTooltip'
import type { InventoryItem } from './types'

// 4th Hokage +5 (i290404): AvatarID 404, Strength 6500, ISV 1.25, recast cap 1.55.
const hokage: InventoryItem = {
  id: 'outfit-1',
  itemId: 'i290404',
  count: 1,
  bound: true,
  equippedSlot: null,
  nameKey: 'lg_avatar404',
  info: {
    kind: 'equip',
    equipSlot: 'Outfit',
    level: 7,
    sellPrice: null,
    stack: 1,
    w: 2,
    h: 2,
    class: 'AvatarItem',
    value: 42,
    outfit: {
      ...outfitStats,
      clothing: 4,
      plus: 5,
      base: [6500, 6500, 6500],
      isv: [155, 140, 125],
      maxIsv: [155, 155, 155],
      bmv: [1200, 1400, 1200],
      skills: [1904, 2002],
    },
  },
}
const panel = (item: InventoryItem, level = 21, gear?: GearView) =>
  render(<ItemPanel entry={{ item, gear }} level={level} />).container

describe("Reborn's outfit tooltip", () => {
  it('shows the weapon type, Synthesis Value and the required level', () => {
    const tooltip = panel(hokage)
    expect(tooltip).toHaveTextContent('Weapon Type:Sharp')
    expect(tooltip).toHaveTextContent('Synthesis Value:42')
    expect(tooltip).toHaveTextContent('Item Type:Outfit')
    expect(tooltip).toHaveTextContent('Required Level:7')
  })

  it('shows each ISV stat at the viewer level, coloured against the recast cap', () => {
    panel(hokage)
    // floor((6500 + 21 * 155) / 100) = 97, at the cap: yellow.
    expect(screen.getByText('97 (1.55) | Max (1.55)')).toHaveStyle({ color: '#ffff00' })
    // 1.4 is within 90% of 1.55: green.
    expect(screen.getByText('94 (1.4) | Max (1.55)')).toHaveStyle({ color: '#00ff00' })
    expect(screen.getByText('91 (1.25) | Max (1.55)')).toHaveStyle({ color: 'rgb(245, 245, 245)' })
  })

  it('lists the BMV lines and the skill imprints', () => {
    const tooltip = panel(hokage)
    expect(
      screen.getByText('Every 12 points of Strength increases attack by 1% and block by 1 point'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Every 14 points of Agility increases dodge by 1 and speed by 1%'),
    ).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('Master Fire Techniques:')
    expect(tooltip).toHaveTextContent('The effect of Fire techniques will increase by 15%.')
  })

  it('names imprints from lg_Skill_<id>; Secret Technique gets its 2011 effect', () => {
    expect(imprintLines(2002)).toEqual([
      'Master Fire Techniques:',
      'The effect of Fire techniques will increase by 15%.',
    ])
    expect(imprintLines(1904)).toEqual([
      'Secret Technique:',
      "When the enemy's HP is low, you have a chance to finish them with one hit of a Secret Technique.",
    ])
  })
})

describe("Reborn's pet item tooltip", () => {
  it('shows "<name> + 0", the nature and empty skill rows for a bag pet', () => {
    const toad: InventoryItem = {
      ...fists,
      itemId: 'i320002',
      nameKey: 'lg_reborn_item_320002',
      info: {
        ...fists.info!,
        kind: 'use',
        equipSlot: undefined,
        class: 'PetItem',
        pet: { nature: 6 },
      },
    }
    const tooltip = panel(toad)
    expect(tooltip).toHaveTextContent('+ 0')
    expect(tooltip).toHaveTextContent('Nature:Spirits')
    expect(tooltip).toHaveTextContent('Item Type:Pet')
    expect(within(tooltip).getByLabelText('Aura skills')).toHaveTextContent('Aura:')
    expect(within(tooltip).getByLabelText('Aid skills')).toHaveTextContent('Aid:')
  })
})

describe("Reborn's weapon ENHANCEMENTS", () => {
  const weapon: GearView = {
    baseType: 1,
    enhanceLevel: 6,
    enhanceMax: 12,
    inscribeLevel: 0,
    durability: 100,
    maxDurability: 100,
    appraised: true,
    identifyCount: 0,
    props: [],
    level: 1,
    equipType: 'Weapon',
    weaponType: 'Fists',
    special: [],
    attack: { min: 33, max: 45 },
    enhanceAttack: { min: 13, max: 15 },
    defense: 0,
    maxHp: 0,
    inscription: [],
    sockets: [],
    maxSockets: 0,
    appraiseCost: 0,
    repairCost: 0,
  }

  it('shows the base attack and what the enhance level adds', () => {
    const tooltip = panel(fists, 21, weapon)
    expect(tooltip).toHaveTextContent('Attack Power20 - 30')
    expect(tooltip).toHaveTextContent('Enhanced Level:6 / 16')
    expect(tooltip).toHaveTextContent('Min Attack+13')
    expect(tooltip).toHaveTextContent('Max Attack+15')
  })

  it('hides ENHANCEMENTS until the item is enhanced', () => {
    expect(panel(fists, 21, { ...weapon, enhanceLevel: 0 })).not.toHaveTextContent('Enhancements')
  })
})
