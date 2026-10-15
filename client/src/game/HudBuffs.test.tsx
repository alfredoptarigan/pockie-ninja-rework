import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderWithProviders } from '../test/utils'
import { HudBuffs, buffTimeLeft } from './HudBuffs'

const NOW = new Date('2026-10-14T12:00:00Z')
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
const buff = (buffId: number, expiresAt: string | null, removable = true) => ({
  buffId,
  nameKey: 'lg_Food82_itemname',
  expiresAt,
  removable,
})

afterEach(() => vi.useRealTimers())

describe('buffTimeLeft', () => {
  it('shows HH:MM:SS, with DDd in front from a day on', () => {
    const now = NOW.getTime()
    expect(buffTimeLeft(at(3_723_000), now)).toBe('01:02:03')
    expect(buffTimeLeft(at(93_784_000), now)).toBe('01d02:03:04')
    expect(buffTimeLeft(at(-5000), now)).toBe('00:00:00')
  })
})

describe('HudBuffs', () => {
  function renderBuffs(buffs: ReturnType<typeof buff>[]) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    mockApi({
      'GET /api/game/buffs': () => json({ buffs, titles: [] }),
    })
    renderWithProviders(<HudBuffs />)
  }

  it('lists the active buffs with an icon in buff id order, Reborn icons first', async () => {
    renderBuffs([
      buff(50001, at(3_600_000)),
      buff(42101, at(3_600_000)),
      buff(90001, null, false),
      buff(50002, at(-1000)),
    ])
    const row = await screen.findByRole('list', { name: 'Active effects' })
    const icons = within(row).getAllByRole('img')
    expect(icons.map((icon) => icon.getAttribute('alt'))).toEqual([
      'Taijutsu Meal I',
      'Exp Boost +100%',
    ])
    expect(icons[0]).toHaveAttribute('src', '/assets/game/icons/buffs/1.webp')
    expect(icons[1]).toHaveAttribute('src', '/assets/reborn/icons/buffs/50001.webp')
  })

  it('shows the name, effect and time left on hover', async () => {
    renderBuffs([buff(50001, at(93_784_000))])
    const icon = await screen.findByRole('button', { name: 'Exp Boost +100%' })
    fireEvent.pointerEnter(icon)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Exp Boost +100%+100% Experience01d02:03:04',
    )
    fireEvent.pointerLeave(icon)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('offers no remove menu, like Reborn', async () => {
    renderBuffs([buff(50001, at(3_600_000))])
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Exp Boost +100%' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
