import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { character } from '../test/game'
import { renderWithProviders } from '../test/utils'
import { PlayerCard } from './Hud'

const card = () => screen.getByRole('region', { name: 'Character' })

describe('PlayerCard VIP badge', () => {
  it('shows VIP with its expiry date while VIP lasts', () => {
    renderWithProviders(
      <PlayerCard character={{ ...character, vipUntil: '2099-11-11T08:00:00Z' }} />,
    )
    const badge = within(card()).getByText('VIP')
    expect(badge).toHaveAttribute('title', 'VIP until Nov 11, 2099')
  })

  it('shows no badge without VIP or once it has expired', () => {
    const { unmount } = renderWithProviders(<PlayerCard character={character} />)
    expect(within(card()).queryByText('VIP')).toBeNull()
    unmount()
    renderWithProviders(
      <PlayerCard character={{ ...character, vipUntil: '2000-01-01T00:00:00Z' }} />,
    )
    expect(within(card()).queryByText('VIP')).toBeNull()
  })
})
