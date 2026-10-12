import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/utils'
import { DropsMenu, MonsterRow } from './MonsterDrops'
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

describe('MonsterRow', () => {
  const panel = () => screen.getByRole('region', { name: 'Sunflower drops', hidden: true })

  it('draws a card per monster with art and shows its drops while hovered', async () => {
    const onFight = vi.fn()
    renderWithProviders(
      <MonsterRow monsters={[sunflower, { ...sunflower, id: 'n0' }]} onFight={onFight} />,
    )

    // n0 has no art: only the Sunflower gets a card.
    const card = await screen.findByTestId('monster-card')
    expect(screen.getAllByTestId('monster-card')).toHaveLength(1)
    expect(card).toHaveTextContent('Lv.2')
    expect(card).toHaveTextContent('Sunflower')
    expect(card.closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true')

    await userEvent.hover(card)
    expect(within(panel()).getByText('Dogsmasher')).toBeInTheDocument()
    await userEvent.unhover(card)
    expect(screen.queryByRole('region', { name: 'Sunflower drops', hidden: true })).toBeNull()

    await userEvent.click(card)
    expect(onFight).toHaveBeenCalledWith(sunflower)
  })

  it('wraps a long drop list into columns', async () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ itemId: `i${i}`, nameKey: `lg_i${i}` }))
    renderWithProviders(<MonsterRow monsters={[{ ...sunflower, drops: many }]} onFight={vi.fn()} />)

    await userEvent.hover(await screen.findByTestId('monster-card'))
    expect(panel().style.width).toBe('380px')
    expect(panel().querySelector('ul')!.style.gridTemplateRows).toBe('repeat(8, auto)')
  })
})
