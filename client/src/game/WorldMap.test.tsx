import type { Character } from '@pockie/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { WorldMap } from './WorldMap'

const renderMap = (who: Character = character) => {
  const onClose = vi.fn()
  const fetchMock = mockApi({
    'POST /api/game/travel': () => json({ character: { ...who, sceneId: 2101 } }),
  })
  renderWithProviders(<WorldMap character={who} onClose={onClose} />)
  return { fetchMock, onClose }
}

/** The painting drawn at half size (384x213) at the page origin. */
const painting = () => {
  const image = document.querySelector<HTMLImageElement>('img[src="/assets/game/map/world.webp"]')!
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 384, height: 213 }),
  )
  return image
}

describe('WorldMap', () => {
  it('draws the painting with English labels and marks where the ninja is', () => {
    renderMap()

    expect(painting()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Smelting Mountains' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Fire Village (You are here)' })).toBeDisabled()
    // Other nations' villages and fields are not on this ninja's roads.
    expect(screen.getByRole('button', { name: 'Water Village' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Verdant Alley' })).toBeDisabled()
  })

  it('travels from the keyboard', async () => {
    const { fetchMock, onClose } = renderMap()

    screen.getByRole('button', { name: 'Smelting Mountains' }).focus()
    await userEvent.keyboard('{Enter}')

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101 })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('travels when the painting is clicked inside a place, at any drawn size', async () => {
    const { fetchMock } = renderMap()

    // Painting point (40, 320) is only inside Smelting Mountains.
    fireEvent.click(painting(), { clientX: 20, clientY: 160 })

    await waitFor(() =>
      expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101 }),
    )
  })

  it('gives overlapping places to the higher depth', () => {
    const { fetchMock } = renderMap()

    // Painting point (100, 360) is in Smelting Mountains (depth 2) and Fire Village (depth 4):
    // Fire Village wins, and the ninja is already there.
    fireEvent.click(painting(), { clientX: 50, clientY: 180 })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists the roads that are not on the painting and locks them by level', () => {
    renderMap()

    // Every M3 field has a map button now; the Christmas map has none.
    const others = screen.getByRole('region', { name: 'Other areas' })
    expect(others).toHaveTextContent('Christmas House')
    expect(screen.getByRole('button', { name: 'Eventide Barrens Lv. 11' })).toBeDisabled()
  })

  it('keeps every road closed while defeated', () => {
    renderMap({ ...character, hp: 0 })

    expect(screen.getByRole('alert')).toHaveTextContent('You cannot travel until then.')
    expect(screen.getByRole('button', { name: 'Smelting Mountains' })).toBeDisabled()
  })
})
