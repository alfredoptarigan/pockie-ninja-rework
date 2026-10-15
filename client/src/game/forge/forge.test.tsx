import type { ForgeInfo, GearView } from '@pockie/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, fists } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ForgeWindow } from './ForgeWindow'
import { PortableFunctionWindow } from './PortableFunction'
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
  props: [{ propId: 1, name: 'StrengthEquip', value: 2800, min: 2800, max: 3400, tier: 1 }],
  level: 13,
  equipType: 'Weapon',
  weaponType: 'Blunt',
  special: [],
  attack: { min: 34, max: 41 },
  defense: 0,
  maxHp: 0,
  inscription: [],
  sockets: [],
  maxSockets: 3,
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

const forgeApi = (extra: Record<string, () => Response> = {}, gold = 10) =>
  mockApi({
    'GET /api/game/character': () => json({ character: { ...character, gold } }),
    'GET /api/game/inventory': () => json({ items: [bat] }),
    'GET /api/game/forge/gear': () => json({ gear: { [bat.id]: batGear } }),
    'GET /api/game/forge': () => json(info),
    ...extra,
  })

describe('ForgeWindow (Reborn Armory)', () => {
  it('pays in the Enhancement dialog, then shows the Enhancement Result', async () => {
    const fetchMock = forgeApi({
      'POST /api/game/forge/enhance': () =>
        json({
          success: true,
          character: { ...character, gold: 2 },
          item: { ...bat, gear: { ...batGear, enhanceLevel: 1 } },
        }),
    })
    renderWithProviders(<ForgeWindow onClose={() => {}} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Mythbeast Bat' }))
    const panel = screen.getByRole('tabpanel', { name: 'Enhance' })
    expect(within(panel).getByText('Rate 100%')).toBeVisible()
    expect(within(panel).getByText('Min Atk: 34')).toBeVisible()
    await userEvent.click(within(panel).getByRole('button', { name: 'Attempt' }))

    const pay = screen.getByRole('dialog', { name: 'Enhancement' })
    expect(pay).toHaveTextContent('Enhancement cost: 8 Gold / 8 Coupons')
    // Reborn's default: a talisman if owned, else Coupons when affordable.
    expect(within(pay).getByRole('radio', { name: 'Your Coupons: 10' })).toBeChecked()
    expect(within(pay).getByRole('radio', { name: 'Use Strengthening Talisman' })).toBeDisabled()
    await userEvent.click(within(pay).getByRole('radio', { name: 'Your Gold: 10' }))
    await userEvent.click(within(pay).getByRole('button', { name: 'OK' }))

    const result = await screen.findByRole('dialog', { name: 'Enhancement Result' })
    expect(await within(result).findByRole('status')).toHaveTextContent('Mythbeast Bat is now +1.')
    expect(within(result).getByText('If successful:')).toBeVisible()
    expect(requestBody(fetchMock, 'POST /api/game/forge/enhance')).toEqual({
      itemId: bat.id,
      payment: 'gold',
    })
  })

  it('auto-enhances to the chosen level and stops there', async () => {
    let level = 0
    const fetchMock = forgeApi(
      {
        'POST /api/game/forge/enhance': () => {
          level += 1
          return json({
            success: true,
            character: { ...character, gold: 100 },
            item: { ...bat, gear: { ...batGear, enhanceLevel: level } },
          })
        },
      },
      100,
    )
    renderWithProviders(<ForgeWindow onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Mythbeast Bat' }))
    await userEvent.click(screen.getByRole('button', { name: 'Attempt' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Your Gold: 100' }))
    await userEvent.click(screen.getByRole('button', { name: 'OK' }))
    const result = await screen.findByRole('dialog', { name: 'Enhancement Result' })
    await within(result).findByText('Mythbeast Bat is now +1.')

    await userEvent.click(within(result).getByRole('button', { name: 'Auto' }))
    const auto = screen.getByRole('dialog', { name: 'Auto Enhance' })
    const target = within(auto).getByRole('spinbutton', { name: 'Enhance to Level' })
    await userEvent.clear(target)
    await userEvent.type(target, '3')
    await userEvent.click(within(auto).getByRole('button', { name: 'Start' }))

    await waitFor(
      () => expect(within(result).getByText('Mythbeast Bat is now +3.')).toBeVisible(),
      {
        timeout: 3000,
      },
    )
    expect(within(result).getByRole('button', { name: 'Auto' })).toBeEnabled()
    const attempts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(attempts).toHaveLength(3)
  })

  it('lists the Refinement Info lines and refines with a talisman', async () => {
    const fetchMock = forgeApi({ 'POST /api/game/forge/refine': () => json({ character }) })
    renderWithProviders(<ForgeWindow onClose={() => {}} />)

    await userEvent.click(await screen.findByRole('tab', { name: 'Refine' }))
    const panel = screen.getByRole('tabpanel', { name: 'Refine' })
    expect(within(panel).getByText('No item selected')).toBeVisible()
    await userEvent.click(within(panel).getByRole('button', { name: 'Mythbeast Bat' }))
    expect(within(panel).getByText('Strength: +28 (28 - 34) T1')).toBeVisible()
    await userEvent.click(within(panel).getByRole('button', { name: 'Attempt' }))

    const pay = screen.getByRole('dialog', { name: 'Refinement' })
    expect(pay).toHaveTextContent('Refinement price depends on current level.')
    expect(within(pay).getByRole('radio', { name: 'Refining Talismans: 1' })).toBeChecked()
    await userEvent.click(within(pay).getByRole('button', { name: 'OK' }))

    expect(await within(panel).findByRole('status')).toHaveTextContent('Refined Mythbeast Bat.')
    expect(requestBody(fetchMock, 'POST /api/game/forge/refine')).toEqual({
      itemId: bat.id,
      payment: 'talisman',
    })
  })
})

describe('PortableFunctionWindow', () => {
  it('offers only Inscribe and inscribes with seals', async () => {
    const fetchMock = forgeApi({
      'POST /api/game/forge/inscribe': () =>
        json({ success: false, character, item: { ...bat, gear: batGear } }),
    })
    renderWithProviders(<PortableFunctionWindow onClose={() => {}} />)

    for (const tab of ['Synthesis', 'Recast', 'Impress']) {
      const button = screen.getByRole('tab', { name: tab })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', `${tab}: not available yet`)
    }
    expect(screen.getByRole('tab', { name: 'Inscribe' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(await screen.findByRole('button', { name: 'Mythbeast Bat' }))
    expect(screen.getByText('Current Lv.0')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Advanced Talisman' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Low Level' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Rate: 94%')).toBeVisible()
    expect(screen.getByText('Stones: 60')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'More seals' }))
    await userEvent.click(screen.getByRole('button', { name: 'More seals' }))
    expect(screen.getByText('Rate: 100%')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Attempt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Inscription failed. It is now +0.')
    expect(screen.getByText('Failure')).toBeVisible()
    expect(requestBody(fetchMock, 'POST /api/game/forge/inscribe')).toEqual({
      itemId: bat.id,
      seal: 'low',
      seals: 2,
    })
  })
})
