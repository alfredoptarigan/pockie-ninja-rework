import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApprenticeState } from '../../../../shared/src/schemas/apprentice'
import { character } from '../../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../../test/utils'
import { ApprenticeLayer } from './ApprenticeLayer'
import { ApprenticeTab } from './ApprenticeTab'

const KAI = { characterId: '00000000-0000-4000-8000-000000000002', name: 'Kai', level: 55 }
const BO = { characterId: '00000000-0000-4000-8000-000000000003', name: 'Bo', level: 40 }
const ME = { characterId: character.id, name: character.name, level: 20 }
const state = (extra: Partial<ApprenticeState> = {}): ApprenticeState => ({
  master: null,
  apprentices: [],
  incoming: [],
  outgoing: null,
  ...extra,
})

function renderWith(current: ApprenticeState, ui: React.ReactElement) {
  const fetch = mockApi({
    'GET /api/game/apprentice': () => json(current),
    'POST /api/game/apprentice/request': () => json(current),
    'POST /api/game/apprentice/accept': () => json(state()),
    'POST /api/game/apprentice/dismiss': () => json(state()),
    'POST /api/game/apprentice/graduate': () => json({ ...state(), character }),
  })
  renderWithProviders(ui)
  return fetch
}

afterEach(() => vi.restoreAllMocks())

describe('Apprentice tab', () => {
  it('lists my master and apprentices and graduates one who reached the level', async () => {
    const fetch = renderWith(
      state({
        master: { ...KAI, online: true, canGraduate: false },
        apprentices: [{ ...BO, online: false, canGraduate: true }],
      }),
      <ApprenticeTab onView={() => {}} />,
    )
    await screen.findByRole('button', { name: 'Kai' })
    const master = screen.getByRole('list', { name: 'Your master' })
    expect(within(master).getByRole('button', { name: 'Leave' })).toBeInTheDocument()
    expect(screen.getByText('Apprentices (1/3)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Graduate' }))
    await waitFor(() =>
      expect(requestBody(fetch, 'POST /api/game/apprentice/graduate')).toEqual({
        characterId: BO.characterId,
      }),
    )
  })

  it('asks before leaving a master', async () => {
    const fetch = renderWith(
      state({ master: { ...KAI, online: true, canGraduate: false } }),
      <ApprenticeTab onView={() => {}} />,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Leave' }))
    const prompt = screen.getByRole('alertdialog')
    expect(prompt).toHaveTextContent('Leave your master Kai? There is no reward.')
    await user.click(within(prompt).getByRole('button', { name: 'Leave' }))
    await waitFor(() =>
      expect(requestBody(fetch, 'POST /api/game/apprentice/dismiss')).toEqual({
        characterId: KAI.characterId,
      }),
    )
  })

  it('sends a request by name, then shows it waiting', async () => {
    const fetch = renderWith(state(), <ApprenticeTab onView={() => {}} />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Ninja name'), 'Kai')
    await user.click(screen.getByRole('button', { name: 'Request' }))
    await waitFor(() =>
      expect(requestBody(fetch, 'POST /api/game/apprentice/request')).toEqual({ name: 'Kai' }),
    )
  })

  it('shows my waiting request with Cancel', async () => {
    renderWith(
      state({
        outgoing: {
          id: '00000000-0000-4000-8000-0000000000aa',
          from: ME,
          to: KAI,
          senderRole: 'apprentice',
          expiresAt: new Date(Date.now() + 50_000).toISOString(),
        },
      }),
      <ApprenticeTab onView={() => {}} />,
    )
    expect(await screen.findByText('Waiting for Kai...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})

describe('Apprentice requests popup', () => {
  it('asks me and accepts', async () => {
    const request = {
      id: '00000000-0000-4000-8000-0000000000aa',
      from: KAI,
      to: ME,
      senderRole: 'master' as const,
      expiresAt: new Date(Date.now() + 50_000).toISOString(),
    }
    const fetch = renderWith(state({ incoming: [request] }), <ApprenticeLayer />)
    const prompt = await screen.findByRole('alertdialog', { name: 'Apprentice request' })
    expect(prompt).toHaveTextContent('Kai (Level 55) wants to be your master.')
    await userEvent.click(within(prompt).getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(requestBody(fetch, 'POST /api/game/apprentice/accept')).toEqual({
        requestId: request.id,
      }),
    )
  })
})
