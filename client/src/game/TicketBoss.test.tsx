import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TicketBossInfo } from './TicketBoss'
import { renderWithProviders } from '../test/utils'
import type { TicketBoss } from './types'

const boss: TicketBoss = {
  id: 'n320140',
  fightId: 'n320144',
  nameKey: 'lg_name_n320140',
  level: 25,
  x: 940,
  y: 894,
  scale: 100,
  artId: 'n320140',
  ticketItemId: 'i150078',
  ticketNameKey: 'lg_Debris78_itemname',
  tickets: 1,
}

describe('TicketBossInfo', () => {
  it('shows the proof count and supports Fight, Auto and Cancel', async () => {
    const onFight = vi.fn(),
      onAuto = vi.fn(),
      onClose = vi.fn()
    renderWithProviders(
      <TicketBossInfo boss={boss} onFight={onFight} onAuto={onAuto} onClose={onClose} />,
    )
    expect(screen.getByText('Demon Proofs:')).toHaveTextContent('Demon Proofs: 1')
    for (const label of ['Fight', 'Auto', 'Cancel'])
      await userEvent.click(screen.getByRole('button', { name: label }))
    expect(onFight).toHaveBeenCalledOnce()
    expect(onAuto).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('allows a held proof without applying the backup schedule', () => {
    renderWithProviders(
      <TicketBossInfo boss={boss} onFight={vi.fn()} onAuto={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Fight' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Auto' })).toBeEnabled()
  })

  it('blocks challenge without a proof', () => {
    renderWithProviders(
      <TicketBossInfo
        boss={{ ...boss, tickets: 0 }}
        onFight={vi.fn()}
        onAuto={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fight' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Auto' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
