// Gems: a ninja drops a held gem onto the helmet it wears (Reborn's gemInsert), sees it under
// SOCKETED GEMS in the tooltip and in the Stats window's STR, then takes the helmet off and gets
// the gem back with the bag menu's Remove Gems. The helmet (one open socket) and the gem are seeded.
import { expect, test, type Page } from '@playwright/test'
import {
  createSeededNinja,
  dialog,
  giveItem,
  heldCount,
  openMenu,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// i220103: Light Leather Hat, level 23, MaxHoleCount 2. i110101: Ruby Level 1, StrengthEquip 1400
// (+14 STR).
const HAT = { itemId: 'i220103', name: 'Light Leather Hat' }
const RUBY = { itemId: 'i110101', name: 'Ruby Level 1', strength: 14 }

const hatGems = (name: string) =>
  sql(
    `select i.gems::text from inventory_items i join characters c on c.id = i.character_id
     where c.name = :'name' and i.item_id = :'item'`,
    { name, item: HAT.itemId },
  )

/** Opens the Stats window and returns its STR value box. */
async function openStrength(page: Page) {
  await openMenu(page, 'Character')
  return dialog(page, 'Stats')
    .getByRole('term')
    .filter({ hasText: /^STR$/ })
    .locator('xpath=following-sibling::dd[1]')
}
const closeStats = (page: Page) =>
  dialog(page, 'Stats').getByRole('button', { name: 'Close' }).click()

test('a ninja sockets a gem, sees it in the tooltip and stats, and removes it', async ({
  browser,
}) => {
  // Arrange: a level-30 ninja wearing the hat with one open socket, and a ruby in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Gem')
  try {
    seedCharacter(name, 'level = 30')
    giveItem(name, HAT.itemId, { equipped_slot: 'Hat', gems: '[null]' })
    giveItem(name, RUBY.itemId)
    await reloadGame(page)
    const before = Number(await (await openStrength(page)).textContent())
    await closeStats(page)

    // Act: pick the ruby up and click the worn hat.
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')
    const equipment = bag.getByRole('list', { name: 'Equipment' })
    await bag
      .getByRole('list', { name: 'Bag' })
      .getByRole('button', { name: RUBY.name, exact: true })
      .click()
    const inserted = page.waitForResponse((r) => r.url().endsWith('/gems/insert') && r.ok())
    await equipment.getByRole('button', { name: HAT.name, exact: true }).click()
    await inserted

    // Assert: the gem left the bag and sits in the hat's socket, in the tooltip too.
    await expect.poll(() => hatGems(name)).toBe(`["${RUBY.itemId}"]`)
    expect(heldCount(name, RUBY.itemId)).toBe('0')
    await equipment.getByRole('button', { name: HAT.name, exact: true }).hover()
    const tooltip = bag.getByRole('tooltip')
    await expect(tooltip.getByRole('list', { name: 'Socketed Gems' })).toContainText(
      `Strength+${RUBY.strength}`,
    )
    await bag.getByRole('button', { name: 'Close' }).click()

    // Assert: the Stats window counts the gem.
    await expect(await openStrength(page)).toHaveText(String(before + RUBY.strength))
    await closeStats(page)

    // Act: take the hat off onto bag tab II, then Remove Gems from its menu.
    await openMenu(page, 'Inventory')
    await equipment.getByRole('button', { name: HAT.name, exact: true }).click()
    await bag.getByRole('tab', { name: 'II', exact: true }).click()
    const unequipped = page.waitForResponse((r) => r.url().endsWith('/unequip') && r.ok())
    await bag.getByRole('button', { name: 'Tile 1', exact: true }).click()
    await unequipped
    await bag
      .getByRole('list', { name: 'Bag' })
      .getByRole('button', { name: HAT.name, exact: true })
      .click({ button: 'right' })
    const removed = page.waitForResponse((r) => r.url().endsWith('/gems/remove') && r.ok())
    await page.getByRole('menuitem', { name: `Remove Gems ${HAT.name}`, exact: true }).click()
    await removed

    // Assert: the ruby is back in the bag and the socket is open again.
    await expect.poll(() => heldCount(name, RUBY.itemId)).toBe('1')
    expect(hatGems(name)).toBe('[null]')
  } finally {
    await context.close()
  }
})
