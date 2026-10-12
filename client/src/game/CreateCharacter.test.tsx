import type { CreationOptions } from '@pockie/shared'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { CreateCharacter } from './CreateCharacter'

const options: CreationOptions = {
  outfits: [
    { clothing: 39, gender: 1, weaponClass: 4, boost: 'stamina' },
    { clothing: 3, gender: 0, weaponClass: 4, boost: 'agility' },
    { clothing: 17, gender: 0, weaponClass: 1, boost: 'agility' },
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
    otherPaths: ['/play', '/'],
  })
  return fetchMock
}

const nameField = () => screen.findByLabelText('Character Name')
const enter = () => screen.getByRole('button', { name: 'Enter Game' })

afterEach(() => vi.restoreAllMocks())

describe('CreateCharacter', () => {
  it('lays out the original four steps', async () => {
    renderCreate()

    expect(await screen.findByRole('radiogroup', { name: 'Step 1: Choose Village' })).toBeVisible()
    expect(screen.getByRole('radiogroup', { name: 'Step 2: Choose Character' })).toBeVisible()
    expect(await nameField()).toBeVisible()
    expect(screen.getByText('Step 3: Enter Name')).toBeVisible()
    expect(enter()).toBeVisible()
  })

  it('pre-selects the least-populated village and the first character', async () => {
    renderCreate()

    expect(await screen.findByRole('radio', { name: /Wind Village/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Shizune' })).toBeChecked()
    // The big picture and the boost line of the chosen outfit (CreatRolePanel_SelectRole).
    expect(document.querySelector('img[src="/assets/game/create/outfit-39.webp"]')).toBeTruthy()
    expect(screen.getByText(/Outfit boost:/)).toHaveTextContent('Stamina will affect HP and Chakra')
  })

  it('shows the picture and boost of another character', async () => {
    renderCreate()

    await userEvent.click(await screen.findByRole('radio', { name: 'Ggio Vega' }))

    expect(document.querySelector('img[src="/assets/game/create/outfit-3.webp"]')).toBeTruthy()
    expect(screen.getByText(/Outfit boost:/)).toHaveTextContent(
      'Agility will affect Speed and Dodge',
    )
  })

  it('picks a random character and village', async () => {
    renderCreate()
    await screen.findByRole('radio', { name: 'Shizune' })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    await userEvent.click(screen.getByRole('button', { name: 'Random' }))

    expect(screen.getByRole('radio', { name: 'Kiba Inuzuka' })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Earth Village/ })).toBeChecked()
  })

  it('checks the name rules before calling the API', async () => {
    const fetchMock = renderCreate()

    await userEvent.type(await nameField(), 'no spaces!')
    await userEvent.click(enter())

    expect(await screen.findByText('Use only letters, numbers and underscores.')).toBeVisible()
    expect(await nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows a taken name under the field', async () => {
    renderCreate(() =>
      apiError(409, 'conflict', 'That ninja name is already taken.', {
        name: 'That ninja name is already taken.',
      }),
    )

    await userEvent.type(await nameField(), 'Naruto')
    await userEvent.click(enter())

    expect(await screen.findByText('That ninja name is already taken.')).toBeVisible()
  })

  it('creates the ninja with the outfit’s gender and enters the game', async () => {
    const fetchMock = renderCreate()

    await userEvent.type(await nameField(), 'Ninja_01')
    await userEvent.click(screen.getByRole('radio', { name: 'Kiba Inuzuka' }))
    await userEvent.click(screen.getByRole('radio', { name: /Fire Village/ }))
    await userEvent.click(enter())

    expect(await screen.findByTestId('location')).toHaveTextContent('/play')
    expect(requestBody(fetchMock, 'POST /api/game/characters')).toEqual({
      name: 'Ninja_01',
      gender: 0,
      clothing: 17,
      nation: 0,
    })
  })

  it('goes back to the start page', async () => {
    renderCreate()

    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/$/)
  })
})
