// Trade journey: two level-30 ninjas meet in a field; Tia opens Uri's View Character from the
// Player List and asks to trade, Uri accepts, Tia offers 3 Sushi and Uri 1,000 Stone; both get
// ready and confirm, and the Sushi and the Stone (less the 10% fee) change hands.
// Levels, Stone, the Sushi and the scene are seeded; every trade step is UI.
import { expect, test } from '@playwright/test'
import { createTwoNinjas, dialog, giveItem, meetInScene, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(150_000)

// Crossroads: a neutral field, where the Player List shows.
const FIELD = 2601
const SUSHI = 'i120001'

const sushiOf = (name: string) =>
  sql(
    `select coalesce(sum(i.count), 0) from inventory_items i
     join characters c on c.id = i.character_id where c.name = :'name' and i.item_id = :'item'`,
    { name, item: SUSHI },
  )
const stoneOf = (name: string) =>
  Number(sql(`select stone from characters where name = :'name'`, { name }))

test('two players trade 3 Sushi for 1,000 Stone', async ({ browser }) => {
  // Arrange: Tia holds the Sushi, Uri the Stone; both level 30 in the same field.
  const players = await createTwoNinjas(browser, ['Tia', 'Uri'])
  const [tia, uri] = players
  try {
    for (const { name } of players) seedCharacter(name, 'level = 30, stone = 0')
    seedCharacter(uri.name, 'stone = 10000')
    giveItem(tia.name, SUSHI, { count: 3 })
    await meetInScene([...players], FIELD)

    // Act: Tia views Uri from the Player List and asks to trade.
    const list = tia.page.getByRole('region', { name: 'Player List' })
    await list.getByRole('button', { name: uri.name }).click()
    await dialog(tia.page, 'View Character').getByRole('button', { name: 'Trade' }).click()
    await expect(tia.page.getByRole('alertdialog', { name: 'Trade request' })).toContainText(
      `Waiting for ${uri.name}...`,
    )

    // Uri sees the request and opens the trade.
    const asked = uri.page.getByRole('alertdialog', { name: 'Trade request' })
    await expect(asked).toContainText(`${tia.name} wants to trade`)
    await asked.getByRole('button', { name: 'See Trade' }).click()
    const tiaTrade = dialog(tia.page, `Trade with ${uri.name}`)
    const uriTrade = dialog(uri.page, `Trade with ${tia.name}`)
    await expect(tiaTrade).toBeVisible()
    await expect(uriTrade).toBeVisible()

    // Tia offers the Sushi from her bag; Uri offers 1,000 Stone.
    await tiaTrade.getByRole('button', { name: 'Offer an item (slot 1)' }).click()
    await tiaTrade.getByRole('button', { name: 'Offer Sushi x3' }).click()
    await tiaTrade.getByRole('button', { name: 'Done' }).click()
    await expect(uriTrade.getByRole('img', { name: 'Sushi x3' })).toBeVisible()
    await uriTrade.getByLabel('Your Stones').fill('1000')
    await uriTrade.getByLabel('Your Stones').press('Enter')
    await expect(tiaTrade).toContainText('You receive 900 Stones (−10% fee)')

    // Both get ready, then both confirm.
    await tiaTrade.getByRole('button', { name: 'Ready for Trade' }).click()
    await expect(uriTrade.getByText('Ready Check')).toBeVisible()
    await uriTrade.getByRole('button', { name: 'Ready for Trade' }).click()
    await tiaTrade.getByRole('button', { name: 'Confirm Trade' }).click()
    await expect(tiaTrade.getByRole('button', { name: 'Waiting for partner...' })).toBeVisible()
    await uriTrade.getByRole('button', { name: 'Confirm Trade' }).click()

    // Assert: the windows close; the Sushi and the Stone (less the fee) changed hands.
    await expect(uriTrade).toBeHidden()
    await expect(tiaTrade).toBeHidden()
    await expect.poll(() => sushiOf(uri.name)).toBe('3')
    expect(sushiOf(tia.name)).toBe('0')
    expect(stoneOf(tia.name)).toBe(900)
    expect(stoneOf(uri.name)).toBe(9_000)
  } finally {
    for (const { context } of players) await context.close()
  }
})
