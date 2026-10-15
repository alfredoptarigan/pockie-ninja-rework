import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { AudioProvider } from './audio'
import { MenuBar, PlayerCard, TopBar, shortNumber } from './Hud'
import { OpenWindowProvider } from './windows'

const card = () => screen.getByRole('region', { name: 'Character' })
const NOW = '2026-10-14T13:05:00Z'
const twentyMinute = {
  nextClaimAt: '2000-01-01T00:00:00Z',
  claimsToday: 0,
  dailyCap: 6,
  coupons: 10,
}
const eventsApi = (overrides = {}) => ({
  'GET /api/game/events': () =>
    json({
      resetAt: '2026-10-15T00:00:00Z',
      twentyMinute: { ...twentyMinute, ...overrides },
    }),
})

function renderTopBar(player = character, open = vi.fn()) {
  mockApi({ ...eventsApi(), 'GET /api/health': () => json({ ok: true }) })
  renderWithProviders(
    <AudioProvider>
      <OpenWindowProvider value={open}>
        <TopBar character={player} />
      </OpenWindowProvider>
    </AudioProvider>,
  )
  return open
}

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('shortNumber (Reborn formatShort)', () => {
  it('groups numbers under 10,000 and abbreviates the rest with one decimal', () => {
    expect(shortNumber(2865)).toBe('2,865')
    expect(shortNumber(9999)).toBe('9,999')
    expect(shortNumber(10000)).toBe('10K')
    expect(shortNumber(12345)).toBe('12.3K')
    expect(shortNumber(1500000)).toBe('1.5M')
    expect(shortNumber(999999)).toBe('1M')
    expect(shortNumber(2e9)).toBe('2B')
    expect(shortNumber(3.25e12)).toBe('3.3T')
  })
})

