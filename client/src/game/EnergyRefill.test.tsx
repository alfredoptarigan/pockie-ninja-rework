import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { EnergyRefillWindow } from './EnergyRefill'

const window = () => screen.getByRole('dialog', { name: 'Energy Refill' })

describe('EnergyRefillWindow', () => {
  it('lists the refills, the energy to restore and the doubling Gold cost, then refills', async () => {
    const tired = { ...character, gold: 100, energy: { current: 50, max: 200, refillsToday: 1 } }
    const fetchMock = mockApi({
      'POST /api/game/energy/refill': () =>
        json({
          restored: 150,
          character: { ...tired, gold: 30, energy: { current: 200, max: 200, refillsToday: 2 } },
        }),
    })
    const onClose = vi.fn()
    renderWithProviders(<EnergyRefillWindow character={tired} onClose={onClose} />)

    expect(window()).toHaveTextContent('Current: 50/200')
    expect(window()).toHaveTextContent('Refills today:1')
    expect(window()).toHaveTextContent('Energy to restore:+150')
    expect(window()).toHaveTextContent('Current cost:70 Gold')
    expect(window()).toHaveTextContent('Next refill cost:140 Gold')
    expect(window()).toHaveTextContent('Your Gold:100')

    await userEvent.click(within(window()).getByRole('button', { name: 'Refill for 70 Gold' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/energy/refill',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('disables the refill without enough Gold', () => {
    mockApi({})
    renderWithProviders(
      <EnergyRefillWindow
        character={{ ...character, gold: 10, energy: { current: 0, max: 200, refillsToday: 0 } }}
        onClose={vi.fn()}
      />,
    )
    expect(within(window()).getByRole('button', { name: 'Not enough gold' })).toBeDisabled()
  })

  it('says so when the energy is already full', () => {
    mockApi({})
    renderWithProviders(<EnergyRefillWindow character={character} onClose={vi.fn()} />)
    expect(window()).toHaveTextContent('Your energy is already full!')
    expect(within(window()).queryByRole('button', { name: /^Refill/ })).toBeNull()
  })
})
