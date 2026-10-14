// M3 journeys: the village shop, the Blacksmith, travel to Angel City and a toll gate card flip.
// A fresh ninja has no Stone, Gold, loot or level for these, so each test seeds its own ninja in
// the e2e server's database (helpers.ts) and reloads; every action itself goes through the UI.
import { expect, test, type Page } from '@playwright/test'
import {
  createNinja,
  dialog,
  expectCurrency,
  expectScene,
  giveItem,
  leaveVillage,
  location,
  openNpcWindow,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// English names from client/src/i18n/en.json; prices from server/data/game.
const POTION = { id: 'i160006', name: 'Healing Powder', price: 38 }
const LOOT = { id: 'i220101', name: "Child's Hat", price: 40 } // a Sunflower drop
const WEAPON = { id: 'i250104', name: 'Mythbeast Bat' }

/** Seeds the ninja, then reloads so the HUD shows the new state. */
async function seed(page: Page, apply: () => void) {
  apply()
  await page.reload()
  await expect(location(page)).toBeVisible()
}

test('a ninja buys a potion and sells loot at the Wholesale Boss', async ({ page }) => {
  // Arrange: 1000 Stone and a Child's Hat dropped by a Sunflower.
  const ninja = await createNinja(page, 'Buyer')
  await seed(page, () => {
    seedCharacter(ninja, 'stone = 1000')
    giveItem(ninja, LOOT.id)
  })
  await expectCurrency(page, 'Stone', 1000)

  // Act: buy one potion from the Wholesale tab.
  await openNpcWindow(page, 'Wholesale Boss', 'Shop')
  const shop = dialog(page, 'Shop')
  await shop.getByRole('tab', { name: 'Wholesale' }).click()
  await shop.getByRole('button', { name: `Buy ${POTION.name}` }).click()
  const buy = dialog(page, `Buy ${POTION.name}`)
  await expect(buy.getByLabel('Quantity')).toHaveValue('1')
  await buy.getByRole('button', { name: 'Confirm purchase' }).click()

  // Assert: the potion costs its price and lands in the bag (sellable, bound).
  await expect(shop.getByText('Purchase complete.')).toBeVisible()
  await expectCurrency(page, 'Stone', 1000 - POTION.price)

  // Act: sell the hat.
  await shop.getByLabel('Item to sell').selectOption({ label: `${LOOT.name} x1` })
  await shop.getByRole('button', { name: `Sell for ${LOOT.price} Stone` }).click()

  // Assert: Price x count Stone back, and the hat is gone from the sell list.
  await expect(shop.getByText('Sale complete.')).toBeVisible()
  await expectCurrency(page, 'Stone', 1000 - POTION.price + LOOT.price)
  await expect(shop.getByLabel('Item to sell').getByRole('option')).not.toContainText([LOOT.name])
  await expect(shop.getByLabel('Item to sell')).toContainText(POTION.name)
})

test('a ninja appraises a weapon in the bag and enhances it at the Blacksmith', async ({
  page,
}) => {
  // Arrange: an unappraised Mythbeast Bat with two hidden properties, Stone and Gold.
  const ninja = await createNinja(page, 'Smith')
  await seed(page, () => {
    seedCharacter(ninja, 'stone = 1000, gold = 20')
    giveItem(ninja, WEAPON.id, { can_identify: true, identify_count: 2, identify_times: 0 })
  })

  // Act: appraise from the bag.
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Bag' }).click()
  const bag = dialog(page, 'Inventory')
  await bag.getByRole('button', { name: WEAPON.name, exact: true }).click()
  const appraise = bag.getByRole('menuitem', { name: new RegExp(`^Appraise ${WEAPON.name} for`) })
  const cost = Number((await appraise.getAttribute('aria-label'))!.match(/for (\d+) Stone/)![1])
  await appraise.click()

  // Assert: paid in Stone, nothing left to appraise.
  await expect(bag.getByText(`Appraised ${WEAPON.name}.`)).toBeVisible()
  await expectCurrency(page, 'Stone', 1000 - cost)
  await expect(appraise).toBeHidden()
  await bag.getByRole('button', { name: 'Close' }).click()

  // Act: enhance at the Blacksmith with Gold (+1 never fails: FailRate 0).
  await openNpcWindow(page, 'Blacksmith', 'Blacksmith')
  const forge = dialog(page, 'Forge')
  const panel = forge.getByRole('tabpanel', { name: 'Enhance' })
  await panel.getByRole('button', { name: WEAPON.name, exact: true }).click()
  await expect(panel).toContainText('Next: +1, success rate 100%')
  await panel.getByRole('radio', { name: /^8 Gold/ }).check()
  await panel.getByRole('button', { name: 'Enhance', exact: true }).click()

  // Assert
  await expect(panel.getByText(`${WEAPON.name} is now +1.`)).toBeVisible()
  await expectCurrency(page, 'Gold', 12)
  await expect(panel).toContainText('Next: +2')
})

test('a ninja walks 111 -> 2101 -> 2601 and takes the map to Angel City 161', async ({ page }) => {
  // Arrange: Crossroads (2601) needs level 16.
  const ninja = await createNinja(page, 'Walker')
  await seed(page, () => seedCharacter(ninja, 'level = 16'))
  const exits = page.getByRole('navigation', { name: 'Exits' })

  // Act and assert: Leave, then the scene exits (2101 -> 2102 -> 2601).
  await leaveVillage(page)
  await exits.getByRole('button', { name: 'Go to Eventide Barrens' }).click()
  await expectScene(page, 'Eventide Barrens')
  await exits.getByRole('button', { name: 'Go to Crossroads' }).click()
  await expectScene(page, 'Crossroads')

  // Angel City is entered from the World Map (the map keeps it open).
  await location(page).getByRole('button', { name: 'World Map' }).click()
  const map = dialog(page, 'World Map')
  await expect(map.getByRole('button', { name: 'Crossroads (You are here)' })).toBeVisible()
  // The painting of Abandoned Evernight City (2701) covers Angel City's button for the mouse, so
  // this goes through the keyboard.
  await map.getByRole('button', { name: 'Angel City', exact: true }).press('Enter')
  await expect(map).toBeHidden()
  await expectScene(page, 'Angel City')
  expect(sql(`select scene_id from characters where name = :'name'`, { name: ninja })).toBe('161')
})

test('a ninja enters toll gate 100000 and takes a card after the clear', async ({ page }) => {
  // Arrange: level 15 in Demon City with a weapon, full HP (entry needs more than 90%) and Gold.
  const ninja = await createNinja(page, 'Gater')
  await seed(page, () => {
    seedCharacter(ninja, 'level = 15, scene_id = 171, gold = 10')
    giveItem(ninja, 'i270100', { equipped_slot: 'Weapon' })
  })
  const { character } = await (await page.request.get('/api/game/character')).json()
  await seed(page, () => seedCharacter(ninja, 'hp = :hp', { hp: character.maxHp }))
  await expectScene(page, 'Demon City')

  // Act: enter the Training gate through the Demon City Guard.
  await openNpcWindow(page, 'Demon City Guard', 'Enter')
  const guard = dialog(page, 'Demon City Guard')
  await expect(guard).toContainText('Tries left today: 3 / 3')
  await guard.getByRole('listitem').filter({ hasText: 'Level 11-20' }).getByRole('button').click()
  await expect(guard.getByRole('list', { name: 'Stages' })).toContainText('Stage 1: point 1 of 5')
  await expect(guard.getByRole('button', { name: 'Fight', exact: true })).toBeVisible()

  // Five points of three NPCs each can beat a level-15 ninja, so the clear is seeded: the run is
  // past its last point with five face-down cards from the gate's card library (as dealCards
  // leaves it).
  const card = { itemId: 'i150168', count: 1, bound: true, revealed: false }
  sql(
    `update toll_gate_runs set sub_gate = 1, point = 0, passed_point = 4, card_state = 1,
       cards = :'cards'::jsonb, peeks = 0
     where character_id = (select id from characters where name = :'name');`,
    { cards: JSON.stringify(Array(5).fill(card)), name: ninja },
  )
  await guard.getByRole('button', { name: 'Close' }).click()
  await openNpcWindow(page, 'Demon City Guard', 'Enter')

  // Act: peek at card 3 for 1 Gold (LookCap0), then take it.
  await expect(guard).toContainText('Toll gate cleared! Take one of the five cards.')
  await expect(guard).toContainText('Next peek: 1 Gold')
  await guard.getByRole('button', { name: 'Peek at card 3' }).click()
  await expect(guard.getByRole('button', { name: 'Peek at card 3' })).toBeDisabled()
  await expect(guard).toContainText('Peeks used 1 / 5. Next peek: 2 Gold.')
  await expectCurrency(page, 'Gold', 9)
  await guard.getByRole('button', { name: 'Take card 3' }).click()

  // Assert: the card is granted and the run is over.
  await expect(guard.getByRole('status')).toContainText('You took')
  await guard.getByRole('button', { name: 'Done' }).click()
  await expect(guard).toContainText('Tries left today: 2 / 3')
  expect(
    sql(
      `select count(*) from toll_gate_runs r join characters c on c.id = r.character_id
       where c.name = :'name'`,
      { name: ninja },
    ),
  ).toBe('0')
  expect(
    sql(
      `select sum(i.count) from inventory_items i join characters c on c.id = i.character_id
       where c.name = :'name' and i.item_id = 'i150168'`,
      { name: ninja },
    ),
  ).toBe('1')
})
