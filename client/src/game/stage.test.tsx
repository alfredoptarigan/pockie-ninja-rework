import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { villageScene } from '../test/game'
import { mountBattle, mountPicture, type BattleHandle } from './phaser'
import { BattleReplayMount, ScenePictureMount } from './stage'
import type { Replay } from './types'

// ./phaser is stubbed in test-setup.ts (jsdom has no WebGL).

const replay: Replay = {
  seed: 1,
  winner: 'attackers',
  events: [{ actor: 0, event: 14, target: 1, skillId: 1, damage: 15, hit: true }],
  fighters: [
    { index: 0, side: 'attackers', name: 'Ninja_01', level: 1, maxHp: 160, startHp: 160, hp: 160 },
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
}

const fakeHandle = (): BattleHandle => ({
  skip: vi.fn(),
  replay: vi.fn(),
  setSpeed: vi.fn(),
  destroy: vi.fn(),
})

describe('ScenePictureMount', () => {
  it('starts the picture and forwards clicks to the callbacks', async () => {
    const onNpc = vi.fn()
    const onMonster = vi.fn()
    const { unmount } = render(
      <ScenePictureMount scene={villageScene} onNpc={onNpc} onMonster={onMonster} />,
    )

    expect(screen.getByTestId('scene-picture')).toHaveAttribute('aria-hidden', 'true')
    await waitFor(() => expect(mountPicture).toHaveBeenCalled())
    const [parent, scene, actions] = vi.mocked(mountPicture).mock.calls.at(-1)!
    expect(parent).toBe(screen.getByTestId('scene-picture'))
    expect(scene).toBe(villageScene)
    actions.onNpc(villageScene.npcs[0]!)
    actions.onMonster({ id: 'n33017', nameKey: 'lg_name_n33017', level: 2 })
    expect(onNpc).toHaveBeenCalledWith(villageScene.npcs[0])
    expect(onMonster).toHaveBeenCalledWith(expect.objectContaining({ id: 'n33017' }))

    const handle = vi.mocked(mountPicture).mock.results.at(-1)!.value as { destroy: () => void }
    unmount()
    expect(handle.destroy).toHaveBeenCalled()
  })

  it('renders nothing for scenes without exported art', () => {
    render(
      <ScenePictureMount
        scene={{ ...villageScene, sceneId: 171 }}
        onNpc={vi.fn()}
        onMonster={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('scene-picture')).not.toBeInTheDocument()
  })
})

describe('BattleReplayMount', () => {
  const renderBattle = (onFinished = vi.fn()) =>
    render(
      <BattleReplayMount
        replay={replay}
        clothing={3}
        monsterIds={['n33017']}
        sceneId={2101}
        weaponItemId="i270100"
        onFinished={onFinished}
      />,
    )

  it('plays the replay with skip, replay and speed controls', async () => {
    const handle = fakeHandle()
    vi.mocked(mountBattle).mockResolvedValueOnce(handle)
    const { unmount } = renderBattle()

    const skip = screen.getByRole('button', { name: 'Skip' })
    await waitFor(() => expect(skip).toBeEnabled())
    expect(mountBattle).toHaveBeenLastCalledWith(
      screen.getByTestId('battle-stage'),
      expect.objectContaining({
        replay,
        clothing: 3,
        monsterIds: ['n33017'],
        sceneId: 2101,
        weaponItemId: 'i270100',
      }),
    )
    expect(handle.setSpeed).toHaveBeenLastCalledWith(1)

    await userEvent.click(skip)
    await userEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speed x2' }))
    expect(handle.skip).toHaveBeenCalled()
    expect(handle.replay).toHaveBeenCalled()
    expect(handle.setSpeed).toHaveBeenLastCalledWith(2)
    expect(screen.getByRole('button', { name: 'Speed x2' })).toHaveAttribute('aria-pressed', 'true')

    unmount()
    expect(handle.destroy).toHaveBeenCalled()
    // Several user events: allow for slow, busy machines.
  }, 15_000)

  it('reports the end of the replay', async () => {
    const onFinished = vi.fn()
    vi.mocked(mountBattle).mockImplementationOnce(async (_parent, options) => {
      options.onFinished()
      return fakeHandle()
    })
    renderBattle(onFinished)
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1))
  })

  it('falls back to the summary when the stage cannot start', async () => {
    const onFinished = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(mountBattle).mockRejectedValueOnce(new Error('no WebGL'))
    renderBattle(onFinished)

    await waitFor(() => expect(onFinished).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Battle replay' })).not.toBeInTheDocument()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
