// Pet Reroll journey: a ninja opens Reroll from the Inventory's side column, puts a Baby Vulture
// in the Item slot, picks a target from the Reroll list, raises Max Stones and presses Reroll.
// The pet item becomes another listed pet and the Stones paid are whole rolls of 1,500.
// The Stone and the pet are seeded; every step is UI.
import { expect, test } from '@playwright/test'
import { REROLL_CONFIG } from '../game-core/src/pets/reroll'
import {
  createSeededNinja,
  dialog,
  giveItem,
  openMenu,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const PET = 'i320002' // Baby Vulture
const STONE = 20_000

const petOf = (name: string) =>
  sql(
    `select i.item_id from inventory_items i join characters c on c.id = i.character_id
     where c.name = :'name' and i.item_id like 'i320%'`,
    { name },
  )
const stoneOf = (name: string) =>
  Number(sql(`select stone from characters where name = :'name'`, { name }))

test('a ninja rerolls a pet toward a target', async ({ browser }) => {
  // Arrange: a ninja with 20,000 Stone and a Baby Vulture in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Reroll')
  try {
    seedCharacter(name, 'stone = :stone', { stone: STONE })
    giveItem(name, PET)
    await reloadGame(page)
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')

    // Act: open Reroll, pick the pet up and drop it in the Item slot.
    await bag.getByRole('button', { name: 'Reroll', exact: true }).click()
    const reroll = dialog(page, 'Reroll')
    await bag
      .getByRole('list', { name: 'Bag' })
      .getByRole('button', { name: 'Baby Vulture', exact: true })
      .click()
    await reroll.getByRole('button', { name: 'Item: put a pet here' }).click()

    // Choose the second listed pet as the target and allow up to 6,000 Stones.
    await reroll.getByRole('button', { name: 'Target: choose a pet' }).click()
    await dialog(page, 'Choose a target pet')
      .getByRole('button', { name: /^Target / })
      .nth(1)
      .click()
    await reroll.getByLabel('Max Stones').fill('6000')
    await reroll.getByRole('button', { name: 'Reroll', exact: true }).click()

    // Assert: the pet changed to a listed pet and whole rolls were paid, at most 6,000.
    await expect.poll(() => petOf(name)).not.toBe(PET)
    expect(REROLL_CONFIG.pets).toContain(petOf(name))
    const spent = STONE - stoneOf(name)
    expect(spent).toBeGreaterThan(0)
    expect(spent).toBeLessThanOrEqual(6_000)
    expect(spent % REROLL_CONFIG.stonesPerRoll).toBe(0)
  } finally {
    await context.close()
  }
})
