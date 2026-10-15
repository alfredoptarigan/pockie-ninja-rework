import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  FortuneReward,
  FortuneWheelView,
  HashiramaView,
} from '../../../../shared/src/schemas/hashirama'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { Replay } from '../types'
import { FortuneWheelWindow } from './FortuneWheel'
import { hmmss, HashiramaWindow } from './HashiramaWindow'

const ninja = { ...character, level: 40 }
const hour = 3_600_000
const running = {
  running: true,
  finished: false,
  phase: 'running' as const,
  endsAt: new Date(Date.now() + 2 * hour).toISOString(),
  closesAt: new Date(Date.now() + 26 * hour).toISOString(),
  winner: null,
}
const base: HashiramaView = {
  eligible: true,
  event: running,
  totals: { madara: 300, hashirama: 100 },
  leaderboards: {
    madara: [
      { name: 'Ninja_01', damage: 300 },
      { name: 'Ninja_02', damage: 0 },
    ].filter((r) => r.damage > 0),
    hashirama: [{ name: 'Rival', damage: 100 }],
  },
  me: null,
  myPayout: null,
  freeSpins: 0,
  rewards: { winnerSpins: 5, topSpins: [10, 6, 3] },
  retryInMs: 0,
}
const replay: Replay = {
  seed: 1,
  fighters: [
    { index: 0, side: 'attackers', name: 'Ninja_01', level: 40, maxHp: 1, startHp: 1, hp: 0 },
    {
      index: 1,
      side: 'defenders',
      name: 'Hashirama Senju',
      level: 40,
      maxHp: 9,
      startHp: 9,
      hp: 5,
    },
  ],
  events: [],
  winner: 'defenders',
}

const open = (view: HashiramaView) => {
  const fetch = mockApi({
    'GET /api/game/hashirama': () => json(view),
    'POST /api/game/hashirama/join': () =>
      json({ hashirama: { ...view, me: { side: 'madara', damage: 0, rank: null } } }),
    'POST /api/game/hashirama/attack': () =>
      json({
        replay,
        damage: 4321,
        look: { clothing: 50 },
        hashirama: { ...view, me: { side: 'madara', damage: 4621, rank: 1 } },
        character: ninja,
      }),
  })
  renderWithProviders(<HashiramaWindow character={ninja} onClose={vi.fn()} />)
  return fetch
}

