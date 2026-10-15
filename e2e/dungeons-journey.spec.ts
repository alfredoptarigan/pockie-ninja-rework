// Scroll Dungeons journey: a level-45 ninja opens Dungeons from the village icon, fights one of
// today's bosses, sees the result and has one attempt fewer.
import { expect, test } from '@playwright/test'
import { armNinja, createSeededNinja, dialog, skipReplay, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

test('a level-45 ninja fights a dungeon boss and spends an attempt', async ({ browser }) => {
  // Arrange: level 45 (the unlock level) with the strong journey weapon.
  const { context, page, name } = await createSeededNinja(browser, 'Scroll')
  try {
    await armNinja(page, name, 'level = 45')

    // Act: open Dungeons from the top-right icon and fight the first boss of the day.
    await page.getByRole('button', { name: 'Dungeons', exact: true }).click()
    const dungeons = dialog(page, 'Dungeons')
    await expect(dungeons.getByText('25/25')).toBeVisible()
    const bosses = dungeons.getByRole('list', { name: "Today's bosses" }).getByRole('button')
    await expect(bosses).toHaveCount(3)
    await bosses.first().click()
    await skipReplay(page)

    // Assert: the result window, then one attempt spent in the window and the database.
    const result = page.getByRole('dialog', { name: /^(Victory|Defeat)$/ })
    await expect(result).toContainText('Daily attempts left: 24/25.')
    await result.getByRole('button', { name: 'OK' }).click()
    await expect(dialog(page, 'Dungeons').getByText('24/25')).toBeVisible()
    expect(
      sql(
        `select d.attempts_used from dungeon_players d join characters c on c.id = d.character_id
         where c.name = :'name'`,
        { name },
      ),
    ).toBe('1')
  } finally {
    await context.close()
  }
})
