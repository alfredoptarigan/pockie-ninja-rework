import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AkatsukiView } from '../../../../shared/src/schemas/akatsuki'
import { character } from '../../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import type { Replay } from '../types'
import { AkatsukiAmbush } from './fight'
import { AkatsukiWindow } from './index'
import { ART, MEMBERS } from './members'

const ninja = { ...character, level: 30 }
const view: AkatsukiView = {
  enabled: true,
  minLevel: 20,
  pairs: [
    { key: 'clay', members: ['deidara', 'sasori'] },
    { key: 'ritual', members: ['hidan', 'kakuzu'] },
    { key: 'paper', members: ['pain', 'konan'] },
    { key: 'crows', members: ['itachi', 'kisame'] },
  ],
  members: {
    deidara: 'defeated',
    sasori: 'defeated',
    hidan: 'revealed',
    kakuzu: 'revealed',
    pain: 'locked',
    konan: 'locked',
    itachi: 'locked',
    kisame: 'locked',
  },
  pairsDefeated: 1,
  hunting: 'ritual',
  pendingAmbush: 'ritual',
  ambushChancePercent: 10,
  bait: { activeUntil: null, usedToday: false },
  claimed: [],
  redOutfits: { deidara: 'i2944250', sasori: 'i2921230' },
}
const replay: Replay = {
  seed: 1,
  fighters: [
    { index: 0, side: 'attackers', name: 'Ninja_01', level: 30, maxHp: 1, startHp: 1, hp: 1 },
    { index: 1, side: 'defenders', name: 'Hidan', level: 30, maxHp: 1, startHp: 1, hp: 0 },
    { index: 2, side: 'defenders', name: 'Kakuzu', level: 30, maxHp: 1, startHp: 1, hp: 0 },
  ],
  events: [],
  winner: 'attackers',
}
const after: AkatsukiView = {
  ...view,
  pairsDefeated: 2,
  hunting: 'paper',
  pendingAmbush: null,
  members: { ...view.members, hidan: 'defeated', kakuzu: 'defeated', pain: 'revealed' },
}
const fightResult = {
  replay,
  won: true,
  pair: 'ritual',
  looks: [{ clothing: 104 }, { clothing: 103 }],
  akatsuki: after,
  character: ninja,
}

const open = (data = view) => {
  let claimed: AkatsukiView['claimed'] = []
  const fetch = mockApi({
    'GET /api/game/akatsuki': () => json({ ...data, claimed }),
    'POST /api/game/akatsuki/ambush': () => json(fightResult),
    'POST /api/game/akatsuki/rematch': () => json({ ...fightResult, pair: 'clay' }),
    'POST /api/game/akatsuki/bait': () =>
      json({
        akatsuki: {
          ...data,
          ambushChancePercent: 20,
          bait: { activeUntil: new Date(Date.now() + 3_600_000).toISOString(), usedToday: true },
        },
      }),
    'POST /api/game/akatsuki/claim': () => {
      claimed = ['deidara']
      return json({
        itemId: 'i2944250',
        akatsuki: { ...data, claimed },
        character: ninja,
      })
    },
  })
  renderWithProviders(<AkatsukiWindow character={ninja} onClose={vi.fn()} />)
  return fetch
}

afterEach(() => vi.useRealTimers())

