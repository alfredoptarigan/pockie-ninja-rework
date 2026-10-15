import { screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { PlayerView } from '../../../../shared/src/schemas/social'
import { stats } from '../../test/game'
import { json, mockApi, renderWithProviders } from '../../test/utils'
import { ViewCharacter } from './ViewCharacter'

const base: PlayerView = {
  player: {
    characterId: 'id-Bo',
    name: 'Bo',
    level: 31,
    nation: 0,
    gender: 0,
    clothing: 3,
    avatarId: 1,
  },
  online: true,
  equipped: [],
  hideStats: false,
}
const skills = Array.from({ length: 6 }, (_, slot) =>
  slot === 0 ? { slot, skillId: 1803, level: 2 } : { slot, skillId: null, level: 0 },
)

async function renderView(view: PlayerView) {
  mockApi({
    'GET /api/game/social/players/id-Bo': () => json(view),
    'GET /api/game/social/blocks': () => json({ blocked: [], max: 100 }),
  })
  renderWithProviders(
    <ViewCharacter characterId="id-Bo" selfId="c1" onClose={() => {}} onWhisper={() => {}} />,
  )
  return screen.findByRole('region', { name: 'Stats' })
}

it("shows a visible ninja's stats like the Stats window and the active skills", async () => {
  const panel = await renderView({ ...base, stats, skills })
  expect(within(panel).getByTitle('Bo')).toBeVisible()
  expect(within(panel).getByTitle('31')).toBeVisible()
  expect(within(panel).getByText('8 - 9')).toBeVisible()
  // Reborn's View Character shows the maximum HP only.
  expect(within(panel).getByText('160')).toBeVisible()
  expect(within(panel).getByTitle('10.21% damage reduction')).toHaveTextContent('154')
  expect(within(panel).getByText('Hover over stats to get detailed information.')).toBeVisible()

  const strip = screen.getByRole('region', { name: 'Skills' })
  expect(within(strip).getByRole('img', { name: /level 2$/ })).toBeVisible()
  expect(within(strip).getAllByRole('img', { name: /: empty$/ })).toHaveLength(5)
  expect(within(strip).getAllByRole('img', { name: 'Locked slot' })).toHaveLength(4)
})

it('shows every stat as 0 and no skills when the ninja hides them', async () => {
  const panel = await renderView({ ...base, hideStats: true })
  expect(within(panel).getByTitle('Bo')).toBeVisible()
  const values = within(panel)
    .getAllByRole('definition')
    .slice(2)
    .map((cell) => cell.textContent)
  expect(values).toHaveLength(15)
  expect(new Set(values)).toEqual(new Set(['0']))
  const strip = screen.getByRole('region', { name: 'Skills' })
  expect(within(strip).getAllByRole('img', { name: /: empty$/ })).toHaveLength(6)
})
