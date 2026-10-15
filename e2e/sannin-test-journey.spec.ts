// Sannin Test journey: a level-60 ninja opens the Sannin Test from the village icon, shakes the
// six dice, claims the result and earns Growing Points.
import { expect, test } from '@playwright/test'
import { armNinja, createSeededNinja, dialog, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

test('a level-60 ninja rolls the six dice and claims Growing Points', async ({ browser }) => {
  // Arrange: level 60 (the unlock level).
  const { context, page, name } = await createSeededNinja(browser, 'Sannin')
  try {
    await armNinja(page, name, 'level = 60')

    // Act: open the Sannin Test, shake the dice and claim with Ok.
    await page.getByRole('button', { name: 'Sannin Test', exact: true }).click()
    const window = dialog(page, 'Sannin Test')
    const counters = window.getByRole('region', { name: 'Sannin counters' })
    await expect(counters).toContainText('Growing Points: 0')
    await window.getByRole('button', { name: 'Shake the Sannin dice' }).click()
    const result = dialog(page, 'Sannin Test Result')
    await expect(result.getByRole('list', { name: 'Dice' }).getByRole('img')).toHaveCount(6)
    await result.getByRole('button', { name: 'Ok' }).click()

    // Assert: points in the window, one die used and nothing pending in the database.
    await expect(counters).not.toContainText('Growing Points: 0')
    expect(
      sql(
        `select s.dice_used || ',' || (s.pending is null) || ',' || (s.growth_points > 0)
         from sannin_players s join characters c on c.id = s.character_id
         where c.name = :'name'`,
        { name },
      ),
    ).toBe('1,true,true')
  } finally {
    await context.close()
  }
})
