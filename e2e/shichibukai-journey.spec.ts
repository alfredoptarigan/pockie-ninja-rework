// Shichibukai journey: a level-30 ninja opens Shichibukai from the village icon, starts an Easy
// floor 1 expedition for one of today's attempts and rolls the dice once.
import { expect, test } from '@playwright/test'
import { armNinja, createSeededNinja, dialog, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

test('a level-30 ninja starts an expedition and rolls the dice', async ({ browser }) => {
  // Arrange: level 30 (the unlock level).
  const { context, page, name } = await createSeededNinja(browser, 'Warlrd')
  try {
    await armNinja(page, name, 'level = 30')

    // Act: open Shichibukai, start Floor 1 Easy and roll.
    await page.getByRole('button', { name: 'Shichibukai', exact: true }).click()
    const window = dialog(page, 'Shichibukai')
    const start = window.getByRole('region', { name: 'Choose Expedition' })
    await expect(start.getByText('Attempts:')).toBeVisible()
    await start.getByRole('button', { name: 'Floor 1 Easy' }).click()
    await start.getByRole('button', { name: 'Start' }).click()
    const status = window.getByRole('region', { name: 'Expedition status' })
    await expect(status).toContainText('Floor 1 · Easy')
    await status.getByRole('button', { name: 'Roll Dice' }).click()

    // Assert: the roll is reported and the database holds the run with one throw.
    await expect(window.getByRole('status').filter({ hasText: /^Rolled [1-6]/ })).toBeVisible()
    expect(
      sql(
        `select s.attempts_used || ',' || (s.run->>'throws') from shichibukai_players s
         join characters c on c.id = s.character_id where c.name = :'name'`,
        { name },
      ),
    ).toBe('1,1')
  } finally {
    await context.close()
  }
})
