// M4 Market journey: one ninja lists an item, another buys it and claims it from the warehouse,
// and the seller claims the proceeds (after the 10% tax) from the market wallet. Levels, Stone and
// the item are seeded; listing, buying and claiming go through the Market window.
import { expect, test, type Page } from '@playwright/test'
import {
  createTwoNinjas,
  dialog,
  expectCurrency,
  giveItem,
  openMenu,
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
  await openMenu(page, 'Market')
  const market = dialog(page, 'Market')
  await market.getByRole('tab', { name: tab }).click()
  return market
}

test('a ninja lists an item, another buys it and the seller claims the proceeds', async ({
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

    // Act: the seller lists one strawberry for 200 Stone.
    let market = await openMarket(seller.page, 'Sell')
    await market
      .getByRole('region', { name: 'Items you can sell' })
      .getByRole('button')
      .filter({ hasText: `${ITEM.name} x${ITEM.count}` })
      .click()
    await market.getByLabel('Quantity').fill('1')
    await market.getByLabel('Stone per unit').fill(String(PRICE))
    await market.getByRole('button', { name: 'List item' }).click()

    // Assert: listed, the fee paid and the rest of the stack still in the bag.
    await expect(market).toContainText(`${ITEM.name} is on the Market.`)
    await expect(market).toContainText('Listings: 1 of')
    const afterFee = stoneOf(seller.name)
    expect(afterFee).toBeLessThan(1000)
    await expectCurrency(seller.page, 'Stone', afterFee)
    await market.getByRole('button', { name: 'Close' }).click()

    // Act: the buyer finds the listing and buys it.
    market = await openMarket(buyer.page, 'Browse')
    await market.getByLabel('Name').fill(ITEM.name)
    await market.getByRole('button', { name: 'Search' }).click()
    const listing = market
      .getByRole('list', { name: 'Listings' })
      .getByRole('listitem')
      .filter({ hasText: seller.name })
    await listing.getByRole('button', { name: new RegExp(`^Buy ${ITEM.name}`) }).click()
    await dialog(buyer.page, 'Buy').getByRole('button', { name: 'Confirm purchase' }).click()

    // Assert: paid in Stone; the item waits in the warehouse until claimed into the bag.
    await expect(market).toContainText('Purchase complete. Claim the item in the Warehouse tab.')
    await expectCurrency(buyer.page, 'Stone', 1000 - PRICE)
    await market.getByRole('tab', { name: 'Warehouse' }).click()
    await market.getByRole('button', { name: new RegExp(`^Claim ${ITEM.name}`) }).click()
    await expect(market).toContainText('Item claimed.')
    await expect(market).toContainText('Your warehouse is empty.')
    expect(
      sql(
        `select sum(i.count) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item'`,
        { name: buyer.name, item: ITEM.id },
      ),
    ).toBe('1')

    // Act: the seller claims the sale from the market wallet.
    market = await openMarket(seller.page, 'Warehouse')
    const wallet = market.getByRole('region', { name: 'Wallet' })
    await expect(wallet).toContainText(`${PROCEEDS} Stone`)
    await wallet.getByRole('button', { name: 'Claim wallet' }).click()

    // Assert: the proceeds after tax reach the seller's Stone.
    await expect(market).toContainText('Wallet claimed.')
    await expectCurrency(seller.page, 'Stone', afterFee + PROCEEDS)
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
