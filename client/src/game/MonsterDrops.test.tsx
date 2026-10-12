import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DropsMenu, DropsPanel } from './MonsterDrops'
import type { SceneMonster } from './types'

const sunflower: SceneMonster = {
  id: 'n33017',
  nameKey: 'lg_name_n33017',
  level: 2,
  drops: [
    { itemId: 'i250101', nameKey: 'lg_Equip_Blunt1' },
    { itemId: 'i999999', nameKey: 'lg_i999999' },
  ],
}

describe('DropsMenu', () => {
  it('opens the drop list from the keyboard and closes it with Escape', async () => {
    render(<DropsMenu monster={sunflower} />)
    const button = screen.getByRole('button', { name: 'Drops: Sunflower' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(button).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('list', { name: 'Sunflower drops' })
    const [club, unknown] = within(list).getAllByRole('listitem')
    expect(within(club!).getByRole('img', { name: 'Dogsmasher' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_weapon_blunt1.webp',
    )
    expect(club).toHaveTextContent('Dogsmasher')
    expect(within(unknown!).getByRole('img', { name: 'Unknown item' })).toBeVisible()
    // No drop chances.
    expect(list).not.toHaveTextContent('%')

    await userEvent.keyboard('{Escape}')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('toggles with a click and says when a monster drops nothing', async () => {
    render(<DropsMenu monster={{ ...sunflower, drops: [] }} />)
    const button = screen.getByRole('button', { name: 'Drops: Sunflower' })
    await userEvent.click(button)
    expect(screen.getByText('Sunflower drops nothing.')).toBeVisible()
    await userEvent.click(button)
    expect(screen.getByText('Sunflower drops nothing.')).not.toBeVisible()
  })

  it('keeps a long list in a scrollable, focusable box', async () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ itemId: `i${i}`, nameKey: `lg_i${i}` }))
    render(<DropsMenu monster={{ ...sunflower, drops: many }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Drops: Sunflower' }))
    const box = screen.getByRole('region', { name: 'Drops of Sunflower' })
    expect(box).toHaveClass('max-h-56', 'overflow-y-auto')
    expect(box).toHaveAttribute('tabindex', '0')
    expect(within(box).getAllByRole('listitem')).toHaveLength(16)
  })
})

describe('DropsPanel', () => {
  const panel = () => screen.getByRole('region', { name: 'Sunflower drops', hidden: true })

  it('wraps a long list into columns and stays inside the stage', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ itemId: `i${i}`, nameKey: `lg_i${i}` }))
    render(<DropsPanel monster={{ ...sunflower, drops: many }} at={{ x: 0.01, y: 0.2 }} />)
    expect(panel().style.width).toBe('380px')
    // Pushed right so it does not leave the left edge.
    expect(panel().style.left).toBe('4px')
    expect(panel().style.top).toBe('144px')
    expect(panel().querySelector('ul')!.style.gridTemplateRows).toBe('repeat(8, auto)')
  })

  it('is clamped at the right edge and lies above the HUD', () => {
    render(<DropsPanel monster={sunflower} at={{ x: 0.99, y: 0.2 }} />)
    expect(panel().style.left).toBe(`${1280 - 190 - 4}px`)
    expect(panel().parentElement).toHaveClass('z-30', 'pointer-events-none')
    expect(within(panel()).getByText('Dogsmasher')).toBeInTheDocument()
  })
})
