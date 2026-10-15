import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SkillView } from '@pockie/shared'
import { character } from '../test/game'
import { apiError, json, mockApi, renderWithProviders } from '../test/utils'
import { scrollSkillIcon } from './ScrollSkillsPanel'
import { SkillsWindow } from './SkillsWindow'

const emptyTrees = () =>
  Array.from({ length: 5 }, () =>
    Array.from({ length: 6 }, (_, slot) => ({ slot, skillId: null as number | null, level: 0 })),
  )
const skills: SkillView = {
  learned: [
    { skillId: 1803, level: 2 },
    { skillId: 1802, level: 1 },
    { skillId: 2801, level: 1 },
  ],
  catalog: [
    { skillId: 1802, nameKey: 'lg_Skill_1802', kind: 'ninjutsu', type: 1, maxLevel: 1 },
    { skillId: 1803, nameKey: 'lg_Skill_1803', kind: 'ninjutsu', type: 1, maxLevel: 2 },
    ...Array.from({ length: 10 }, (_, i) => ({
      skillId: 2801 + i,
      nameKey: `lg_Skill_${2801 + i}`,
      kind: 'element' as const,
      type: 3,
      maxLevel: 1,
    })),
  ],
  learnedThrough: 11,
  activeTree: 0,
  freeResets: 0,
  resetCost: 8,
  scrolls: [],
  trees: emptyTrees(),
}
const withSlot = (view: SkillView, slot: number, skillId: number, level = 1): SkillView => ({
  ...view,
  trees: view.trees.map((slots, tree) =>
    slots.map((entry) =>
      tree === view.activeTree && entry.slot === slot ? { ...entry, skillId, level } : entry,
    ),
  ),
})
function setup(view: SkillView = skills, extra: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    'GET /api/game/skills': () => json(view),
    'POST /api/game/skills/slot': () => json({ ...view, character }),
    'POST /api/game/skills/tree': () => json({ ...view, character }),
    'POST /api/game/skills/reset': () => json({ ...view, character }),
    ...extra,
  })
  renderWithProviders(<SkillsWindow character={character} onClose={() => {}} />)
  return fetchMock
}
const bodies = (fetchMock: ReturnType<typeof mockApi>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => url === path).map(([, init]) => init?.body)
/** The icon picture of a skill cell, found by the cell's accessible name. */
const iconOf = (container: HTMLElement, name: string | RegExp) =>
  within(container).getByLabelText(name).parentElement!.querySelector('img')!

