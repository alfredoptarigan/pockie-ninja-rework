// M4 smoke: two ninjas in separate browser contexts meet in Angel City (seeded) and each sees the
// other in the scene's player list.
import { expect, test } from '@playwright/test'
import { createTwoNinjas, expectScene, meetInScene, openPlayerList } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// Angel City, as economy-journey.spec.ts reaches it.
const ANGEL_CITY = { id: 161, name: 'Angel City' }

test('two ninjas in the same scene see each other in the player list', async ({ browser }) => {
  // Arrange
  const players = await createTwoNinjas(browser, ['Left', 'Right'])
  try {
    await meetInScene([...players], ANGEL_CITY.id)

    // Act and assert
    for (const [self, other] of [players, [players[1], players[0]]] as const) {
      await expectScene(self.page, ANGEL_CITY.name)
      const list = await openPlayerList(self.page)
      await expect(list).toHaveAccessibleName('Players here (2)')
      await expect(list.getByText(other.name, { exact: true })).toBeVisible()
      await expect(list.getByText(self.name, { exact: true })).toBeVisible()
    }
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
