import type { CardsView, GatesView, LasNochesView, PubView } from '@pockie/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { rewardText } from './GateFight'
import { LasNochesWindow } from './LasNochesWindow'
import { PubFightWindow } from './PubFightWindow'
import { TollGateWindow } from './TollGateWindow'

const ninja = { ...character, level: 20, sceneId: 171, hp: 160, gold: 50 }
const gate = {
  id: 100001,
  nameKey: 'lg_TollGate_100001',
  bossNameKey: 'lg_TollGateBoss_100001',
  tier: 'hard' as const,
  minLevel: 16,
  maxLevel: 25,
  subGates: 2,
  itemId: null,
}
const menu: GatesView = {
  triesLeft: 2,
  maxTries: 3,
  gates: [gate],
  run: null,
  exchanges: [],
  crystals: {},
}
const cards: CardsView = {
  state: 1,
  cards: [null, null, null, null, null],
  peeks: 0,
  peekCost: 15,
  showAllCost: 10,
  redealCost: 5,
}
const clearedRun = {
  gateId: 100001,
  subGate: 2,
  point: 0,
  points: [5, 5],
  passedPoint: 9,
  cleared: true,
  nextNpcIds: null,
  cards,
}
const noop = () => {}

describe('TollGateWindow', () => {
  it('lists the gates with today’s tries and enters one', async () => {
    const fetchMock = mockApi({
      'GET /api/game/gates': () => json(menu),
      'POST /api/game/gates/enter': () =>
        json({ run: { ...clearedRun, cleared: false, cards: null }, character: ninja }),
    })
    renderWithProviders(<TollGateWindow character={ninja} onClose={noop} />)
    expect(await screen.findByText('Tries left today: 2 / 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Enter / }))
    expect(requestBody(fetchMock, 'POST /api/game/gates/enter')).toEqual({ gateId: 100001 })
  })

  it('offers the card flip after a clear and shows what the cards held after a take', async () => {
    const fetchMock = mockApi({
      'GET /api/game/gates': () => json({ ...menu, run: clearedRun }),
      'POST /api/game/gates/cards/peek': () =>
        json({
          run: {
            ...clearedRun,
            cards: {
              ...cards,
              peeks: 1,
              cards: [{ itemId: 'i150168', count: 1, bound: true }, null, null, null, null],
            },
          },
          character: ninja,
        }),
      'POST /api/game/gates/cards/take': () =>
        json({
          card: { itemId: 'i150168', count: 1, bound: true },
          cards: Array(5).fill({ itemId: 'i150168', count: 1, bound: true }),
          character: ninja,
        }),
    })
    renderWithProviders(<TollGateWindow character={ninja} onClose={noop} />)
    expect(await screen.findByText(/Next peek: 15 Gold/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Peek at card 1' }))
    expect(requestBody(fetchMock, 'POST /api/game/gates/cards/peek')).toEqual({
      index: 0,
      currency: 'gold',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Take card 3' }))
    expect(await screen.findByText(/^You took/)).toBeInTheDocument()
    expect(requestBody(fetchMock, 'POST /api/game/gates/cards/take')).toEqual({ index: 2 })
  })
})

describe('LasNochesWindow', () => {
  const view: LasNochesView = {
    bestFloor: 0,
    runsLeft: 3,
    maxRuns: 3,
    options: { first: { floor: 1, stone: 1000 }, half: null },
    run: null,
  }
  it('starts a run on floor 1', async () => {
    const fetchMock = mockApi({
      'GET /api/game/gates/las-noches': () => json(view),
      'POST /api/game/gates/las-noches/start': () => json({ lasNoches: view, character: ninja }),
    })
    renderWithProviders(<LasNochesWindow character={ninja} onClose={noop} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Start (1k Stones)' }))
    expect(requestBody(fetchMock, 'POST /api/game/gates/las-noches/start')).toEqual({
      mode: 'first',
    })
  })

  it('shows the run with its pot, lives and the life price', async () => {
    mockApi({
      'GET /api/game/gates/las-noches': () =>
        json({
          ...view,
          run: {
            floor: 7,
            pot: 2400,
            lives: 1,
            livesBought: 0,
            nextNpcId: 'n900007',
            lifePrice: 6,
          },
        }),
    })
    renderWithProviders(<LasNochesWindow character={ninja} onClose={noop} />)
    expect(await screen.findByRole('button', { name: 'Fight Floor 7' })).toBeEnabled()
    expect(screen.getByText('EXP pot: 2,400')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy a Life (6 Gold)' })).toBeEnabled()
  })
})

describe('PubFightWindow', () => {
  const view: PubView = {
    sceneId: 2601,
    lineup: ['n8000001', 'n8000002', 'n8000003'],
    fightsToday: 4,
    maxFights: 999,
    nextPullAt: new Date(Date.now() + 60_000).toISOString(),
  }
  it('shows the line-up and blocks the pull until the hour is up and fights below full HP', async () => {
    mockApi({ 'GET /api/game/gates/pub': () => json(view) })
    renderWithProviders(<PubFightWindow character={{ ...ninja, hp: 10 }} onClose={noop} />)
    expect(await screen.findByRole('list', { name: 'Line-up' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fight' })).toBeDisabled()
    expect(screen.getByText('You need full HP to fight.')).toBeInTheDocument()
  })
})

describe('rewardText', () => {
  it('names drops lost to a full bag', () => {
    expect(rewardText({ exp: 120, stone: 0, items: [{}], lost: 2 })).toBe(
      'EXP +120, 1 item, 2 lost to a full bag',
    )
    expect(rewardText({ exp: 0, stone: 0, items: [] })).toBe('Nothing gained')
  })
})
