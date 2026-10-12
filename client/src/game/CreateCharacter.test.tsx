import type { CreationOptions } from '@pockie/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character } from '../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { CreateCharacter } from './CreateCharacter'

const options: CreationOptions = {
  outfits: [
    { clothing: 39, gender: 1, weaponClass: 4 },
    { clothing: 3, gender: 0, weaponClass: 4 },
    { clothing: 17, gender: 0, weaponClass: 1 },
  ],
  villages: [
    { nation: 0, sceneId: 111 },
    { nation: 1, sceneId: 121 },
    { nation: 2, sceneId: 151 },
    { nation: 3, sceneId: 141 },
    { nation: 4, sceneId: 131 },
  ],
  suggestedNation: 3,
}

function renderCreate(post = () => json({ character }, 201)) {
  const fetchMock = mockApi({
    'GET /api/game/creation': () => json(options),
    'POST /api/game/characters': post,
  })
  renderWithProviders(<CreateCharacter />, {
    route: '/play/create',
    path: '/play/create',
    otherPaths: ['/play'],
  })
  return fetchMock
}

describe('CreateCharacter', () => {
  it('pre-selects the least-populated village and the first outfit', async () => {
    renderCreate()

    const wind = await screen.findByRole('radio', { name: /Wind Village/ })
    expect(wind).toBeChecked()
    expect(screen.getByText('Suggested')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Ggio Vega/ })).toBeChecked()
  })

  it('shows only outfits of the chosen gender', async () => {
    renderCreate()
    await screen.findByRole('radio', { name: /Ggio Vega/ })

    await userEvent.click(screen.getByRole('radio', { name: 'Female' }))

    expect(screen.queryByRole('radio', { name: /Ggio Vega/ })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Shizune/ })).toBeChecked()
  })

  it('checks the name rules before calling the API', async () => {
    const fetchMock = renderCreate()

    await userEvent.type(await screen.findByLabelText('Ninja name'), 'no spaces!')
    await userEvent.click(screen.getByRole('button', { name: 'Create ninja' }))

    expect(await screen.findByText('Use only letters, numbers and underscores.')).toBeVisible()
    expect(screen.getByLabelText('Ninja name')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows a taken name under the field', async () => {
    renderCreate(() =>
      apiError(409, 'conflict', 'That ninja name is already taken.', {
        name: 'That ninja name is already taken.',
      }),
    )

    await userEvent.type(await screen.findByLabelText('Ninja name'), 'Naruto')
    await userEvent.click(screen.getByRole('button', { name: 'Create ninja' }))

    expect(await screen.findByText('That ninja name is already taken.')).toBeVisible()
  })

  it('creates the ninja and enters the game', async () => {
    const fetchMock = renderCreate()

    await userEvent.type(await screen.findByLabelText('Ninja name'), 'Ninja_01')
    await userEvent.click(screen.getByRole('radio', { name: /Kiba Inuzuka/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Fire Village/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create ninja' }))

    expect(await screen.findByTestId('location')).toHaveTextContent('/play')
    expect(requestBody(fetchMock, 'POST /api/game/characters')).toEqual({
      name: 'Ninja_01',
      gender: 0,
      clothing: 17,
      nation: 0,
    })
  })
})
