import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ItemIcon, itemIcon } from './ItemIcon'

describe('itemIcon', () => {
  it('finds the original icon by item id', () => {
    expect(itemIcon('i160006')?.file).toBe('/assets/game/items/icon_resume6.webp')
  })

  it('has nothing for unknown ids, including object built-ins', () => {
    expect(itemIcon('i0000000')).toBeUndefined()
    expect(itemIcon('constructor')).toBeUndefined()
    expect(itemIcon('__proto__')).toBeUndefined()
  })
})

describe('ItemIcon', () => {
  it('shows the original icon named after the item', () => {
    render(<ItemIcon itemId="i160006" name="Healing Powder" />)
    expect(screen.getByRole('img', { name: 'Healing Powder' })).toHaveAttribute(
      'src',
      '/assets/game/items/icon_resume6.webp',
    )
  })

  it('shows a neutral placeholder with the item name when the icon is missing', () => {
    render(<ItemIcon itemId="i0000000" name="Mystery Box" />)
    const placeholder = screen.getByRole('img', { name: 'Mystery Box' })
    expect(placeholder).not.toHaveAttribute('src')
  })
})
