// The bottom bar's Bankai icon (Hud.tsx MENU): greyed below level 30, opens the window from 30.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { character } from '../../test/game'
import { renderWithProviders } from '../../test/utils'
import { MenuBar } from '../Hud'
import { OpenWindowProvider } from '../windows'

function renderMenu(level: number) {
  const open = vi.fn()
  renderWithProviders(
    <OpenWindowProvider value={open}>
      <MenuBar character={{ ...character, level }} onOpen={vi.fn()} onTasks={vi.fn()} />
    </OpenWindowProvider>,
  )
  return open
}

describe('Bankai menu icon', () => {
  it('is greyed with "Required level 30" below level 30', () => {
    renderMenu(29)
    const bankai = screen.getByRole('button', { name: 'Bankai' })
    expect(bankai).toBeDisabled()
    expect(bankai).toHaveAttribute('title', 'Required level 30')
  })

  it('opens the Bankai window from level 30', async () => {
    const open = renderMenu(30)
    await userEvent.click(screen.getByRole('button', { name: 'Bankai' }))
    expect(open).toHaveBeenCalledWith('bankai')
  })
})