describe('TopBar', () => {
  it('shows the currencies short, with the full amount in the title and gold in gold', () => {
    renderTopBar({ ...character, stone: 2865, gold: 12345, giftCoupon: 1500000 })
    const currencies = screen.getByLabelText('Currencies')
    expect(within(currencies).getByTitle('2,865 stones')).toHaveTextContent('2,865')
    const gold = within(currencies).getByTitle('12,345 gold')
    expect(gold).toHaveTextContent('12.3K')
    expect(within(gold).getByText('12.3K').className).toContain('text-[#ffd700]')
    expect(within(currencies).getByTitle('1,500,000 gift coupons')).toHaveTextContent('1.5M')
  })

  it('shows the UTC server clock as HH:MM and the ping in ms', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
    renderTopBar()
    expect(screen.getByTitle('Server time (UTC)')).toHaveTextContent(/^13:05$/)
    const ping = await screen.findByText(/^\d+ms$/)
    expect(ping).toHaveAttribute('title', 'Updates every 5s')
  })

  it('lays out the right row in Reborn order, Arena and Events after Settings', () => {
    renderTopBar()
    const actions = screen.getByRole('navigation', { name: 'Game menu' })
    const names = [...actions.querySelectorAll('button, a')]
      .filter((element) => !element.closest('ul'))
      .map((element) => element.getAttribute('aria-label') ?? element.textContent)
    expect(names).toEqual([
      'Mute music',
      'Welcome',
      'Discord',
      'Settings',
      'Arena',
      'Events',
      'Website',
    ])
  })

  it('toggles the music mute from the sound button', async () => {
    renderTopBar()
    await userEvent.click(screen.getByRole('button', { name: 'Mute music' }))
    expect(JSON.parse(localStorage.getItem('pockie.audio')!)).toMatchObject({ muted: true })
    await userEvent.click(screen.getByRole('button', { name: 'Unmute music' }))
    expect(screen.getByRole('button', { name: 'Mute music' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pockie.audio')!)).toMatchObject({ muted: false })
  })

  it('opens Ninja Diary from Welcome, links the website and holds Discord for later', async () => {
    const open = renderTopBar()
    await userEvent.click(screen.getByRole('button', { name: 'Welcome' }))
    expect(open).toHaveBeenLastCalledWith('ninjaDiary')
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/')
    const discord = screen.getByRole('button', { name: 'Discord' })
    expect(discord).toBeDisabled()
    expect(discord).toHaveAttribute('title', 'Coming soon')
  })

  it('opens every event window from the Events menu', async () => {
    const open = renderTopBar()
    const windows = {
      'Ninja Diary': 'ninjaDiary',
      'Dice of Fate': 'diceOfFate',
      'Tailed Beast': 'tailedBeast',
      'Team Stone': 'teamStone',
      'Card Room': 'cardRoom',
      'Pet Tracing': 'petTracing',
      'Pet Shop': 'kennelShop',
      'Festival Shop': 'festivalShop',
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

describe('PlayerCard', () => {
  const renderCard = (player = character, events = {}) => {
    mockApi(eventsApi(events))
    renderWithProviders(<PlayerCard character={player} />)
  }

  it('shows HP and MP in percent, an empty VP bar of 200 and the level', () => {
    renderCard()
    expect(within(card()).getByRole('meter', { name: 'HP' })).toHaveTextContent('75%')
    expect(within(card()).getByRole('meter', { name: 'MP' })).toHaveTextContent('75%')
    const vp = within(card()).getByRole('meter', { name: 'VP' })
    expect(vp).toHaveAttribute('aria-valuenow', '0')
    expect(vp).toHaveAttribute('aria-valuemax', '200')
    expect(vp).toHaveTextContent('0/200')
    const refill = within(card()).getByRole('button', { name: 'Energy refill' })
    expect(refill).toBeDisabled()
    expect(refill).toHaveAttribute('title', 'Energy: not available yet')
    expect(within(card()).getByText('Lv. 1')).toBeVisible()
  })

  it('claims the 20-minute reward from the CLAIM widget next to the card', async () => {
    renderCard()
    const claim = await within(card()).findByRole('button', { name: 'Claim 10 Gift Coupons' })
    expect(claim).toBeEnabled()
    expect(claim).toHaveTextContent('CLAIM')
  })

  it('counts down to the daily reset once the daily limit is hit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T22:00:00Z'))
    renderCard(character, { claimsToday: 6 })
    const limit = await within(card()).findByRole('button', { name: 'Daily limit reached' })
    expect(limit).toBeDisabled()
    expect(limit).toHaveTextContent(/^Daily Limit\s*2:00:00$/)
  })
})

describe('PlayerCard VIP badge', () => {
  it('lists the VIP days remaining and colours the name gold while VIP lasts', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
    mockApi(eventsApi())
    const { unmount } = renderWithProviders(
      <PlayerCard character={{ ...character, vipUntil: '2026-11-13T13:05:00Z' }} />,
    )
    expect(within(card()).getByText('VIP')).toHaveAttribute(
      'title',
      'VIP: 30 days remaining (until Nov 13, 2026)',
    )
    expect(within(card()).getByRole('heading', { name: 'Ninja_01' }).className).toContain(
      'text-[#ffd700]',
    )
    unmount()
    renderWithProviders(
      <PlayerCard character={{ ...character, vipUntil: '2026-10-15T01:00:00Z' }} />,
    )
    expect(within(card()).getByText('VIP')).toHaveAttribute(
      'title',
      'VIP: 1 day remaining (until Oct 15, 2026)',
    )
  })

  it('shows no badge and a white name without VIP or once it has expired', () => {
    mockApi(eventsApi())
    const { unmount } = renderWithProviders(<PlayerCard character={character} />)
    expect(within(card()).queryByText('VIP')).toBeNull()
    expect(within(card()).getByRole('heading', { name: 'Ninja_01' }).className).toContain(
      'text-white',
    )
    unmount()
    renderWithProviders(
      <PlayerCard character={{ ...character, vipUntil: '2000-01-01T00:00:00Z' }} />,
    )
    expect(within(card()).queryByText('VIP')).toBeNull()
  })
})

describe('Settings button', () => {
  it('opens the Settings window with the sound controls', async () => {
    renderTopBar()
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('dialog', { name: 'Settings' })
    await userEvent.click(within(settings).getByRole('checkbox', { name: 'Mute Music' }))
    expect(within(settings).getByRole('checkbox', { name: 'Mute Music' })).toBeChecked()
    expect(within(settings).getByRole('slider', { name: 'Volume' })).toBeDisabled()
  })
})

describe('MenuBar', () => {
  function renderMenu(level: number) {
    const open = vi.fn()
    renderWithProviders(
      <OpenWindowProvider value={open}>
        <MenuBar character={{ ...character, level }} onOpen={vi.fn()} onTasks={vi.fn()} />
      </OpenWindowProvider>,
    )
    return open
  }

  it('greys the Clan icon below level 30', () => {
    renderMenu(29)
    const clan = screen.getByRole('button', { name: 'Clan' })
    expect(clan).toBeDisabled()
    expect(clan).toHaveAttribute('title', 'Required level 30')
  })

  it('opens the Clan window from level 30', async () => {
    const open = renderMenu(30)
    await userEvent.click(screen.getByRole('button', { name: 'Clan' }))
    expect(open).toHaveBeenCalledWith('clan')
  })
})
