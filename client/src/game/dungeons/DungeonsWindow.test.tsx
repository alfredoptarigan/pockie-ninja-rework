import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { DungeonsView } from '../../../../shared/src/schemas/dungeons'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { Replay } from '../types'
import { DungeonsWindow, hms, poseUrl } from './index'

const drop = (name: string, n: number) => ({
  name,
  chance: 2,
  itemId: `i5400${String(n).padStart(2, '0')}`,
  permanentItemId: `i5401${String(n).padStart(2, '0')}`,
})
const bosses = [
  { name: 'Madara Uchiha', build: 'Bloodluster', pose: 170, drops: [drop('Izanagi', 1)] },
  { name: 'Itachi Uchiha', build: 'Tank', pose: 49, drops: [drop('Izanami', 2)] },
  {
    name: 'Kisame Hoshigaki',
    build: 'Punisher',
    pose: 107,
    drops: [drop('Water Colliding Wave', 4)],
  },
  { name: '3rd Form Aizen', build: 'Rebounder', pose: 75, drops: [drop('Black Coffin', 8)] },
  {
    name: 'Hollowified Ichigo',
    build: 'Kamikaze',
    pose: 5,
    drops: [drop('Royal Hollow Flash', 12)],
  },
  {
    name: 'Yamamoto Genryusai',
    build: 'Chip Damager',
    pose: 178,
    drops: [drop('Single Blade Cremation', 10)],
  },
  {
    name: 'White Ulquiorra',
    build: 'Chakra Eater',
    pose: 6,
    drops: [drop('Royal Hollow Flash', 12)],
  },
  { name: 'Byakuya Kuchiki', build: 'Brute Force', pose: 84, drops: [drop('Sprenger', 11)] },
  { name: 'Pain', build: 'Fortress', pose: 106, drops: [drop('Art of Rinne Rebirth', 7)] },
  { name: 'Hebi Sasuke', build: 'Speedster', pose: 111, drops: [drop('Kirin', 6)] },
  { name: 'Gaara', build: 'Rebounder', pose: 46, drops: [drop('Sand Burial', 3)] },
].map((boss, index) => ({ ...boss, index, pity: index === 10 ? 1.5 : 0 }))

const view: DungeonsView = {
  activeBosses: [0, 4, 10],
  bosses,
  attemptsRemaining: 25,
  maxAttempts: 25,
  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
  nextRotation: new Date(Date.now() + 3_600_000).toISOString(),
}
const ninja = { ...character, level: 45 }
const replay: Replay = {
  seed: 1,
  fighters: [
    {
      index: 0,
      side: 'attackers',
      name: 'Ninja_01',
      level: 45,
      maxHp: 1,
      startHp: 1,
      hp: 1,
      maxMp: 1,
      startMp: 1,
      mp: 1,
    },
    {
      index: 1,
      side: 'defenders',
      name: 'Gaara',
      level: 45,
      maxHp: 1,
      startHp: 1,
      hp: 0,
      maxMp: 1,
      startMp: 1,
      mp: 1,
    },
  ],
  events: [],
  winner: 'attackers',
}
const open = async (data = view) => {
  let attemptsRemaining = data.attemptsRemaining
  const fetch = mockApi({
    'GET /api/game/dungeons': () => json({ ...data, attemptsRemaining }),
    'POST /api/game/dungeons/fight': () =>
      json({
        replay,
        won: true,
        look: { clothing: 46 },
        drops: [{ itemId: 'i540003' }],
        dungeons: { ...data, attemptsRemaining: --attemptsRemaining },
        character: ninja,
      }),
  })
  renderWithProviders(<DungeonsWindow character={ninja} onClose={vi.fn()} />)
  await screen.findByRole('button', { name: 'Fight Gaara' })
  return fetch
}

describe('DungeonsWindow', () => {
  it('has every boss pose and the background exported', () => {
    const file = (url: string) => join(__dirname, '../../../public', url)
    for (const boss of bosses) expect(existsSync(file(poseUrl(boss.pose)))).toBe(true)
    expect(existsSync(file('/assets/reborn/features/dungeons-bg.webp'))).toBe(true)
  })

  it('formats countdowns like Reborn', () => {
    expect(hms(0)).toBe('00:00:00')
    expect(hms(3_725_000)).toBe('01:02:05')
  })

  it('shows today\u2019s three bosses and the attempts', async () => {
    await open()
    const list = screen.getByRole('list', { name: "Today's bosses" })
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Fight Madara Uchiha', 'Fight Hollowified Ichigo', 'Fight Gaara'])
    expect(screen.getByText('25/25')).toHaveStyle({ color: '#7CFC00' })
    expect(screen.getByText(/^Attempts reset in \d\d:\d\d:\d\d \(midnight UTC\)$/)).toBeVisible()
    expect(screen.getByText('Next rotation:')).toBeVisible()
  })

  it('shows the build and drop chances with the pity bonus on hover', async () => {
    await open()
    await userEvent.hover(screen.getByRole('button', { name: 'Fight Gaara' }))
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Build: Rebounder')
    expect(tip).toHaveTextContent('Sand Burial')
    expect(within(tip).getByText('3.5%')).toHaveStyle({ color: '#ff9900' })
    expect(tip).toHaveTextContent('Permanent: 0.1%')
    await userEvent.unhover(screen.getByRole('button', { name: 'Fight Gaara' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens and closes the Info box', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Info' }))
    const info = screen.getByRole('region', { name: 'Ninja Dungeons' })
    expect(info).toHaveTextContent('You have 25 attempts per day')
    await userEvent.click(within(info).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Ninja Dungeons' })).toBeNull()
  })

  it('fights a boss and shows the result with the scroll and the attempts left', async () => {
    const fetch = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Fight Gaara' }))
    expect(requestBody(fetch, 'POST /api/game/dungeons/fight')).toEqual({ index: 10 })
    const result = await screen.findByRole('dialog', { name: 'Victory' })
    expect(result).toHaveTextContent('You defeated Gaara.')
    expect(result).toHaveTextContent('Daily attempts left: 24/25.')
    expect(within(result).getByRole('region', { name: 'Scrolls' })).toBeVisible()
    expect(screen.getByText('24/25')).toBeVisible()
  })

  it('does not fight without attempts left', async () => {
    const fetch = await open({ ...view, attemptsRemaining: 0 })
    const gaara = screen.getByRole('button', { name: 'Fight Gaara' })
    expect(gaara).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('0/25')).toHaveStyle({ color: '#ff6666' })
    await userEvent.click(gaara)
    expect(requestBody(fetch, 'POST /api/game/dungeons/fight')).toBeUndefined()
  })

  it('shows a refused fight', async () => {
    mockApi({
      'GET /api/game/dungeons': () => json(view),
      'POST /api/game/dungeons/fight': () =>
        apiError(400, 'bag_full', 'Make room in your bag before you challenge a dungeon boss.'),
    })
    renderWithProviders(<DungeonsWindow character={ninja} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Fight Gaara' }))
    expect(await screen.findByText(/Make room in your bag/)).toBeVisible()
  })
})
