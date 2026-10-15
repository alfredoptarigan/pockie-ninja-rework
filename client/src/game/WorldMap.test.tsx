import type { Character } from '@pockie/shared'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../test/game'
import { json, mockApi, renderWithProviders, requestBody } from '../test/utils'
import { WorldMap } from './WorldMap'

const renderMap = (
  who: Character = character,
  visitedScenes = [111, 2101],
  visitRequired: number[] = [],
) => {
  const onClose = vi.fn()
  const fetchMock = mockApi({
    'GET /api/game/scene': () => json({ sceneId: who.sceneId, visitedScenes, visitRequired }),
    'POST /api/game/travel': () => json({ character: { ...who, sceneId: 2101 } }),
  })
  renderWithProviders(<WorldMap character={who} onClose={onClose} />)
  return { fetchMock, onClose }
}

const place = (name: string) => screen.getByRole('button', { name })

describe('WorldMap', () => {
  it('draws the places without labels and marks where the ninja is', () => {
    renderMap()

    expect(
      document.querySelector('img[src="/assets/reborn/ui/SmallMap/map/map.webp"]'),
    ).toBeInTheDocument()
    // Names are accessible names only: nothing is written over the painting.
    expect(screen.queryByText('Smelting Mountains')).not.toBeInTheDocument()
    expect(place('Smelting Mountains')).toHaveAttribute('aria-disabled', 'false')
    expect(place('Fire Village (You are here)')).toHaveAttribute('aria-disabled', 'true')
    expect(document.querySelector('img.world-map-here')).toBeInTheDocument()
    // Other nations' villages and fields are not on this ninja's roads.
    expect(place('Water Village')).toHaveAttribute('aria-disabled', 'true')
    expect(place('Verdant Alley')).toHaveAttribute('aria-disabled', 'true')
  })

  it('blocks places reached on foot until they were entered (decision 7)', async () => {
    renderMap(character, [111], [111, 2101, 2601])

    // Until the scene arrives nothing is known to need a visit.
    await waitFor(() =>
      expect(place('Smelting Mountains (not visited yet)')).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(place('Smelting Mountains (not visited yet)').dataset.locked).toBe('visit')
    // Angel City is entered from the map in the original, so it stays open.
    expect(place('Angel City Lv. 11').dataset.locked).toBe('level')
    // A blocked place still explains itself.
    fireEvent.mouseEnter(place('Smelting Mountains (not visited yet)'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Entry level: Level 1')
  })

  it('darkens locked places like Reborn (tint 0x666666), with the level they need', () => {
    renderMap()

    const art = (scene: number) =>
      document.querySelector<HTMLElement>(`img[data-place="${scene}"]`)!
    expect(art(121).style.filter).toBe('brightness(0.4)')
    expect(art(2101).style.filter).toBe('')
    expect(place('Eventide Barrens Lv. 11')).toHaveTextContent('Lv. 11')
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

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101, via: 'map' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does not travel to a closed place', () => {
    const { fetchMock } = renderMap()

    fireEvent.click(place('Fire Village (You are here)'))
    fireEvent.click(place('Water Village'))

    expect(requestBody(fetchMock, 'POST /api/game/travel')).toBeUndefined()
  })

  it('travels by pointer to the place under it, tinting it on hover', async () => {
    const { fetchMock, onClose } = renderMap()
    const painting = document.querySelector('img[src$="/map.webp"]')!.parentElement!
    const art = document.querySelector<HTMLElement>('img[data-place="2101"]')!

    // (50, 310) lies on Smelting Mountains only.
    fireEvent.pointerMove(painting, { clientX: 50, clientY: 310 })
    expect(art.style.filter).toContain('#world-map-hover')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Smelting Mountains')
    fireEvent.pointerDown(painting, { clientX: 50, clientY: 310 })
    fireEvent.pointerUp(painting, { clientX: 50, clientY: 310 })

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(requestBody(fetchMock, 'POST /api/game/travel')).toEqual({ sceneId: 2101, via: 'map' })
  })

  it('puts every road on the painting and keeps the places this game lacks locked', () => {
    renderMap()

    // Reborn's painting has Hidden Rain Village too, so no road is listed under it.
    expect(screen.queryByRole('region', { name: 'Other areas' })).not.toBeInTheDocument()
    expect(place('Hidden Rain Village Lv. 86')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.mouseEnter(place('Konohagakure (unavailable)'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('This location is unavailable.')
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
