import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { character, villageScene } from '../test/game'
import { apiError, json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { SceneView } from './SceneView'
import type { FightResult, Quest, SceneView as Scene } from './types'

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

describe('SceneView', () => {
  it('talks to an NPC and accepts the quest it offers', async () => {
    let quests: Quest[] = []
    const fetchMock = mockApi({
      'GET /api/game/scene': () => json(villageScene),
      'GET /api/game/quests': () => json({ quests }),
      'POST /api/game/npcs/n11001/talk': () =>
        json({
          dialogKey: 'lg_Say_n11001',
          nameKey: 'lg_name_n11001',
          completed: [90001],
          character,
        }),
      'POST /api/game/quests/90002/accept': () => {
        quests = [
          {
            taskId: 90002,
            state: 0,
            progress: [0],
            nameKey: 'lg_Task_90002',
            descriptionKey: 'lg_TaskDes_90002',
            steps: [],
          },
        ]
        return json({ quests })
      },
    })
    renderWithProviders(<SceneView character={character} />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Fire Village Elder in the Hall' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Fire Village Elder in the Hall' })
    expect(await within(dialog).findByText(/Quest complete: Newbie Pack/)).toBeVisible()

    const offers = await within(dialog).findByRole('region', { name: 'Quests offered' })
    await userEvent.click(within(offers).getAllByRole('button', { name: 'Accept quest' })[0]!)

    expect(await within(dialog).findByText(/Quest accepted/)).toBeVisible()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/90002/accept'))).toBe(true)
  })

  it('fights a monster and shows the result', async () => {
    const fetchMock = mockApi({
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => json(fightResult),
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} />)

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
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => {
        fights++
        return json(fightResult)
      },
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} />)

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
      'GET /api/game/scene': () => json(field),
      'POST /api/game/fight': () => apiError(400, 'no_hp', 'Heal before you fight again.'),
    })
    renderWithProviders(<SceneView character={{ ...character, sceneId: 2101 }} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Fight Sunflower' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Heal before you fight again.')
  })

  it('travels to an open area and locks areas above the player level', async () => {
    const fetchMock = mockApi({
      'GET /api/game/scene': () => json(villageScene),
      'POST /api/game/travel': () => json({ character: { ...character, sceneId: 2101 } }),
    })
    renderWithProviders(<SceneView character={character} />)

    expect((await screen.findAllByRole('button', { name: /Lv\. 11/ }))[0]).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Smelting Mountains' }))

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101 })
  })
})
