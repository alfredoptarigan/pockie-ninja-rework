import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { AudioProvider } from './audio'
import { PlayerCard, SettingsMenu, TopBar } from './Hud'
import { OpenWindowProvider } from './windows'

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

describe('TopBar events', () => {
  it('opens Ninja Diary, Dice of Fate, Tailed Beast and Team Stone from the Events menu', async () => {
    mockApi({
      'GET /api/game/events': () =>
        json({
          twentyMinute: {
            nextClaimAt: '2000-01-01T00:00:00Z',
            claimsToday: 0,
            dailyCap: 6,
            coupons: 10,
          },
        }),
    })
    const open = vi.fn()
    renderWithProviders(
      <OpenWindowProvider value={open}>
        <TopBar character={character} />
      </OpenWindowProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Claim 10 Gift Coupons' })).toBeEnabled()
    const windows = {
      'Ninja Diary': 'ninjaDiary',
      'Dice of Fate': 'diceOfFate',
      'Tailed Beast': 'tailedBeast',
      'Team Stone': 'teamStone',
      'Card Room': 'cardRoom',
    }
    for (const [label, name] of Object.entries(windows)) {
      await userEvent.click(screen.getByRole('button', { name: 'Events' }))
      await userEvent.click(
        within(screen.getByRole('list', { name: 'Events' })).getByRole('button', { name: label }),
      )
      expect(open).toHaveBeenLastCalledWith(name)
      expect(screen.queryByRole('list', { name: 'Events' })).toBeNull()
    }
  })
})

describe('Settings menu', () => {
  it('holds the sound controls', async () => {
    renderWithProviders(
      <AudioProvider>
        <SettingsMenu />
      </AudioProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const menu = screen.getByRole('list', { name: 'Settings' })
    await userEvent.click(within(menu).getByRole('checkbox', { name: 'Mute music' }))
    expect(within(menu).getByRole('checkbox', { name: 'Mute music' })).toBeChecked()
    expect(within(menu).getByRole('slider', { name: /Music volume/ })).toBeInTheDocument()
  })
})
