import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioProvider, SoundSettings, useBattleTrack, useTailedBeastTrack } from './index'
import { MusicPlayer, readSettings, STORAGE_KEY } from './player'
import { battleTrack, sceneTrack } from './tracks'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('audio map', () => {
  it.each([
    [111, 'maincity1'],
    [121, 'maincity2'],
    [131, 'maincity3'],
    [141, 'maincity4'],
    [151, 'maincity1'],
    [161, 'blackcity'],
    [171, 'demonCity'],
    [2101, 'maincity1'],
    [2201, 'maincity2'],
    [2301, 'maincity3'],
    [2401, 'maincity4'],
    [2501, 'maincity1'],
    [2601, 'maincity2'],
    [2701, 'maincity3'],
    [2801, 'maincity4'],
    [3001, 'singlegate'],
    [3101, 'lasNoches'],
    [3102, 'singlegate'],
    [5001, 'singlegate'],
    [4101, null],
  ])('scene %i selects %s', (scene, track) => {
    expect(sceneTrack(scene)).toBe(track)
  })
  it('selects battle music by seed', () => {
    expect([0, 1, 2, 3, 4].map(battleTrack)).toEqual([
      'compete1',
      'compete2',
      'compete3',
      'compete4',
      'compete1',
    ])
  })
})

it('waits for a gesture, loops, fades, and stops the previous track', () => {
  const { container, rerender } = render(<AudioProvider sceneId={111}>Game</AudioProvider>)
  const audio = container.querySelector('audio')!
  expect(audio.play).not.toHaveBeenCalled()
  expect(audio.getAttribute('src')).toBeNull()
  fireEvent.pointerDown(document)
  expect(audio.src).toContain('maincity1.mp3')
  expect(audio.loop).toBe(true)
  expect(audio.volume).toBe(0.5)
  vi.mocked(audio.pause).mockClear()
  rerender(<AudioProvider sceneId={121}>Game</AudioProvider>)
  act(() => vi.advanceTimersByTime(150))
  expect(audio.pause).toHaveBeenCalledOnce()
  expect(audio.src).toContain('maincity2.mp3')
  expect(audio.volume).toBe(0)
  act(() => vi.advanceTimersByTime(150))
  expect(audio.volume).toBe(0.5)
  vi.mocked(audio.play).mockClear()
  rerender(<AudioProvider sceneId={2201}>Game</AudioProvider>)
  act(() => vi.advanceTimersByTime(300))
  expect(audio.play).not.toHaveBeenCalled()
})

it('persists mute and volume across reloads and applies them to audio', () => {
  const first = render(
    <AudioProvider sceneId={111}>
      <SoundSettings />
    </AudioProvider>,
  )
  fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '27' } })
  expect(screen.getByLabelText('Volume %')).toHaveValue(27)
  fireEvent.click(screen.getByLabelText('Mute Music'))
  // Reborn disables the volume while the music is muted.
  expect(screen.getByLabelText('Volume')).toBeDisabled()
  expect(screen.getByLabelText('Volume %')).toBeDisabled()
  first.unmount()
  const next = render(
    <AudioProvider sceneId={111}>
      <SoundSettings />
    </AudioProvider>,
  )
  const audio = next.container.querySelector('audio')!
  expect(screen.getByLabelText('Mute Music')).toBeChecked()
  expect(audio.muted).toBe(true)
  expect(audio.volume).toBe(0.27)
  expect(audio.play).not.toHaveBeenCalled()
})

function Battle() {
  useBattleTrack(2)
  return null
}
function Beast() {
  useTailedBeastTrack()
  return null
}
it('prioritizes Tailed Beast, then battle, and restores scene music on close', () => {
  const view = (battle: boolean, beast: boolean) => (
    <AudioProvider sceneId={111}>
      {battle && <Battle />}
      {beast && <Beast />}
    </AudioProvider>
  )
  const { container, rerender } = render(view(true, true))
  const audio = container.querySelector('audio')!
  fireEvent.keyDown(document, { key: 'Enter' })
  expect(audio.src).toContain('tb.mp3')
  rerender(view(true, false))
  act(() => vi.advanceTimersByTime(300))
  expect(audio.src).toContain('compete3.mp3')
  rerender(view(false, false))
  act(() => vi.advanceTimersByTime(300))
  expect(audio.src).toContain('maincity1.mp3')
})

it('handles malformed settings, interrupted switches, silence and disposal', () => {
  localStorage.setItem(STORAGE_KEY, '{')
  expect(readSettings()).toEqual({ muted: false, volume: 50 })
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 900, muted: 'yes' }))
  expect(readSettings()).toEqual({ muted: false, volume: 100 })
  const audio = document.createElement('audio')
  const player = new MusicPlayer(audio, readSettings())
  player.select('maincity1')
  player.unlock()
  player.select('maincity2')
  vi.advanceTimersByTime(75)
  player.select('maincity3')
  vi.advanceTimersByTime(300)
  expect(audio.src).toContain('maincity3.mp3')
  expect(audio.volume).toBe(1)
  player.select(null)
  vi.advanceTimersByTime(300)
  expect(audio.getAttribute('src')).toBeNull()
  player.select('maincity4')
  player.select('maincity1')
  const timersBeforeDisposal = vi.getTimerCount()
  player.dispose()
  expect(vi.getTimerCount()).toBe(timersBeforeDisposal - 1)
})