describe('AkatsukiWindow', () => {
  it('has the statue background, the sprites and every locked hologram exported', () => {
    const file = (url: string) => join(__dirname, '../../../public', url)
    expect(existsSync(file(`${ART}/background.webp`))).toBe(true)
    for (const member of MEMBERS) {
      expect(existsSync(file(`${ART}/locked/${member.key}.webp`))).toBe(true)
      if (member.sprite) expect(existsSync(file(`${ART}/${member.sprite}.webp`))).toBe(true)
    }
  })

  it('shows the progress, who hunts you and every member’s status', async () => {
    open()
    expect(await screen.findByText('Pairs defeated: 1 / 4')).toBeVisible()
    expect(screen.getByText('Hunted by Hidan & Kakuzu')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deidara. Defeated' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hidan. Hunting you' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pain. Locked' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Zetsu. Informant' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Obito / Tobi. Locked' })).toBeVisible()
  })

  it('lets Zetsu set the bait and send you to the waiting ambush', async () => {
    const fetch = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Zetsu. Informant' }))
    const panel = screen.getByRole('region', { name: 'Zetsu' })
    expect(panel).toHaveTextContent('"Hidan & Kakuzu are waiting for you right now."')
    expect(panel).toHaveTextContent('Ambush chance per field win: 10%')
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Set bait: double ambush chance for 1 hour' }),
    )
    expect(await within(panel).findByText(/Bait active until/)).toBeVisible()
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true)

    await userEvent.click(within(panel).getByRole('button', { name: 'Face them now' }))
    const result = await screen.findByRole('dialog', { name: 'Victory' })
    expect(result).toHaveTextContent('You defeated Hidan & Kakuzu.')
    expect(result).toHaveTextContent('Pairs defeated: 2 / 4')
  })

  it('claims a beaten member’s red outfit and offers a rematch', async () => {
    const fetch = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Deidara. Defeated' }))
    const panel = screen.getByRole('region', { name: 'Deidara' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Claim red outfit' }))
    expect(requestBody(fetch, 'POST /api/game/akatsuki/claim')).toEqual({ member: 'deidara' })
    expect(await within(panel).findByRole('button', { name: 'Red outfit claimed' })).toBeDisabled()
    await userEvent.click(within(panel).getByRole('button', { name: 'Fight Deidara & Sasori' }))
    expect(requestBody(fetch, 'POST /api/game/akatsuki/rematch')).toEqual({ pair: 'clay' })
  })

  it('tells a locked member and Obito apart', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'Pain. Locked' }))
    expect(screen.getByRole('region', { name: 'Pain' })).toHaveTextContent(
      'Not met yet. They find you, not the other way around: keep winning field fights.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Obito / Tobi. Locked' }))
    expect(screen.getByRole('region', { name: 'Obito / Tobi' })).toHaveTextContent(
      'Something watches you from behind the mask...',
    )
  })

  it('shows a closed hunt', async () => {
    open({ ...view, enabled: false })
    expect(await screen.findByText('The hunt is not active.')).toBeVisible()
  })
})

describe('AkatsukiAmbush', () => {
  it('announces the pair, then fights them by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetch = mockApi({ 'POST /api/game/akatsuki/ambush': () => json(fightResult) })
    const done = vi.fn()
    renderWithProviders(
      <AkatsukiAmbush
        ambush={{ pair: 'ritual', members: ['hidan', 'kakuzu'] }}
        character={ninja}
        onDone={done}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('AMBUSH!')
    expect(alert).toHaveTextContent('Hidan & Kakuzu')
    expect(alert).toHaveTextContent('A blood-red circle forms beneath your feet...')
    await act(() => vi.advanceTimersByTimeAsync(2700))
    expect(fetch).toHaveBeenCalled()
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Victory' })).getByRole('button', {
        name: 'OK',
      }),
    )
    expect(done).toHaveBeenCalled()
  })

  it('gives up with a toast when the ambush cannot start', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockApi({
      'POST /api/game/akatsuki/ambush': () =>
        apiError(400, 'no_ambush', 'Nobody is waiting for you right now.'),
    })
    const done = vi.fn()
    renderWithProviders(
      <AkatsukiAmbush
        ambush={{ pair: 'clay', members: ['deidara', 'sasori'] }}
        character={ninja}
        onDone={done}
      />,
    )
    await act(() => vi.advanceTimersByTimeAsync(2700))
    await vi.waitFor(() => expect(done).toHaveBeenCalled())
  })
})
