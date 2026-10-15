// Special shops journeys: a level-56 ninja opens the Dungeon Shop from the Demon City Guard and
// exchanges 50 Common Valhalla Crystals for a Common Dragon Egg Stone; a ninja with Festival
// Tokens redeems ten Sushi in the Festival Shop from the Events menu.
import { expect, test } from '@playwright/test'
import {
  createSeededNinja,
  dialog,
  expectScene,
  giveItem,
  heldCount,
  openEvent,
  openNpcWindow,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

test('a ninja exchanges Valhalla crystals in the Dungeon Shop', async ({ browser }) => {
  // Arrange: level 56 in Demon City with 50 Common Valhalla Crystals.
  const { context, page, name } = await createSeededNinja(browser, 'Vault')
  try {
    seedCharacter(name, 'level = 56, scene_id = 171')
    giveItem(name, 'i152015', { count: 50 })
    await reloadGame(page)
    await expectScene(page, 'Demon City')

    // Act: the guard's Dungeon Shop, the Level 56 tab, Exchange and the confirm.
    await openNpcWindow(page, 'Demon City Guard', 'Enter')
    await dialog(page, 'Demon City Guard').getByRole('button', { name: 'Dungeon Shop' }).click()
    const shop = dialog(page, 'Dungeon Shop')
    await expect(shop.getByRole('tab', { name: 'Level 56' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(shop.getByRole('group', { name: 'Balance' })).toHaveText('50')
    await shop.getByRole('button', { name: 'Exchange for Common Dragon Egg Stone' }).click()
    await expect(page.getByText('Cost: 50 Common Valhalla Crystals')).toBeVisible()
    await page.getByRole('button', { name: 'Accept' }).click()

    // Assert: the toast, the balance and the bag.
    await expect(page.getByText('Purchase successful!')).toBeVisible()
    await expect(shop.getByRole('group', { name: 'Balance' })).toHaveText('0')
    expect(heldCount(name, 'i491001')).toBe('1')
    expect(heldCount(name, 'i152015')).toBe('0')
  } finally {
    await context.close()
  }
})

test('a ninja redeems Sushi in the Festival Shop', async ({ browser }) => {
  // Arrange: level 20 with 12 Festival Tokens (no event hands them out yet).
  const { context, page, name } = await createSeededNinja(browser, 'Festa')
  try {
    seedCharacter(name, 'level = 20')
    sql(
      `insert into character_festival_shop (character_id, tokens)
       select id, 12 from characters where name = :'name';`,
      { name },
    )
    await reloadGame(page)

    // Act: open it from the Events menu and redeem Sushi.
    await openEvent(page, 'Festival Shop')
    const shop = dialog(page, 'Festival Shop')
    await expect(shop.getByRole('group', { name: 'Balance' })).toHaveText('12 Tokens')
    await shop.getByRole('button', { name: 'Redeem Sushi' }).click()
    await expect(page.getByText('Buy Sushi for 5 Tokens?')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm' }).click()

    // Assert: the toast, the balance, the purchase count, the bag and the database.
    await expect(page.getByText('Purchase successful!')).toBeVisible()
    await expect(shop.getByRole('group', { name: 'Balance' })).toHaveText('7 Tokens')
    await expect(shop.getByRole('listitem', { name: 'Sushi' })).toContainText('(1/20)')
    expect(heldCount(name, 'i120001')).toBe('10')
    expect(
      sql(
        `select s.tokens from character_festival_shop s join characters c on c.id = s.character_id
         where c.name = :'name';`,
        { name },
      ),
    ).toBe('7')
  } finally {
    await context.close()
  }
})
