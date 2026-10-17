import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { countdown, TicketBossInfo, TicketBossPanel } from './TicketBoss'
import { renderWithProviders } from '../test/utils'
import type { TicketBoss } from './types'

const NOW = Date.parse('2026-10-12T12:15:00Z')
const boss: TicketBoss = {
  id: 'n320140',
  fightId: 'n320144',
  nameKey: 'lg_name_n320140',
  level: 25,
  x: 940,
  y: 894,
  scale: 100,
  active: true,
  startsAt: '2026-10-12T12:10:00.000Z',
  endsAt: '2026-10-12T12:40:00.000Z',
  ticketItemId: 'i150078',
  ticketNameKey: 'lg_Debris78_itemname',
  tickets: 1,
}

describe('countdown', () => {
  it('formats the time left and never goes negative', () => {
    expect(countdown('2026-10-12T12:40:00Z', NOW)).toBe('25:00')
    expect(countdown('2026-10-12T14:20:05Z', NOW)).toBe('2:05:05')
    expect(countdown('2026-10-12T12:00:00Z', NOW)).toBe('0:00')
  })
})

describe('TicketBossPanel', () => {
  const renderPanel = (value: TicketBoss) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const onFight = vi.fn()
    render(<TicketBossPanel boss={value} onFight={onFight} onExpire={vi.fn()} />)
    vi.useRealTimers()
    return onFight
  }

  it('shows the boss out now with the tickets held, and fights', async () => {
    const onFight = renderPanel(boss)
    expect(screen.getByRole('timer')).toHaveTextContent('Here now, leaves in')
    expect(screen.getByText('Demon Proof of Suppression: 1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fight' }))
    expect(onFight).toHaveBeenCalled()
  })

  it('waits for the boss and needs a ticket', () => {
    renderPanel({ ...boss, active: false, startsAt: '2026-10-12T13:10:00.000Z', tickets: 0 })
    expect(screen.getByRole('timer')).toHaveTextContent('Appears in')
    expect(screen.getByRole('button', { name: 'Fight' })).toBeDisabled()
  })
})

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

  it.each([{ tickets: 0 }, { active: false }])('blocks challenge when %j', (change) => {
    renderWithProviders(
      <TicketBossInfo
        boss={{ ...boss, ...change }}
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
