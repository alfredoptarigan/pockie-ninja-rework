import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SkillView } from '@pockie/shared'
import { character } from '../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { scrollSkillIcon } from './ScrollSkillsPanel'
import { SkillsWindow } from './SkillsWindow'

const skills: SkillView = {
  learned: [
    { skillId: 1803, level: 2 },
    { skillId: 2801, level: 1 },
  ],
  catalog: [
    { skillId: 1803, nameKey: 'lg_Skill_1803', kind: 'ninjutsu', type: 1, maxLevel: 2 },
    { skillId: 2801, nameKey: 'lg_Skill_2801', kind: 'element', type: 1, maxLevel: 1 },
  ],
  learnedThrough: 11,
  activeTree: 0,
  freeResets: 0,
  resetCost: 8,
  scrolls: [],
  trees: Array.from({ length: 3 }, () =>
    Array.from({ length: 6 }, (_, slot) => ({ slot, skillId: null, level: 0 })),
  ),
}
function setup() {
  const fetchMock = mockApi({
    'GET /api/game/skills': () => json(skills),
    'POST /api/game/skills/slot': () => json({ ...skills, character }),
    'POST /api/game/skills/tree': () => json({ ...skills, character }),
    'POST /api/game/skills/reset': () => json({ ...skills, character }),
  })
  renderWithProviders(<SkillsWindow character={character} onClose={() => {}} />)
  return fetchMock
}
describe('Skills window', () => {
  it('shows three trees, six slots, English skill names and passive elements', async () => {
    setup()
    expect(await screen.findByRole('tab', { name: 'Tree 1' })).toBeVisible()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getAllByRole('combobox', { name: /Slot \d skill/ })).toHaveLength(6)
    expect(screen.getByText('Fire Release')).toBeVisible()
    expect(screen.getAllByRole('option', { name: 'Crystal Blade' })).toHaveLength(6)
  })
  it('saves a skill assignment and activates a different tree', async () => {
    const fetchMock = setup()
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Slot 1 skill' }),
      '1803',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/slot',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tree: 0, slot: 0, skillId: 1803, level: 2 }),
      }),
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Tree 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Activate tree 2' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/tree',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ tree: 1 }) }),
    )
  })
  it('confirms the cost and currency before requesting a paid reset', async () => {
    const fetchMock = setup()
    await screen.findByRole('tab', { name: 'Tree 1' })
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Reset currency' }),
      'giftCoupon',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reset skills' }))
    expect(screen.getByText(/clear all three trees/)).toHaveTextContent('8 Gift coupons')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/game/skills/reset')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reset' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/reset',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ currency: 'giftCoupon' }) }),
    )
  })
  it('keeps the server state and explains rejected assignments', async () => {
    mockApi({
      'GET /api/game/skills': () => json(skills),
      'POST /api/game/skills/slot': () =>
        apiError(400, 'not_learned', 'That skill is not learned.'),
    })
    renderWithProviders(<SkillsWindow character={character} onClose={() => {}} />)
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Slot 1 skill' }),
      '1803',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('That skill is not learned.')
    expect(screen.getByRole('combobox', { name: 'Slot 1 skill' })).toHaveValue('')
  })
  it('uses a free reset before currency, even with an empty balance', async () => {
    const fetchMock = mockApi({
      'GET /api/game/skills': () => json({ ...skills, freeResets: 1 }),
      'POST /api/game/skills/reset': () => json({ ...skills, character }),
    })
    renderWithProviders(
      <SkillsWindow character={{ ...character, gold: 0, giftCoupon: 0 }} onClose={() => {}} />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Reset skills' }))
    expect(screen.getByText(/clear all three trees/)).toHaveTextContent('one free reset')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reset' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/reset',
      expect.objectContaining({ method: 'POST' }),
    )
  })
  it('lets a learned higher grade be lowered for a slot', async () => {
    const view = {
      ...skills,
      trees: skills.trees.map((slots, tree) =>
        slots.map((slot) =>
          tree === 0 && slot.slot === 0 ? { ...slot, skillId: 1803, level: 2 } : slot,
        ),
      ),
    }
    const fetchMock = mockApi({
      'GET /api/game/skills': () => json(view),
      'POST /api/game/skills/slot': () => json({ ...view, character }),
    })
    renderWithProviders(<SkillsWindow character={character} onClose={() => {}} />)
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Slot 1 level' }),
      '1',
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/slot',
      expect.objectContaining({
        body: JSON.stringify({ tree: 0, slot: 0, skillId: 1803, level: 1 }),
      }),
    )
  })
  it('lists scroll skills with time left and slots them up to two per tree', async () => {
    const view: SkillView = {
      ...skills,
      scrolls: [
        { skillId: 1831, expiresAt: null },
        {
          skillId: 1833,
          expiresAt: new Date(Date.now() + 3 * 86_400_000 + 9_000_000).toISOString(),
        },
        { skillId: 18046, expiresAt: null },
      ],
      trees: skills.trees.map((slots, tree) =>
        slots.map((slot) =>
          tree === 0 && slot.slot < 2
            ? { ...slot, skillId: [1831, 1833][slot.slot]!, level: 1 }
            : slot,
        ),
      ),
    }
    const fetchMock = mockApi({
      'GET /api/game/skills': () => json(view),
      'POST /api/game/skills/slot': () => json({ ...view, character }),
    })
    renderWithProviders(<SkillsWindow character={character} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Scroll Skills' }))
    expect(screen.getByText('Izanagi')).toBeVisible()
    expect(screen.getAllByText('Permanent')).toHaveLength(2)
    expect(screen.getByText('3d 2h left')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Slot Royal Hollow Flash in tree 1' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Slot Royal Hollow Flash in tree 2' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/slot',
      expect.objectContaining({ body: JSON.stringify({ tree: 1, slot: 0, skillId: 18046 }) }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove Izanagi from tree 1' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/slot',
      expect.objectContaining({ body: JSON.stringify({ tree: 0, slot: 0, skillId: null }) }),
    )
  })
  it('has an icon in the Reborn asset manifest for every scroll skill', async () => {
    const { default: assets } = await import('../generated/reborn-assets.json')
    for (const id of [
      1831, 1833, 1834, 1835, 1836, 18041, 18042, 18043, 18044, 18045, 18046, 18091,
    ])
      expect((assets as Record<string, { url: string }>)[`icons/skills/${id}.png`]?.url).toBe(
        scrollSkillIcon(id),
      )
  })
})
