// Ninja Mall journey: a ninja opens the Mall from the village icon, browses the Gem tab, buys three
// Lv.1 Engrave Blades for Gold with the quantity field, and finds them in the bag.
import { expect, test } from '@playwright/test'
import { createSeededNinja, dialog, heldCount, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const BLADE = 'i350001' // Lv.1 Engrave Blade, 20 Gold or Coupons (2011 Mall)

test('a ninja buys three items from the Ninja Mall with Gold', async ({ browser }) => {
  // Arrange: 100 Gold.
  const { context, page, name } = await createSeededNinja(browser, 'Mall')
  try {
    seedCharacter(name, 'gold = 100')
    await reloadGame(page)

    // Act: open the Mall and switch to the Gem tab.
    await page.getByRole('button', { name: 'Ninja Mall', exact: true }).click()
    const mall = dialog(page, 'Mall')
    await expect(mall.getByRole('tab', { name: 'Hot' })).toHaveAttribute('aria-selected', 'true')
    await mall.getByRole('tab', { name: 'Gem' }).click()
    const card = mall.getByRole('listitem', { name: 'Lv.1 Engrave Blade' })
    await expect(card).toBeVisible()

    // Act: buy 3 for Gold.
    await card.getByRole('button', { name: 'Buy Lv.1 Engrave Blade for Gold' }).click()
    const prompt = page.getByRole('alertdialog', { name: 'Buy item' })
    await expect(prompt).toContainText('Price: 20 Gold')
    await prompt.getByRole('spinbutton', { name: 'Quantity' }).fill('3')
    await expect(prompt).toContainText('Total: 60 Gold')
    await prompt.getByRole('button', { name: 'Accept' }).click()

    // Assert: the toast, the balance in the footer, the bag and the database.
    await expect(page.getByText('Purchase successful!')).toBeVisible()
    await expect(
      mall
        .getByRole('group', { name: 'Balances' })
        .getByRole('img', { name: 'Gold' })
        .locator('..'),
    ).toHaveText('40')
    expect(heldCount(name, BLADE)).toBe('3')
    expect(sql(`select gold from characters where name = :'name';`, { name })).toBe('40')
  } finally {
    await context.close()
  }
})
