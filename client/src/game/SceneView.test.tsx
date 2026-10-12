import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character, fists, villageScene } from '../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { SceneView } from './SceneView'
import type { FightResult, SceneView as Scene } from './types'

const field: Scene = {
  ...villageScene,
  sceneId: 2101,
  nameKey: 'lg_Scene_BackGround_2101',
  npcs: [],
  monsters: [{ id: 'n33017', nameKey: 'lg_name_n33017', level: 2 }],
}

const fightResult: FightResult = {
  won: true,
  replay: {
    seed: 1,
    winner: 'attackers',
    events: [{ actor: 0, event: 1 }],
    fighters: [
      {
        index: 0,
        side: 'attackers',
        name: 'Ninja_01',
        level: 1,
        maxHp: 160,
        startHp: 160,
        hp: 150,
      },
      {
        index: 1,
        side: 'defenders',
        name: 'lg_name_n33017',
        level: 2,
        maxHp: 15,
        startHp: 15,
        hp: 0,
      },
    ],
  },
  rewards: { exp: 10, stone: 3, items: [{ itemId: 'i160006', bound: true }], levelsGained: 1 },
  character: { ...character, level: 2, hp: 150, sceneId: 2101 },
}

const armed = {
  'GET /api/game/inventory': () => json({ items: [{ ...fists, equippedSlot: 'Weapon' }] }),
}

describe('SceneView', () => {
  it('opens NPCs from the keyboard list', async () => {
    mockApi({ ...armed, 'GET /api/game/scene': () => json(villageScene) })
    const onNpc = vi.fn()
    renderWithProviders(<SceneView character={character} onNpc={onNpc} />)

    const actions = screen.getByRole('region', { name: 'Scene actions' })
    await userEvent.click(
      await within(actions).findByRole('button', { name: 'Fire Village Elder in the Hall' }),
    )
    expect(onNpc).toHaveBeenCalledWith(villageScene.npcs[0])
  })

  it('fights a monster and shows the result', async () => {
    const fetchMock = mockApi({
      ...armed,
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => json(fightResult),
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} onNpc={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Fight Sunflower' }))

    const dialog = await screen.findByRole('dialog', { name: 'Victory' })
    expect(dialog).toHaveTextContent('You defeated Sunflower.')
    expect(dialog).toHaveTextContent('+10')
    expect(dialog).toHaveTextContent('Healing Powder')
    expect(dialog).toHaveTextContent('Level up! You are now level 2.')
    expect(requestBody(fetchMock, 'POST /api/game/fight')).toEqual({ monsterId: 'n33017' })
  })

  it('replays the battle and fights again from the result window', async () => {
    let fights = 0
    mockApi({
      ...armed,
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => {
        fights++
        return json(fightResult)
      },
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} onNpc={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Fight Sunflower' }))
    const dialog = await screen.findByRole('dialog', { name: 'Victory' })
    expect(dialog).toHaveTextContent('You dealt 0 damage to Sunflower.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replay Battle' }))
    // The stub stage ends the replay at once, so the results come back.
    const again = await screen.findByRole('dialog', { name: 'Victory' })
    await userEvent.click(within(again).getByRole('button', { name: 'Fight Again' }))
    await waitFor(() => expect(fights).toBe(2))
  })

  it('shows why a fight was refused', async () => {
    mockApi({
      ...armed,
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => apiError(400, 'no_hp', 'Heal before you fight again.'),
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} onNpc={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Fight Sunflower' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Heal before you fight again.')
  })

  it('warns before fighting without a weapon and can open the bag', async () => {
    const fetchMock = mockApi({
      'GET /api/game/scene': () => json(field),
      'GET /api/game/inventory': () => json({ items: [fists] }),
      'POST /api/game/fight': () => json(fightResult),
    })
    const onOpenBag = vi.fn()
    renderWithProviders(
      <SceneView
        character={{ ...character, sceneId: 2101 }}
        onNpc={vi.fn()}
        onOpenBag={onOpenBag}
      />,
    )
    const fight = await screen.findByRole('button', { name: 'Fight Sunflower' })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))

    await userEvent.click(fight)
    const warning = await screen.findByRole('dialog', { name: 'No weapon equipped' })
    await userEvent.click(within(warning).getByRole('button', { name: 'Open Bag' }))
    expect(onOpenBag).toHaveBeenCalledWith({ equipment: true })
    expect(requestBody(fetchMock, 'POST /api/game/fight')).toBeUndefined()

    await userEvent.click(fight)
    const again = await screen.findByRole('dialog', { name: 'No weapon equipped' })
    await userEvent.click(within(again).getByRole('button', { name: 'Fight anyway' }))
    expect(await screen.findByRole('dialog', { name: 'Victory' })).toBeVisible()
  })

  it('tells a defeated player to revive after the fight and offers no rematch', async () => {
    const lost: FightResult = {
      ...fightResult,
      won: false,
      replay: { ...fightResult.replay, winner: 'defenders' },
      rewards: { exp: 0, stone: 0, items: [], levelsGained: 0 },
      character: { ...character, hp: 0, sceneId: 2101 },
    }
    mockApi({
      ...armed,
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => json(lost),
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} onNpc={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Fight Sunflower' }))
    const dialog = await screen.findByRole('dialog', { name: 'Defeat' })
    expect(dialog).toHaveTextContent('Sunflower defeated you. Revive to keep playing')
    expect(within(dialog).queryByRole('button', { name: 'Fight Again' })).not.toBeInTheDocument()
  })

  it('locks fights while defeated', async () => {
    mockApi({ ...armed, 'GET /api/game/scene': () => json(field) })
    renderWithProviders(
      <SceneView character={{ ...character, hp: 0, sceneId: 2101 }} onNpc={vi.fn()} />,
    )
    expect(await screen.findByRole('dialog', { name: 'Defeated' })).toBeVisible()
    expect(
      await screen.findByRole('button', { name: 'Fight Sunflower', hidden: true }),
    ).toBeDisabled()
  })
})
