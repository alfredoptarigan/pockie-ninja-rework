import type { ForgeInfo, GearView } from '@pockie/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, fists } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ForgeWindow } from './ForgeWindow'
import { borderColor, propText } from './gear'
import { GearIcon } from './GearItem'

const bat = {
  ...fists,
  id: '00000000-0000-7000-8000-000000000010',
  itemId: 'i250104',
  nameKey: 'lg_Equip_Blunt4',
  bound: false,
}

const batGear: GearView = {
  baseType: 1,
  enhanceLevel: 0,
  enhanceMax: 12,
  inscribeLevel: 0,
  durability: 130,
  maxDurability: 130,
  appraised: true,
  identifyCount: 3,
  props: [{ propId: 1, name: 'StrengthEquip', value: 2800 }],
  attack: { min: 34, max: 41 },
  defense: 0,
  maxHp: 0,
  inscription: [],
  appraiseCost: 15,
  repairCost: 0,
}

const info: ForgeInfo = {
  enhanceCost: 8,
  refineCost: 8,
  enhanceRates: { '1': 100, '2': 67 },
  inscribeLevels: { '0': { BaseOdds: 94, FailLevel: 0, AddLevel: 1, StoneCost: 60 } },
  sealOdds: { low: 3, high: 6 },
  talismans: { enhance: 0, refine: 1, lowSeal: 3, highSeal: 0 },
}

describe('gear presentation', () => {
  it('colours borders by property count like ImageGrid', () => {
    expect([0, 1, 2, 3, 4].map((identifyCount) => borderColor({ identifyCount }))).toEqual([
      '#ffffff',
      '#00aeff',
      '#00aeff',
      '#ff8a00',
      '#ffc600',
    ])
    expect(borderColor(undefined)).toBeUndefined()
  })

  it('writes properties in their units', () => {
    expect(propText('StaminaEquip', 2800)).toBe('+28 Stamina')
    expect(propText('MaxHPMulEquip', 43)).toBe('+4.3% Max HP')
    expect(propText('DefenseMulEquip', 5)).toBe('+5% Defense')
    expect(propText('MaxAtkEquip', 25)).toBe('+25 Max Attack')
    expect(propText('SkillAdd0Equip', 1)).toBe('+1 Skill Tree 1 Level')
  })

  it('shows levels, properties, durability and set progress in the tooltip', async () => {
    renderWithProviders(
      <GearIcon
        itemId="i250104"
        nameKey="lg_Equip_Blunt4"
        gear={{
          ...batGear,
          enhanceLevel: 12,
          inscribeLevel: 12,
          attack: { min: 54, max: 66 },
          inscription: [
            { name: 'MaxAtkEquip', value: 25 },
            { name: 'MinAtkEquip', value: 21 },
          ],
          durability: 0,
          set: {
            id: 8160,
            pieces: 7,
            worn: 2,
            bonuses: [
              { pieces: 2, name: 'StaminaEquip', value: 2800 },
              { pieces: 4, name: 'StrengthEquip', value: 2800 },
            ],
          },
        }}
      >
        <button type="button">Bat</button>
      </GearIcon>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Bat' }))
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Mythbeast Bat +12')
    expect(tip).toHaveTextContent('Inscription +12')
    expect(tip).toHaveTextContent('Attack 54 - 66')
    expect(tip).toHaveTextContent('+25 Max Attack (inscription)')
    expect(tip).toHaveTextContent('+28 Strength')
    expect(tip).toHaveTextContent('Durability 0 / 130 (broken: no stats)')
    expect(tip).toHaveTextContent('Set: 2 / 7 worn')
  })
})

describe('ForgeWindow', () => {
  it('enhances a weapon with Gold and reports the new level', async () => {
    const fetchMock = mockApi({
      'GET /api/game/character': () => json({ character: { ...character, gold: 10 } }),
      'GET /api/game/inventory': () => json({ items: [bat] }),
      'GET /api/game/forge/gear': () => json({ gear: { [bat.id]: batGear } }),
      'GET /api/game/forge': () => json(info),
      'POST /api/game/forge/enhance': () =>
        json({
          success: true,
          character: { ...character, gold: 2 },
          item: { ...bat, gear: { ...batGear, enhanceLevel: 1 } },
        }),
    })
    renderWithProviders(<ForgeWindow view="enhance" onClose={() => {}} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mythbeast Bat' }))
    expect(screen.getByText('Next: +1, success rate 100%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enhance' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Mythbeast Bat is now +1.')
    expect(requestBody(fetchMock, 'POST /api/game/forge/enhance')).toEqual({
      itemId: bat.id,
      payment: 'gold',
    })
  })

  it('blocks the talisman payment when the bag has none, and refines on the Refine tab', async () => {
    const fetchMock = mockApi({
      'GET /api/game/character': () => json({ character }),
      'GET /api/game/inventory': () => json({ items: [bat] }),
      'GET /api/game/forge/gear': () => json({ gear: { [bat.id]: batGear } }),
      'GET /api/game/forge': () => json(info),
      'POST /api/game/forge/refine': () => json({ character }),
    })
    renderWithProviders(<ForgeWindow view="enhance" onClose={() => {}} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mythbeast Bat' }))
    await userEvent.click(screen.getByRole('radio', { name: /Talisman/ }))
    expect(screen.getByRole('button', { name: 'Enhance' })).toBeDisabled()
    expect(screen.getByText('You have no talisman for this.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Refine' }))
    const panel = screen.getByRole('tabpanel', { name: 'Refine' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Mythbeast Bat' }))
    await userEvent.click(within(panel).getByRole('radio', { name: /Talisman \(1 in bag\)/ }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Refine' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Refined Mythbeast Bat.')
    expect(requestBody(fetchMock, 'POST /api/game/forge/refine')).toMatchObject({
      payment: 'talisman',
    })
  })

  it('inscribes with seals and shows a failure', async () => {
    const fetchMock = mockApi({
      'GET /api/game/character': () => json({ character }),
      'GET /api/game/inventory': () => json({ items: [bat] }),
      'GET /api/game/forge/gear': () => json({ gear: { [bat.id]: batGear } }),
      'GET /api/game/forge': () => json(info),
      'POST /api/game/forge/inscribe': () =>
        json({ success: false, character, item: { ...bat, gear: batGear } }),
    })
    renderWithProviders(<ForgeWindow view="inscription" onClose={() => {}} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mythbeast Bat' }))
    await userEvent.selectOptions(screen.getByRole('combobox'), '2')
    expect(screen.getByText(/success 100%/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Inscribe' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Inscription failed. It is now +0.')
    expect(requestBody(fetchMock, 'POST /api/game/forge/inscribe')).toEqual({
      itemId: bat.id,
      seal: 'low',
      seals: 2,
    })
  })
})
