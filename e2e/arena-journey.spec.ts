// M4 arena journey: a ninja wins an arena fight from the Arena window and spends the Honor in the
// Honor shop. The level (arena opens at 15), a strong weapon and starting Honor are seeded.
import { expect, test } from '@playwright/test'
import { armNinja, createSeededNinja, dialog, skipReplay, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

// arena-honor-shop.json: the cheapest offer, open from the first rank.
const OFFER = { id: 'i292101', name: 'Beastlord Warchest', honor: 180 }

const honorOf = (name: string) =>
  Number(sql(`select honor from characters where name = :'name'`, { name }))

test('a ninja wins an arena fight and buys from the Honor shop', async ({ browser }) => {
  // Arrange: level 20 with 175 Honor, short of the offer until a win pays 9 (Beginner I).
  const { context, page, name: ninja } = await createSeededNinja(browser, 'Arena')
  try {
    await armNinja(page, ninja, 'level = 20, honor = 175')

    // Act: open the arena and attack the first opponent.
    await page.getByRole('button', { name: 'Arena', exact: true }).click()
    const arena = dialog(page, 'Arena')
    const summary = arena.getByRole('region', { name: 'Your arena' })
    await expect(summary).toContainText('Honor175')
    await arena
      .getByRole('list', { name: 'Row 1' })
      .getByRole('button', { name: /^Attack / })
      .first()
      .click()
    await skipReplay(page)

    // Assert: a win with Honor, and one opponent marked beaten.
    await expect(arena.getByRole('status')).toContainText(/^Victory! .*Honor \+\d+\.$/)
    const honor = honorOf(ninja)
    expect(honor).toBeGreaterThanOrEqual(OFFER.honor)
    await expect(arena.getByText('Beaten', { exact: true })).toHaveCount(1)

    // Act: buy the offer in the Honor shop.
    await arena.getByRole('tab', { name: 'Honor Shop' }).click()
    await expect(arena).toContainText(`Honor: ${honor}`)
    await arena.getByRole('button', { name: `Buy ${OFFER.name}` }).click()

    // Assert: the Honor is spent and the item is in the bag.
    await expect(arena.getByText(`You bought ${OFFER.name}.`)).toBeVisible()
    await expect(arena).toContainText(`Honor: ${honor - OFFER.honor}`)
    expect(honorOf(ninja)).toBe(honor - OFFER.honor)
    expect(
      sql(
        `select count(*) from inventory_items i join characters c on c.id = i.character_id
       where c.name = :'name' and i.item_id = :'item'`,
        { name: ninja, item: OFFER.id },
      ),
    ).toBe('1')
  } finally {
    await context.close()
  }
})
