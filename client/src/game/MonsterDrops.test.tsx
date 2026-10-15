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
  const scarlet: SceneMonster = { id: 'n32001', nameKey: 'lg_name_n32001', level: 8 }

  it('lays the cards out on a 70px pitch centred at top 30, skipping monsters without art', async () => {
    renderWithProviders(
      <MonsterRow monsters={[sunflower, { ...sunflower, id: 'n0' }, scarlet]} onFight={vi.fn()} />,
    )

    // n0 has no art: only the Sunflower and the Scarlet get a card.
    const [first, second] = await screen.findAllByTestId('monster-card')
    expect(screen.getAllByTestId('monster-card')).toHaveLength(2)
    expect(first).toHaveTextContent('Lv.2')
    expect(first).toHaveTextContent('Sunflower')
    expect(second).toHaveTextContent('Lv.8')
    expect(first!.style.left).toBe('2px')
    expect(second!.style.left).toBe('72px')
    const row = first!.closest<HTMLElement>('[data-menu-root]')!
    expect(row.style.width).toBe('143px')
    expect(row.style.left).toBe('calc(50% - 70px)')
    expect(row).toHaveClass('top-[30px]')
    expect(first!.closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the Lv, name and description tooltip while a card is hovered', async () => {
    renderWithProviders(<MonsterRow monsters={[sunflower]} onFight={vi.fn()} />)
    const card = await screen.findByTestId('monster-card')

    await userEvent.hover(card)
    const tip = screen.getByTestId('monster-tooltip')
    expect(tip).toHaveTextContent('Lv.2')
    expect(tip).toHaveTextContent('Sunflower')
    expect(tip).toHaveTextContent('A mysterious creature.')
    await userEvent.unhover(card)
    expect(screen.queryByTestId('monster-tooltip')).toBeNull()
  })

  it('opens Monster Information on a click; Fight starts the fight', async () => {
    const onFight = vi.fn()
    renderWithProviders(<MonsterRow monsters={[sunflower]} onFight={onFight} />)

    await userEvent.click(await screen.findByTestId('monster-card'))
    expect(onFight).not.toHaveBeenCalled()
    const info = screen.getByRole('dialog', { name: 'Monster Information' })
    expect(info).toHaveTextContent('Lv.2')
    expect(info).toHaveTextContent('Sunflower')
    expect(within(info).getByRole('button', { name: 'Chain Attack' })).toBeEnabled()

    await userEvent.click(within(info).getByRole('button', { name: 'Drops: Sunflower' }))
    expect(within(info).getByRole('list', { name: 'Sunflower drops' })).toHaveTextContent(
      'Dogsmasher',
    )

    await userEvent.click(within(info).getByRole('button', { name: 'Fight' }))
    expect(onFight).toHaveBeenCalledWith(sunflower)
    expect(screen.queryByRole('dialog', { name: 'Monster Information' })).toBeNull()
  })

  it('right-click menu: Fight fights, Chain Attack configures a chain, Drops opens the drops', async () => {
    const onFight = vi.fn()
    renderWithProviders(<MonsterRow monsters={[sunflower]} onFight={onFight} />)
    const card = await screen.findByTestId('monster-card')

    await userEvent.pointer({ keys: '[MouseRight]', target: card })
    const menu = screen.getByRole('menu', { name: 'Sunflower' })
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Chain Attack' }))
    const config = screen.getByRole('dialog', { name: 'Chain Attack' })
    expect(config).toHaveTextContent('Chain Attack Configuration')
    expect(config).toHaveTextContent('00:03:00')
    await userEvent.click(within(config).getByRole('button', { name: 'MAX' }))
    expect(config).toHaveTextContent('30 Monsters')
    expect(config).toHaveTextContent('01:30:00')
    await userEvent.click(within(config).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Chain Attack' })).toBeNull()

    await userEvent.pointer({ keys: '[MouseRight]', target: card })
    await userEvent.click(
      within(screen.getByRole('menu', { name: 'Sunflower' })).getByRole('menuitem', {
        name: 'Fight',
      }),
    )
    expect(onFight).toHaveBeenCalledWith(sunflower)
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.pointer({ keys: '[MouseRight]', target: card })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Drops' }))
    const info = screen.getByRole('dialog', { name: 'Monster Information' })
    expect(within(info).getByRole('button', { name: 'Drops: Sunflower' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(info).getByRole('list', { name: 'Sunflower drops' })).toBeVisible()
  })

  it('keeps a locked boss from being fought from the menu and the window', async () => {
    const onFight = vi.fn()
    renderWithProviders(
      <MonsterRow monsters={[{ ...sunflower, lock: 'quest' }]} onFight={onFight} />,
    )
    const card = await screen.findByTestId('monster-card')

    await userEvent.pointer({ keys: '[MouseRight]', target: card })
    expect(screen.getByRole('menuitem', { name: 'Fight' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(card)
    const fight = within(screen.getByRole('dialog')).getByRole('button', { name: 'Fight' })
    expect(fight).toBeDisabled()
    expect(fight).toHaveAttribute('title', 'You need the quest for this boss before you fight it.')
    expect(onFight).not.toHaveBeenCalled()
  })
})
