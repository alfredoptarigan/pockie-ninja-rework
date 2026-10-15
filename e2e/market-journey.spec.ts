// Market Board journey (Reborn's Market window): one ninja lists an item from Sell Items, another
// finds it on the Market tab, buys it and collects it from Storage; the seller sees the sale in
// History and collects the proceeds (after the 10% tax) from the Storage Vault. Levels, Stone and
// the item are seeded; everything else goes through the window.
import { expect, test, type Page } from '@playwright/test'
import {
  createTwoNinjas,
  dialog,
  expectCurrency,
  giveItem,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

// Strawberry: a stackable food with a Market category and CanTrade 2; seeded unbound.
const ITEM = { id: 'i120010', name: 'Strawberry', count: 5 }
const PRICE = 200
const PROCEEDS = PRICE - PRICE / 10

const stoneOf = (name: string) =>
  Number(sql(`select stone from characters where name = :'name'`, { name }))

async function openMarket(page: Page, tab: string) {
  // Reborn: the Market is a village icon (top right), not a menu button.
  await page
    .getByRole('navigation', { name: 'Features' })
    .getByRole('button', { name: 'Market' })
    .click()
  const market = dialog(page, 'Market')
  await market.getByRole('tab', { name: tab }).click()
  return market
}

test('a ninja lists an item, another buys and collects it, the seller collects the proceeds', async ({
  browser,
}) => {
  // Arrange: two level-25 ninjas (the Market level) with Stone; the seller has strawberries.
  const players = await createTwoNinjas(browser, ['Seller', 'Buyer'])
  const [seller, buyer] = players
  try {
    for (const { name } of players) seedCharacter(name, 'level = 25, stone = 1000')
    giveItem(seller.name, ITEM.id, { count: ITEM.count, bound: false })
    for (const { page } of players) {
      await reloadGame(page)
      await expectCurrency(page, 'Stone', 1000)
    }

    // Act: the seller picks the strawberries and lists one for 200 Stones.
    let market = await openMarket(seller.page, 'Sell Items')
    await market.getByRole('button', { name: 'Select an item to sell' }).click()
    await dialog(seller.page, 'Select an Item')
      .getByRole('button', { name: `${ITEM.name} x${ITEM.count}` })
      .click()
    const sell = dialog(seller.page, 'Sell Item')
    await sell.getByLabel('Quantity').fill('1')
    await sell.getByLabel('Unit Price').fill(String(PRICE))
    await expect(sell).toContainText(new RegExp(`You receive:\\s*${PROCEEDS}`))
    await sell.getByRole('button', { name: 'Sell', exact: true }).click()

    // Assert: listed, the fee paid and the listing in Sell Items.
    await expect(market.getByRole('status')).toHaveText(`${ITEM.name} is on the Market.`)
    await expect(market).toContainText('Listings: 1/5')
    await expect(market.getByRole('table', { name: 'Your listings' })).toContainText(ITEM.name)
    const afterFee = stoneOf(seller.name)
    expect(afterFee).toBeLessThan(1000)
    await expectCurrency(seller.page, 'Stone', afterFee)
    await market.getByRole('button', { name: 'Close' }).click()

    // Act: the buyer searches the board, opens the strawberries and buys the cheapest.
    market = await openMarket(buyer.page, 'Market')
    await market.getByLabel('Search').fill(ITEM.name)
    await market.getByRole('button', { name: `View ${ITEM.name}` }).click()
    await expect(market).toContainText('1 Listings · Lowest:')
    await market.getByRole('button', { name: 'Buy Cheapest' }).click()
    await dialog(buyer.page, 'Confirm Purchase').getByRole('button', { name: 'Confirm' }).click()

    // Assert: paid in Stone; the item waits in Storage until collected into the bag.
    await expect(market.getByRole('status')).toContainText('Claim it in Storage.')
    await expectCurrency(buyer.page, 'Stone', 1000 - PRICE)
    await market.getByRole('tab', { name: 'Recent' }).click()
    await expect(market.getByRole('table', { name: 'Recent sales' })).toContainText(ITEM.name)
    await market.getByRole('tab', { name: 'Storage' }).click()
    const tile = market.getByRole('button', { name: new RegExp(`^Claim ${ITEM.name}`) })
    await tile.click()
    await expect(market.getByRole('status')).toHaveText('Item claimed.')
    await expect(tile).toHaveCount(0)
    expect(
      sql(
        `select sum(i.count) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item' and i.location = 'bag'`,
        { name: buyer.name, item: ITEM.id },
      ),
    ).toBe('1')

    // Act: the seller checks History and withdraws the sale from the Storage Vault.
    market = await openMarket(seller.page, 'History')
    await expect(market).toContainText(`Received: ${PROCEEDS}`)
    await market.getByRole('tab', { name: 'Storage' }).click()
    await market.getByRole('button', { name: 'Vault', exact: true }).click()
    const vault = market.getByRole('dialog', { name: 'Vault' })
    await expect(vault.getByRole('row', { name: 'Stones' })).toContainText(String(PROCEEDS))
    await vault.getByRole('button', { name: 'Withdraw' }).click()

    // Assert: the proceeds after tax reach the seller's Stone.
    await expect(market.getByRole('status')).toHaveText('Wallet claimed.')
    await expectCurrency(seller.page, 'Stone', afterFee + PROCEEDS)
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
