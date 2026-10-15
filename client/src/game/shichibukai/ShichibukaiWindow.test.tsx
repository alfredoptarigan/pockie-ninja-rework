import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  ShichibukaiRunView,
  ShichibukaiView,
} from '../../../../shared/src/schemas/shichibukai'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { Replay } from '../types'
import { layout, shichiArt } from './Board'
import { ShichibukaiWindow } from './index'

const ninja = { ...character, level: 30 }
const boss = { name: 'Madara Uchiha', pose: 170 }
const view: ShichibukaiView = {
  attempts: 3,
  maxAttempts: 3,
  points: 120,
  stars: { '1-1': 3 },
  run: null,
  exchange: [
    {
      id: 0,
      itemId: 'i150177',
      info: { kind: 'use', equipSlot: null, level: 0 } as ShichibukaiView['exchange'][0]['info'],
      points: 100,
    },
  ],
  floorBosses: Array.from({ length: 9 }, () => boss),
  resetAt: new Date(Date.now() + 3_600_000).toISOString(),
}
const run: ShichibukaiRunView = {
  floor: 1,
  difficulty: 1,
  pos: 0,
  visited: [0],
  rollsLeft: 10,
  throws: 0,
  atBoss: false,
  cleared: false,
  bossesKilled: 0,
  runPoints: 0,
  hpPct: 100,
  mpPct: 80,
  card: null,
  board: {
    cells: [
      { index: 0, tag: '1-1', event: 0 },
      { index: 1, tag: '1-2', event: 3 },
      { index: 2, tag: '1-3', event: 5 },
      { index: 3, tag: '2-3', event: 9 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    bossIndex: 3,
  },
  boss,
}
const replay: Replay = {
  seed: 1,
  fighters: [
    {
      index: 0,
      side: 'attackers',
      name: 'Ninja_01',
      level: 30,
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
      name: 'Madara Uchiha',
      level: 30,
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

/** The server's state: each action answers with it and the refetch after it reads it. */
const open = async (data: ShichibukaiView = view) => {
  let current = data
  const action =
    (next: Partial<ShichibukaiView>, extra: object = {}) =>
    () => {
      current = { ...current, ...next }
      return json({ shichibukai: current, character: ninja, ...extra })
    }
  const fetch = mockApi({
    'GET /api/game/shichibukai': () => json(current),
    'POST /api/game/shichibukai/start': action({ attempts: 2, run }),
    'POST /api/game/shichibukai/roll': action(
      { run: { ...run, pos: 1, visited: [0, 1], rollsLeft: 9, throws: 1, runPoints: 10 } },
      { dice: 1, path: [0, 1], steps: [{ index: 1, event: 3, text: '+10 pts' }] },
    ),
    'POST /api/game/shichibukai/card/flip': action({
      run: {
        ...run,
        card: {
          reason: 'chest',
          peeked: {},
          flipped: 1,
          items: ['i160010', 'i160020', 'i150110', 'i150172', 'i100004'],
          peekCost: null,
        },
      },
    }),
    'POST /api/game/shichibukai/card/claim': action(
      { run },
      { item: { itemId: 'i160020', info: view.exchange[0]!.info } },
    ),
    'POST /api/game/shichibukai/boss': () => {
      current = { ...current, points: 170, run: { ...run, pos: 3, atBoss: true, cleared: true } }
      return json({
        replay,
        victory: true,
        look: { clothing: 49 },
        rewards: { exp: 1200, points: 50, stars: 3, throws: 7 },
        shichibukai: current,
        character: ninja,
      })
    },
    'POST /api/game/shichibukai/next-floor': action({ run: { ...run, floor: 2 } }),
    'POST /api/game/shichibukai/quit': action({ run: null }),
    'POST /api/game/shichibukai/exchange': action({ points: 20 }),
  })
  renderWithProviders(<ShichibukaiWindow character={ninja} onClose={vi.fn()} />)
  await screen.findByRole('region', {
    name: data.run ? 'Expedition status' : 'Choose Expedition',
  })
  return fetch
}

describe('ShichibukaiWindow', () => {
  it('has the board art exported', () => {
    const file = (url: string) => join(__dirname, '../../../public', url)
    const names = ['star_full', 'star_empty', 'easy', 'hard', 'epic', 'nightmare']
    for (let i = 1; i <= 9; i++) names.push(`island${i}`)
    for (const perk of [1, 2, 3, 5, 6, 7, 8, 9]) names.push(`perk${perk}`)
    for (const name of names) expect(existsSync(file(shichiArt(name)))).toBe(true)
  })

  it('lays tiles out on Reborn’s grid', () => {
    const { at, size } = layout(run.board.cells)
    expect(size).toBe(35)
    expect(at.get(0)).toEqual({ x: 52.5, y: 140 })
    expect(at.get(3)).toEqual({ x: 126.5, y: 177 })
  })

  it('chooses an open floor and difficulty and starts an expedition', async () => {
    const fetch = await open()
    const start = await screen.findByRole('region', { name: 'Choose Expedition' })
    expect(within(start).getByRole('button', { name: 'Floor 2 Easy' })).toBeEnabled()
    expect(within(start).getByRole('button', { name: 'Floor 2 Hard' })).toBeDisabled()
    expect(within(start).getByRole('button', { name: 'Floor 1 Hard' })).toBeEnabled()
    expect(start).toHaveTextContent('Attempts: 3')
    await userEvent.click(within(start).getByRole('button', { name: 'Floor 2 Easy' }))
    await userEvent.click(within(start).getByRole('button', { name: 'Start' }))
    expect(requestBody(fetch, 'POST /api/game/shichibukai/start')).toEqual({
      floor: 2,
      difficulty: 1,
    })
    expect(await screen.findByRole('region', { name: 'Expedition status' })).toHaveTextContent(
      'Rolls10',
    )
  })

  it('rolls the dice and reports what the tile did', async () => {
    await open({ ...view, run })
    const status = screen.getByRole('region', { name: 'Expedition status' })
    expect(within(status).getByRole('meter', { name: 'MP' })).toHaveAttribute('aria-valuenow', '80')
    await userEvent.click(within(status).getByRole('button', { name: 'Roll Dice' }))
    expect(await screen.findByText('Rolled 1: +10 pts')).toBeInTheDocument()
    expect(status).toHaveTextContent('Rolls9')
  })

  it('flips a treasure card and claims it', async () => {
    const fetch = await open({
      ...view,
      run: {
        ...run,
        card: { reason: 'chest', peeked: {}, flipped: null, items: null, peekCost: 50_000 },
      },
    })
    const cards = await screen.findByRole('dialog', { name: 'Treasure Cards' })
    expect(within(cards).getAllByRole('button', { name: 'Peek 50k' })).toHaveLength(5)
    await userEvent.click(within(cards).getByRole('button', { name: 'Card 2' }))
    expect(requestBody(fetch, 'POST /api/game/shichibukai/card/flip')).toEqual({ index: 1 })
    const picked = await screen.findByRole('dialog', { name: 'Treasure Cards' })
    await userEvent.click(await within(picked).findByRole('button', { name: 'Claim' }))
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/card/claim'))).toBe(true)
  })

  it('fights the boss at the chosen power, then continues to the next floor', async () => {
    const fetch = await open({ ...view, run: { ...run, pos: 3, atBoss: true } })
    const fight = await screen.findByRole('dialog', { name: 'Shichibukai Boss' })
    await userEvent.click(within(fight).getByRole('radio', { name: '150%' }))
    await userEvent.click(within(fight).getByRole('button', { name: 'Fight' }))
    expect(requestBody(fetch, 'POST /api/game/shichibukai/boss')).toEqual({ power: 150 })
    const cleared = await screen.findByRole('dialog', { name: 'Floor Cleared' })
    expect(cleared).toHaveTextContent('Total throws7')
    expect(cleared).toHaveTextContent('EXP+1,200')
    expect(within(cleared).getByRole('img', { name: '3 stars' })).toBeInTheDocument()
    await userEvent.click(within(cleared).getByRole('button', { name: 'Continue' }))
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/next-floor'))).toBe(true)
  })

  it('offers bought rolls when out of them', async () => {
    await open({ ...view, run: { ...run, rollsLeft: 0 } })
    const out = await screen.findByRole('dialog', { name: 'Out of Rolls' })
    for (const label of ['10 Gold', '500 GC', '300k Stones', 'Give Up'])
      expect(within(out).getByRole('button', { name: label })).toBeEnabled()
  })

  it('exchanges points in the Supply ship', async () => {
    const fetch = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Supply' }))
    const shop = await screen.findByRole('dialog', { name: 'Exchange' })
    expect(shop).toHaveTextContent('Points 120')
    await userEvent.click(within(shop).getByRole('button', { name: /^Exchange / }))
    expect(requestBody(fetch, 'POST /api/game/shichibukai/exchange')).toEqual({ id: 0 })
  })
})
