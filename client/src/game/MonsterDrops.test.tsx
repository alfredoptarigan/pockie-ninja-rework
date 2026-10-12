import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DropsMenu } from './MonsterDrops'
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
})
