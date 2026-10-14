// M5 bloodlines journey: a level-51 ninja turns in limit items at the Ninja House and activates the
// unlocked bloodline. The level and the items are seeded; the turn-in and activation use the UI.
import { expect, test } from '@playwright/test'
import {
  createSeededNinja,
  dialog,
  giveItem,
  openMenu,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// bloodlines.json, limit 1 (level 16): 4 items a turn-in, 30 Amity a turn-in, 30 Amity unlock it.
const LIMIT = { id: 1, item: 'i148023', itemsPerTurnIn: 4 }

const limitRow = (name: string) =>
  sql(
    `select b.amity, b.unlocked_at is not null, coalesce(b.active_slot::text, '') from character_bloodlines b
     join characters c on c.id = b.character_id where c.name = :'name' and b.limit_id = :'id'`,
    { name, id: LIMIT.id },
  )

test('a level-51 ninja turns in limit items and activates a bloodline', async ({ browser }) => {
  // Arrange: level 51 with exactly the items for one turn-in.
  const { context, page, name } = await createSeededNinja(browser, 'Blood')
  try {
    seedCharacter(name, 'level = 51')
    giveItem(name, LIMIT.item, { count: LIMIT.itemsPerTurnIn })
    await reloadGame(page)

    // Act: Inventory, Blood Limit (as in Reborn), then the first Ninja House entry's turn-in.
    await openMenu(page, 'Inventory')
    await dialog(page, 'Inventory')
      .getByRole('button', { name: 'Blood Limit', exact: true })
      .click()
    const bloodlines = dialog(page, 'Bloodlines')
    await bloodlines.getByRole('list', { name: 'Ninja House' }).getByRole('button').first().click()
    const turnedIn = page.waitForResponse(
      (r) => r.url().includes(`/api/game/bloodlines/${LIMIT.id}/turn-in`) && r.ok(),
    )
    await bloodlines.getByRole('button', { name: /^Turn in \d+ items$/ }).click()
    await turnedIn

    // Assert: the items are spent and 30 Amity unlock the bloodline.
    await expect(bloodlines.getByRole('button', { name: 'Activate', exact: true })).toBeVisible()
    expect(limitRow(name)).toBe('30|t|')
    expect(
      sql(
        `select count(*) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item'`,
        { name, item: LIMIT.item },
      ),
    ).toBe('0')

    // Act: activate it.
    const activated = page.waitForResponse(
      (r) => r.url().includes(`/api/game/bloodlines/${LIMIT.id}/active`) && r.ok(),
    )
    await bloodlines.getByRole('button', { name: 'Activate', exact: true }).click()
    await activated

    // Assert: it fills a slot of the Bloodlines tab and slot 0 of the database.
    await bloodlines.getByRole('tab', { name: 'Active', exact: true }).click()
    await expect(
      bloodlines
        .getByRole('list', { name: 'Active bloodlines' })
        .getByRole('button', { name: 'Deactivate', exact: true }),
    ).toHaveCount(1)
    await expect(bloodlines.getByRole('list', { name: 'Bloodline bonuses' })).toBeVisible()
    expect(limitRow(name)).toBe('30|t|0')
  } finally {
    await context.close()
  }
})
