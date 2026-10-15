// Collection journey: a ninja opens the Collection from the Inventory, looks through the Avatars /
// Pets / Gear Sets tabs and submits a spare outfit, which is destroyed and adds its STR / AGI / STA.
import { expect, test } from '@playwright/test'
import {
  createSeededNinja,
  dialog,
  giveItem,
  heldCount,
  openMenu,
  reloadGame,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// i290109: clothing 9 (Love Aikawa) at +2; collection-data.json Gray: [9, 3, 0, 1].
const OUTFIT = { itemId: 'i290109', name: 'Love Aikawa' }

const collectedRows = (name: string) =>
  sql(
    `select k.kind || ':' || k.entry from character_collection k
     join characters c on c.id = k.character_id where c.name = :'name'`,
    { name },
  )

test('a ninja submits a spare outfit to the Collection', async ({ browser }) => {
  // Arrange: a spare +2 outfit in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Coll')
  try {
    giveItem(name, OUTFIT.itemId)
    await reloadGame(page)

    // Act: Inventory > Collection opens on Avatars; the other tabs list pets and gear sets.
    await openMenu(page, 'Inventory')
    await dialog(page, 'Inventory').getByRole('button', { name: 'Collection', exact: true }).click()
    const collection = dialog(page, 'Collection')
    await expect(collection.getByRole('tab', { name: 'Avatars' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await collection.getByRole('tab', { name: 'Pets' }).click()
    await expect(collection.getByRole('list', { name: 'Pets' })).toBeVisible()
    await collection.getByRole('tab', { name: 'Gear Sets' }).click()
    await expect(collection.getByRole('list', { name: 'Gear Sets' })).toBeVisible()
    await collection.getByRole('tab', { name: 'Avatars' }).click()

    // Act: Gray, READY, then submit the outfit after confirming.
    await collection.getByRole('button', { name: /^Gray 0\/18/ }).click()
    await collection.getByRole('button', { name: 'READY', exact: true }).click()
    await collection
      .getByRole('list', { name: 'Outfits' })
      .getByRole('button', { name: OUTFIT.name, exact: true })
      .click()
    const submit = collection.getByRole('dialog', { name: 'Submit Outfit' })
    await submit.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(submit).toContainText('Are you sure you want to destroy this outfit?')
    const done = page.waitForResponse((r) => r.url().endsWith('/collection/submit') && r.ok())
    await submit.getByRole('button', { name: 'Confirm', exact: true }).click()
    const view = await (await done).json()

    // Assert: collected once, the copy is gone and the Total shows the outfit's stats.
    expect(view.outfits.stats).toEqual([3, 0, 1])
    expect(collectedRows(name)).toBe('outfit:9')
    expect(heldCount(name, OUTFIT.itemId)).toBe('0')
    const total = collection.getByRole('region', { name: 'Total' })
    await expect(total).toContainText('Strength+3')
    await expect(total).toContainText('Stamina+1')
    await expect(collection.getByRole('button', { name: /^Gray 1\/18/ })).toBeVisible()
  } finally {
    await context.close()
  }
})
