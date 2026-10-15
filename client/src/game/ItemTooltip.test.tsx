import type { GearView } from '@pockie/shared'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fists, outfitStats } from '../test/game'
import { imprintLines, ItemPanel } from './ItemTooltip'
import type { InventoryItem } from './types'

// 4th Hokage +4 (i290404): Reborn ISV 1.25, recast cap 1.38, BMV 12 / 14 / 12, Wind Master.
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
    level: 5,
    sellPrice: null,
    stack: 1,
    w: 2,
    h: 2,
    class: 'AvatarItem',
    value: 42,
    outfit: {
      ...outfitStats,
      clothing: 4,
      plus: 4,
      isv: [138, 130, 120],
      maxIsv: [138, 138, 138],
      bmv: [1200, 1400, 1200],
      skills: [10000, 2042],
    },
  },
}
const starred = (stars: number): InventoryItem => ({
  ...hokage,
  info: { ...hokage.info!, outfit: { ...hokage.info!.outfit!, stars } },
})
const panel = (item: InventoryItem, level = 21, gear?: GearView) =>
  render(<ItemPanel entry={{ item, gear }} level={level} />).container

describe("Reborn's outfit tooltip", () => {
  it('shows the weapon type, Synthesis Value and the required level', () => {
    const tooltip = panel(hokage)
    expect(tooltip).toHaveTextContent('Weapon Type:Sharp')
    expect(tooltip).toHaveTextContent('Synthesis Value:42')
    expect(tooltip).toHaveTextContent('Item Type:Outfit')
    expect(tooltip).toHaveTextContent('Required Level:5')
  })

  it("shows each ISV stat with Reborn's floor(20 ISV + 8 ISV * plus + ISV * level)", () => {
    panel(hokage)
    // 20 * 1.38 + 8 * 1.38 * 4 + 1.38 * 21 = 100.74, at the cap: yellow.
    expect(screen.getByText('100 (1.38) | Max (1.38)')).toHaveStyle({ color: '#ffff00' })
    // 1.3 is within 90% of 1.38: green.
    expect(screen.getByText('94 (1.3) | Max (1.38)')).toHaveStyle({ color: '#00ff00' })
    expect(screen.getByText('87 (1.2) | Max (1.38)')).toHaveStyle({
      color: 'rgb(245, 245, 245)',
    })
  })

  it('applies the stars: +5% ISV from one, +1 to the plus from three', () => {
    const tooltip = panel(starred(3))
    // ISV 1.2 * 1.05 = 1.26 at +5: (20 + 40 + 21) * 1.26 = 102.06.
    expect(screen.getByText('102 (1.26) | Max (1.45)')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('Star Bonuses3/5')
    expect(tooltip).toHaveTextContent('★ 1ISV +5%')
    expect(tooltip).toHaveTextContent('★ 2+1 skill slot')
    expect(tooltip).toHaveTextContent('★ 3Outfit +1')
    expect(tooltip).not.toHaveTextContent('★ 4')
    expect(screen.getByLabelText('3 of 5 stars')).toHaveTextContent('★★★')
  })

  it('hides STAR BONUSES without stars', () => {
    expect(panel(hokage)).not.toHaveTextContent('Star Bonuses')
  })

  it('lists the BMV lines and the skill imprints', () => {
    const tooltip = panel(hokage)
    expect(
      screen.getByText('Every 12 points of Strength increases attack by 1% and block by 1 point'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Every 14 points of Agility increases dodge by 1 and speed by 1%'),
    ).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('Wind Master:')
    expect(tooltip).toHaveTextContent('* Increase Wind Damage by 15%.')
    expect(tooltip).toHaveTextContent('Secret Technique:')
  })

  it("writes Reborn's outfit_skill lines, raised by the fourth and fifth stars", () => {
    expect(imprintLines(2002)).toEqual(['Fire Master:', '* Increase Fire Damage by 15%.'])
    expect(imprintLines(2060)).toEqual(['Sealing Basic:', '* Increase Sealing Effects by 5%.'])
    expect(imprintLines(2091, 4)).toEqual(['Healing Expert:', '* Increase Healing by 15%.'])
    expect(imprintLines(10000)).toEqual([
      'Secret Technique:',
      '10% chance to unleash a powerful move when enemy below 15% health.',
    ])
    expect(imprintLines(10000, 5)[1]).toBe(
      '10% chance to unleash a powerful move when enemy below 20% health.',
    )
  })
})

describe("Reborn's pet item tooltip", () => {
  it("shows a stored pet's level and skills from its item", () => {
    const stored: InventoryItem = {
      ...fists,
      itemId: 'i320002',
      nameKey: 'lg_reborn_item_320002',
      info: {
        ...fists.info!,
        kind: 'use',
        equipSlot: undefined,
        class: 'PetItem',
        pet: { nature: 2, level: 12, skills: [{ skillId: 40058, kind: 1 }] },
      },
    }
    const tooltip = panel(stored)
    expect(tooltip).toHaveTextContent('+ 12')
    expect(within(tooltip).getByLabelText('Aura skills').querySelectorAll('img')).toHaveLength(1)
  })

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
