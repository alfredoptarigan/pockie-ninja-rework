import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, fists, potion } from '../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { Inventory } from './Inventory'

describe('Inventory', () => {
  it('uses a potion', async () => {
    let items = [potion, fists]
    const fetchMock = mockApi({
      'GET /api/game/inventory': () => json({ items }),
      [`POST /api/game/items/${potion.id}/use`]: () => {
        items = [{ ...potion, count: 1 }, fists]
        return json({ completed: [], character: { ...character, hp: 160 } })
      },
    })
    renderWithProviders(<Inventory />)

    expect(await screen.findByText('x2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use Healing Powder' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Used Healing Powder.')
    expect(await screen.findByText('Healing Powder')).toBeInTheDocument()
    expect(screen.queryByText('x2')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/game/items/${potion.id}/use`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('equips the class weapon and reports finished quests', async () => {
    let items = [fists]
    mockApi({
      'GET /api/game/inventory': () => json({ items }),
      [`POST /api/game/items/${fists.id}/equip`]: () => {
        items = [{ ...fists, equippedSlot: 'Weapon' }]
        return json({ completed: [90002], character })
      },
    })
    renderWithProviders(<Inventory />)

    await userEvent.click(await screen.findByRole('button', { name: 'Equip Newbie Swiping Fists' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Equipped Newbie Swiping Fists. Quest complete:',
    )
    expect(await screen.findByText('Equipped')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Equip/ })).not.toBeInTheDocument()
  })

  it('shows why an action failed', async () => {
    mockApi({
      'GET /api/game/inventory': () => json({ items: [fists] }),
      [`POST /api/game/items/${fists.id}/equip`]: () =>
        apiError(400, 'wrong_class', 'Your outfit cannot use this kind of weapon.'),
    })
    renderWithProviders(<Inventory />)

    await userEvent.click(await screen.findByRole('button', { name: 'Equip Newbie Swiping Fists' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your outfit cannot use this kind of weapon.',
    )
  })

  it('says when the bag is empty', async () => {
    mockApi({ 'GET /api/game/inventory': () => json({ items: [] }) })
    renderWithProviders(<Inventory />)
    expect(await screen.findByText('Your bag is empty.')).toBeVisible()
  })
})