describe('Skills window', () => {
  it('lays out the passives, the 10x4 ninjutsu grid, ten equipped cells and five presets', async () => {
    setup()
    const passives = await screen.findByRole('region', { name: 'Passive skills' })
    expect(within(passives).getAllByRole('img', { name: /level|not learned/ })).toHaveLength(10)
    expect(within(passives).getByRole('img', { name: 'Fire Release, level 1' })).toBeVisible()
    const grid = screen.getByRole('region', { name: 'Ninjutsu' })
    // 40 ninjutsu: the learned ones are buttons, the rest pictures.
    expect(within(grid).getAllByRole('button')).toHaveLength(2)
    expect(within(grid).getAllByRole('img')).toHaveLength(38)
    expect(within(grid).getByRole('button', { name: 'Crystal Blade, level 2' })).toBeVisible()
    const equipped = screen.getByRole('region', { name: 'Equipped skills, preset 1' })
    expect(within(equipped).getAllByRole('img', { name: /empty/ })).toHaveLength(6)
    expect(within(equipped).getAllByRole('img', { name: 'Locked slot' })).toHaveLength(2)
    expect(within(equipped).getByRole('img', { name: 'Unlocks at 2 stars' })).toBeVisible()
    expect(within(equipped).getByRole('img', { name: 'Unlocks at 5 stars' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Equipped (0)' })).toBeVisible()
    for (const preset of [1, 2, 3, 4, 5])
      expect(screen.getByRole('button', { name: `Preset ${preset}` })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Preset 1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws Reborn icons, greys out unlearned skills and shows a tooltip', async () => {
    setup()
    const grid = await screen.findByRole('region', { name: 'Ninjutsu' })
    expect(iconOf(grid, /^Crystal Blade/)).toHaveAttribute('src', scrollSkillIcon(1803))
    expect(iconOf(grid, /^Crystal Blade/)).not.toHaveClass('grayscale')
    expect(iconOf(grid, /^Flame Fireball/)).toHaveAttribute('src', scrollSkillIcon(1809))
    expect(iconOf(grid, /^Flame Fireball/)).toHaveClass('grayscale')
    const passives = screen.getByRole('region', { name: 'Passive skills' })
    expect(iconOf(passives, 'Fire Release, level 1')).toHaveAttribute('src', scrollSkillIcon(2800))

    const thunderfall = within(grid).getByRole('button', { name: 'Thunderfall, level 1' })
    fireEvent.mouseEnter(thunderfall.closest('div')!)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Thunderfall.*Level 1.*Damage/)
  })

  it('equips a learned skill into the first empty slot of the shown preset', async () => {
    const fetchMock = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Crystal Blade, level 2' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Equip Crystal Blade' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Crystal Blade equipped.')
    expect(bodies(fetchMock, '/api/game/skills/slot')).toEqual([
      JSON.stringify({ tree: 0, slot: 0, skillId: 1803, level: 2 }),
    ])
  })

  it('greys out an equipped skill and unequips it from the Equipped row', async () => {
    const fetchMock = setup(withSlot(skills, 2, 1802))
    const grid = await screen.findByRole('region', { name: 'Ninjutsu' })
    expect(iconOf(grid, 'Thunderfall, level 1')).toHaveClass('grayscale')
    expect(screen.getByRole('heading', { name: 'Equipped (1)' })).toBeVisible()
    const equipped = screen.getByRole('region', { name: 'Equipped skills, preset 1' })
    await userEvent.click(within(equipped).getByRole('button', { name: 'Thunderfall, level 1' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unequip Thunderfall' }))
    expect(bodies(fetchMock, '/api/game/skills/slot')).toEqual([
      JSON.stringify({ tree: 0, slot: 2, skillId: null }),
    ])
  })

  it('refuses to equip when all six slots are full', async () => {
    const full = [1808, 3809, 3804, 3815, 3813, 3820].reduce(
      (view, id, slot) => withSlot(view, slot, id),
      skills,
    )
    setup(full)
    await userEvent.click(await screen.findByRole('button', { name: 'Crystal Blade, level 2' }))
    const equip = screen.getByRole('menuitem', { name: 'Equip Crystal Blade' })
    expect(equip).toBeDisabled()
    expect(equip).toHaveAccessibleDescription('All slots are full.')
  })

  it('lets a learned higher grade be lowered for a slot', async () => {
    const fetchMock = setup(withSlot(skills, 0, 1803, 2))
    const equipped = await screen.findByRole('region', { name: 'Equipped skills, preset 1' })
    await userEvent.click(within(equipped).getByRole('button', { name: 'Crystal Blade, level 2' }))
    expect(screen.getByRole('menuitem', { name: 'Use Crystal Blade at level 2' })).toBeDisabled()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use Crystal Blade at level 1' }))
    expect(bodies(fetchMock, '/api/game/skills/slot')).toEqual([
      JSON.stringify({ tree: 0, slot: 0, skillId: 1803, level: 1 }),
    ])
  })

  it('switches to another preset', async () => {
    const fetchMock = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Preset 5' }))
    expect(bodies(fetchMock, '/api/game/skills/tree')).toEqual([JSON.stringify({ tree: 4 })])
    expect(await screen.findByRole('status')).toHaveTextContent('Preset 5 active.')
  })

  it('keeps the server state and explains rejected assignments', async () => {
    setup(skills, {
      'POST /api/game/skills/slot': () =>
        apiError(400, 'not_learned', 'That skill is not learned.'),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Crystal Blade, level 2' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Equip Crystal Blade' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That skill is not learned.')
    expect(screen.getByRole('heading', { name: 'Equipped (0)' })).toBeVisible()
  })

  it('confirms the cost and currency in Info before requesting a paid reset', async () => {
    const fetchMock = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Info' }))
    const info = screen.getByRole('dialog', { name: 'Skill info' })
    expect(info).toHaveTextContent('Learned ninjutsu: 2 of 40.')
    await userEvent.selectOptions(
      within(info).getByRole('combobox', { name: 'Reset currency' }),
      'giftCoupon',
    )
    await userEvent.click(within(info).getByRole('button', { name: 'Reset skills' }))
    expect(within(info).getByText(/clear all five presets/)).toHaveTextContent('8 Gift Coupons')
    expect(bodies(fetchMock, '/api/game/skills/reset')).toEqual([])
    await userEvent.click(within(info).getByRole('button', { name: 'Confirm reset' }))
    expect(bodies(fetchMock, '/api/game/skills/reset')).toEqual([
      JSON.stringify({ currency: 'giftCoupon' }),
    ])
  })

  it('uses a free reset before currency, even with an empty balance', async () => {
    const fetchMock = mockApi({
      'GET /api/game/skills': () => json({ ...skills, freeResets: 1 }),
      'POST /api/game/skills/reset': () => json({ ...skills, character }),
    })
    renderWithProviders(
      <SkillsWindow character={{ ...character, gold: 0, giftCoupon: 0 }} onClose={() => {}} />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Info' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset skills' }))
    expect(screen.getByText(/clear all five presets/)).toHaveTextContent('one free reset')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm reset' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/skills/reset',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('lists scroll skills with time left and slots them up to two per preset', async () => {
    const view: SkillView = withSlot(
      withSlot(
        {
          ...skills,
          scrolls: [
            { skillId: 1831, expiresAt: null },
            {
              skillId: 1833,
              expiresAt: new Date(Date.now() + 3 * 86_400_000 + 9_000_000).toISOString(),
            },
            { skillId: 18046, expiresAt: null },
          ],
        },
        0,
        1831,
      ),
      1,
      1833,
    )
    const fetchMock = setup(view)
    await userEvent.click(await screen.findByRole('button', { name: 'Scroll Skills' }))
    const panel = screen.getByRole('dialog', { name: 'Scroll Skills' })
    expect(within(panel).getByText('Izanagi')).toBeVisible()
    expect(within(panel).getAllByText('Permanent')).toHaveLength(2)
    expect(within(panel).getByText('3d 2h left')).toBeVisible()
    expect(
      within(panel).getByRole('button', { name: 'Add Royal Hollow Flash to preset 1' }),
    ).toBeDisabled()
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Remove Izanagi from preset 1' }),
    )
    expect(bodies(fetchMock, '/api/game/skills/slot')).toEqual([
      JSON.stringify({ tree: 0, slot: 0, skillId: null }),
    ])
  })

  it('has an icon in the Reborn asset manifest for every skill the window draws', async () => {
    const { default: assets } = await import('../generated/reborn-assets.json')
    const urls = new Set(Object.values(assets as Record<string, { url: string }>).map((a) => a.url))
    for (const id of [
      1831, 1833, 1834, 1835, 1836, 18041, 18042, 18043, 18044, 18045, 18046, 18091,
      // Reborn icon ids of our grid (3809 drawn as 1809) and of passives 2801-2810.
      1802, 1803, 1805, 1807, 1808, 1809, 1810, 1813, 1814, 1815, 1816, 1822, 1823, 1825, 1826,
      1827, 1828, 1829, 1830, 1832, 1839, 3802, 3803, 3804, 3805, 3806, 3807, 3810, 3811, 3812,
      3813, 3814, 3815, 3819, 3820, 3821, 3822, 3825, 3826, 3827, 2800, 2801, 2802, 2803, 2804,
      2805, 2806, 2807, 2808, 2809,
    ])
      expect(urls).toContain(scrollSkillIcon(id))
  })
})