describe('HashiramaWindow', () => {
  it('has the valley background, the icon and both leaders’ poses exported', () => {
    const file = (url: string) => join(__dirname, '../../../public', url)
    expect(existsSync(file('/assets/reborn/features/hashirama/background.webp'))).toBe(true)
    expect(existsSync(file('/assets/reborn/ui/buttons/topui/hashirama.webp'))).toBe(true)
    expect(existsSync(file('/assets/reborn/poses/170.webp'))).toBe(true)
    expect(existsSync(file('/assets/reborn/poses/50.webp'))).toBe(true)
  })

  it('formats the timer like Reborn', () => {
    expect(hmmss(3_725_000)).toBe('1:02:05')
    expect(hmmss(-5)).toBe('0:00:00')
  })

  it('shows the timer, the clash and both boards, and joins a side', async () => {
    const fetch = open(base)
    expect(await screen.findByText('Choose your side for this battle')).toBeVisible()
    expect(screen.getByText(/^Ends in \d+:\d\d:\d\d$/)).toBeVisible()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '75')
    const madara = screen.getByRole('region', { name: 'Top damage: Madara' })
    expect(madara).toHaveTextContent('Ninja_01')
    expect(madara).toHaveTextContent('300')
    expect(screen.getByRole('region', { name: 'Top damage: Hashirama' })).toHaveTextContent('Rival')
    expect(
      screen.getByText('Winning side: 5 spins each · Top 3 of each side: +10 / +6 / +3'),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Fight for Madara' }))
    expect(requestBody(fetch, 'POST /api/game/hashirama/join')).toEqual({ side: 'madara' })
    expect(await screen.findByText('You fight for Madara')).toBeVisible()
  })

  it('attacks the other leader and reports the damage', async () => {
    open({ ...base, me: { side: 'madara', damage: 300, rank: 1 } })
    expect(await screen.findByText('Your damage: 300 · Rank #1')).toBeVisible()
    expect(screen.getByText('Madara Uchiha outfit')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Attack Hashirama' }))
    const report = await screen.findByRole('dialog', { name: 'Battle report' })
    expect(report).toHaveTextContent('You dealt 4,321 damage to Hashirama Senju.')
    expect(report).toHaveTextContent('Your damage: 4,621 · Rank #1')
  })

  it('shows the result and the spins earned after the battle', async () => {
    open({
      ...base,
      event: { ...running, running: false, finished: true, phase: 'finished', winner: 'tie' },
      myPayout: { spins: 15 },
      freeSpins: 15,
    })
    expect(await screen.findByText('The battle ended in a tie: both sides win!')).toBeVisible()
    expect(screen.getByText('You earned 15 free Fortune Wheel spins.')).toBeVisible()
    expect(screen.getByText(/^Spend your spins · closes in/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Fortune Wheel (15 free spins)' })).toBeVisible()
  })

  it('is quiet without a battle', async () => {
    open({ ...base, event: null })
    expect(
      await screen.findByText('The Valley of the End is quiet. No battle is running.'),
    ).toBeVisible()
  })
})

const reward = (
  id: string,
  rarity: FortuneReward['rarity'],
  itemId = 'i160010',
): FortuneReward => ({ id, itemId, kind: 'item', amount: 1, rarity, limit: null })
const wheel: FortuneWheelView = {
  freeSpins: 2,
  bonusReady: false,
  goldSpinCost: 50,
  paidSpins: 3,
  bonusEvery: 10,
  segments: [
    { kind: 'choice', reward: null, chance: 0 },
    { kind: 'mystery', reward: null, chance: 24.75 },
    { kind: 'choice', reward: null, chance: 0 },
    { kind: 'mystery', reward: null, chance: 24.75 },
    { kind: 'grand', reward: reward('grand-madara', 'legendary', 'i290049'), chance: 1 },
    { kind: 'mystery', reward: null, chance: 24.75 },
    { kind: 'choice', reward: null, chance: 0 },
    { kind: 'mystery', reward: null, chance: 24.75 },
  ],
  pools: [
    {
      id: 'unique',
      label: 'Unique',
      unique: true,
      rewards: [reward('u-wing', 'legendary', 'i218000')],
    },
    {
      id: 'extras',
      label: 'Extras',
      unique: false,
      rewards: [reward('x-hp', 'common'), reward('x-mp', 'common', 'i160020')],
    },
  ],
  mysteryPool: [{ id: 'm-spin', kind: 'spins', amount: 1, rarity: 'uncommon', limit: null }],
  selection: [null, null, null],
  lastResult: null,
  nextSpinToken: 4,
  open: true,
}

describe('FortuneWheelWindow', () => {
  it('shows the grand prize, the bonus progress and saves a chosen prize', async () => {
    const fetch = mockApi({
      'GET /api/game/hashirama/wheel': () => json(wheel),
      'POST /api/game/hashirama/wheel/configure': () =>
        json({ wheel: { ...wheel, selection: ['u-wing', null, null] } }),
    })
    renderWithProviders(<FortuneWheelWindow onClose={vi.fn()} />)
    expect(await screen.findByText('Choose your fortune')).toBeVisible()
    expect(screen.getByText('GRAND PRIZE')).toBeVisible()
    expect(screen.getByText('BONUS SPIN 3/10')).toBeVisible()
    expect(screen.getByRole('button', { name: 'SPIN' })).toBeDisabled()
    expect(
      screen.getByText('Unique: only one of these can be on your wheel at a time.'),
    ).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /^Choose / }))
    expect(requestBody(fetch, 'POST /api/game/hashirama/wheel/configure')).toEqual({
      selection: ['u-wing', null, null],
    })
    expect(await screen.findByText('Your prizes 1/3')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Spin for 50 gold' })).toBeDisabled()
  })

  it('spins a ready wheel and shows the reward', async () => {
    const chosen = { ...wheel, selection: ['x-hp', 'x-mp', 'u-wing'] }
    const fetch = mockApi({
      'GET /api/game/hashirama/wheel': () => json(chosen),
      'POST /api/game/hashirama/wheel/spin': () =>
        json({
          result: { token: 4, winningIndex: 1, bonus: false, reward: wheel.mysteryPool[0] },
          wheel: { ...chosen, freeSpins: 2, nextSpinToken: 5 },
          character: ninja,
        }),
    })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    renderWithProviders(<FortuneWheelWindow onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'SPIN' }))
    expect(requestBody(fetch, 'POST /api/game/hashirama/wheel/spin')).toEqual({ token: 4 })
    const result = await screen.findByRole('dialog', { name: 'Congratulations!' })
    expect(within(result).getByText('1 free spins added to your wheel.')).toBeVisible()
    vi.unstubAllGlobals()
  })
})
