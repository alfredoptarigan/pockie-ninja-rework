// M5 bloodlines journey: a level-51 ninja turns in limit items to a Ninja House NPC (Talk, Ninja
// Saga) and activates the unlocked limit in Bloodline Limits (Inventory, Blood Limit), as in Reborn.
// The level and the items are seeded; the turn-in and activation use the UI.
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

    // Act: Ninja House from the bottom bar, Talk to the first NPC (limit 1, the lowest level).
    await openMenu(page, 'Ninja House')
    const house = dialog(page, 'Ninja House')
    await house
      .getByRole('list', { name: 'Ninja House' })
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: 'Talk', exact: true })
      .click()
    const saga = dialog(page, 'Ninja Saga')
    const turnedIn = page.waitForResponse(
      (r) => r.url().includes(`/api/game/bloodlines/${LIMIT.id}/turn-in`) && r.ok(),
    )
    await saga.getByRole('button', { name: 'Turn In', exact: true }).click()
    await turnedIn

    // Assert: the items are spent and 30 Amity unlock the bloodline.
    await expect(saga.getByText('30/30', { exact: true })).toBeVisible()
    await expect(saga.getByRole('button', { name: 'Turn In', exact: true })).toBeDisabled()
    expect(limitRow(name)).toBe('30|t|')
    expect(
      sql(
        `select count(*) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item'`,
        { name, item: LIMIT.item },
      ),
    ).toBe('0')
    await saga.getByRole('button', { name: 'Close', exact: true }).click()
    await house.getByRole('button', { name: 'Close', exact: true }).click()

    // Act: Inventory, Blood Limit, pick the limit in the collection and activate it.
    await openMenu(page, 'Inventory')
    await dialog(page, 'Inventory')
      .getByRole('button', { name: 'Blood Limit', exact: true })
      .click()
    const limits = dialog(page, 'Bloodline Limits')
    await limits
      .getByRole('list', { name: 'Limits' })
      .getByRole('button', { name: /^Body Enlargement Technique/ })
      .click()
    const activated = page.waitForResponse(
      (r) => r.url().includes(`/api/game/bloodlines/${LIMIT.id}/active`) && r.ok(),
    )
    await limits.getByRole('button', { name: 'Activate', exact: true }).click()
    await activated

    // Assert: it fills a slot of the Active bar and slot 0 of the database.
    await expect(
      limits
        .getByRole('list', { name: 'Active bloodlines' })
        .getByRole('button', { name: /^Body Enlargement Technique/ }),
    ).toBeEnabled()
    await expect(limits.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible()
    await expect(limits.getByRole('list', { name: 'Bloodline bonuses' })).not.toContainText(
      'Activate a collected limit',
    )
    expect(limitRow(name)).toBe('30|t|0')
  } finally {
    await context.close()
  }
})
