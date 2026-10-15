// Konoha Boutique journey: a ninja opens the boutique from the village icon, claims free coins,
// spins once, buys coins with Gold, previews a reward's tooltip and buys it into the bag.
import { expect, test } from '@playwright/test'
import { createSeededNinja, dialog, heldCount, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const coins = (name: string) =>
  sql(
    `select coins from konoha_boutique b join characters c on c.id = b.character_id
     where c.name = :'name';`,
    { name },
  )

test('a ninja claims free coins, spins, buys coins and exchanges them for an item', async ({
  browser,
}) => {
  // Arrange: 10 Gold for the cheapest coin tier.
  const { context, page, name } = await createSeededNinja(browser, 'Btq')
  try {
    seedCharacter(name, 'gold = 10')
    await reloadGame(page)

    // Act: open the boutique and claim the free coins.
    await page.getByRole('button', { name: 'Konoha Boutique', exact: true }).click()
    const boutique = dialog(page, 'Konoha Boutique')
    const balance = boutique.getByLabel('Boutique Coins')
    await expect(balance).toHaveText('0')
    await boutique.getByRole('button', { name: 'Free Coins' }).click()

    // Assert: 500 coins and the timer runs.
    await expect(balance).toHaveText('500')
    await expect(boutique.getByText(/^Next free coins in: 0[45]:\d\d$/)).toBeVisible()

    // Act: one spin at the smallest bet.
    await boutique.getByRole('button', { name: 'Try Your Luck' }).click()

    const machine = boutique.getByRole('group', { name: 'Slot machine' })
    await expect(machine).toHaveAttribute('aria-busy', 'true')

    // Assert: the reels stop and the bet left the server balance (plus whatever it won).
    await expect(machine).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 })
    const net = sql(
      `select coins + double_coins - last_won from konoha_boutique b
       join characters c on c.id = b.character_id where c.name = :'name';`,
      { name },
    )
    expect(net).toBe('499')
    const afterSpin = Number(coins(name))

    // Act: buy 1,000 coins for 10 Gold.
    await boutique.getByRole('button', { name: 'Buy Coins' }).click()
    const buy = dialog(page, 'Buy Boutique Coins')
    await buy.getByRole('button', { name: '10 Gold → 1,000 Coins' }).click()
    await expect(buy.getByText('Your Gold: 0')).toBeVisible()
    expect(Number(coins(name))).toBe(afterSpin + 1_000)
    await buy.getByRole('button', { name: 'Close' }).click()

    // Act: preview a reward and buy it.
    const potions = Number(heldCount(name, 'i160010'))
    await boutique.getByRole('button', { name: 'Buy Items' }).click()
    const shop = dialog(page, 'Exchange Rewards')
    const card = shop.getByRole('listitem').filter({ hasText: '500 Coins' }).first()
    await card.hover()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await card.getByRole('button', { name: /^Purchase/ }).click()
    const confirm = dialog(page, 'Confirm Purchase')
    await expect(confirm).toContainText('500 Coins')
    await confirm.getByRole('button', { name: 'Confirm' }).click()

    // Assert: ten potions in the bag and 500 coins spent.
    await expect.poll(() => Number(heldCount(name, 'i160010'))).toBe(potions + 10)
    expect(Number(coins(name))).toBe(afterSpin + 500)
  } finally {
    await context.close()
  }
})
