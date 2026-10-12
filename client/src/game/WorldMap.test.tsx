import type { Character } from '@pockie/shared'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { WorldMap } from './WorldMap'

const renderMap = (who: Character = character, visitedScenes = [111, 2101]) => {
  const onClose = vi.fn()
  const fetchMock = mockApi({
    'GET /api/game/scene': () => json({ sceneId: who.sceneId, visitedScenes }),
    'POST /api/game/travel': () => json({ character: { ...who, sceneId: 2101 } }),
  })
  renderWithProviders(<WorldMap character={who} onClose={onClose} />)
  return { fetchMock, onClose }
}

const place = (name: string) => screen.getByRole('button', { name })

describe('WorldMap', () => {
  it('draws the places without labels and marks where the ninja is', () => {
    renderMap()

    expect(document.querySelector('img[src="/assets/game/map/world.webp"]')).toBeInTheDocument()
    // Names are accessible names only: nothing is written over the painting.
    expect(screen.queryByText('Smelting Mountains')).not.toBeInTheDocument()
    expect(place('Smelting Mountains')).toHaveAttribute('aria-disabled', 'false')
    expect(place('Fire Village (You are here)')).toHaveAttribute('aria-disabled', 'true')
    expect(document.querySelector('img[src="/assets/game/map/111-face.webp"]')).toBeInTheDocument()
    // Other nations' villages and fields are not on this ninja's roads.
    expect(place('Water Village')).toHaveAttribute('aria-disabled', 'true')
    expect(place('Verdant Alley')).toHaveAttribute('aria-disabled', 'true')
  })

  it('leaves places the ninja has never entered grey, as refreshMap does with ScenesEntered', async () => {
    renderMap(character, [111])

    // Until the scene arrives only the place the ninja stands in is coloured.
    expect(place('Smelting Mountains').querySelector('img')).toBeNull()
    await waitFor(() =>
      expect(document.querySelector('img[src="/assets/game/map/111-up.webp"]')).toBeInTheDocument(),
    )
    // Unvisited: the grey painting shows through, the button still travels and explains itself.
    expect(place('Smelting Mountains').querySelector('img')).toBeNull()
    expect(place('Smelting Mountains')).toHaveAttribute('aria-disabled', 'false')
    fireEvent.mouseEnter(place('Smelting Mountains'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Entry level: Level 1')
  })

  it('colours every place the ninja has entered', async () => {
    renderMap()

    await waitFor(() =>
      expect(
        document.querySelector('img[src="/assets/game/map/2101-up.webp"]'),
      ).toBeInTheDocument(),
    )
    expect(document.querySelector('img[src="/assets/game/map/121-up.webp"]')).toBeNull()
  })

  it('shows the original tooltip of a place on hover, for this ninja’s village', () => {
    renderMap()

    fireEvent.mouseEnter(place('Smelting Mountains'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Entry level: Level 1')
    fireEvent.mouseLeave(place('Smelting Mountains'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    // A closed place still explains itself (lg_Tip_WorldMap_121_0).
    fireEvent.mouseEnter(place('Water Village'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('You are not from')
  })

  it('travels from the keyboard', async () => {
    const { fetchMock, onClose } = renderMap()

    act(() => place('Smelting Mountains').focus())
    expect(screen.getByRole('tooltip')).toHaveTextContent('Smelting Mountains')
    await userEvent.keyboard('{Enter}')

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101 })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does not travel to a closed place', () => {
    const { fetchMock } = renderMap()

    fireEvent.click(place('Fire Village (You are here)'))
    fireEvent.click(place('Water Village'))

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toBeUndefined()
  })

  it('stacks overlapping places by their original depth', () => {
    renderMap()

    // Fire Village (depth 4) covers part of Smelting Mountains (depth 2).
    expect(Number(place('Fire Village (You are here)').style.zIndex)).toBeGreaterThan(
      Number(place('Smelting Mountains').style.zIndex),
    )
  })

  it('lists the roads that are not on the painting and locks them by level', () => {
    renderMap()

    // Every M3 field has a map button now; the Christmas House is closed (CLOSED_SCENES).
    const others = screen.getByRole('region', { name: 'Other areas' })
    expect(others).not.toHaveTextContent('Christmas House')
    expect(screen.getByRole('button', { name: 'Hidden Rain Village Lv. 86' })).toBeDisabled()
    // Places on the painting carry their level lock in their name too.
    expect(place('Eventide Barrens Lv. 11')).toHaveAttribute('aria-disabled', 'true')
  })

  it('closes with the painting’s own close button', async () => {
    const { onClose } = renderMap()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('keeps every road closed while defeated', () => {
    renderMap({ ...character, hp: 0 })

    expect(screen.getByRole('alert')).toHaveTextContent('You cannot travel until then.')
    expect(place('Smelting Mountains')).toHaveAttribute('aria-disabled', 'true')
  })
})
