// M6 kennel journey: a level-20 ninja finds the pet on a seeded Pet Tracing board, then spends
// seeded Feathers on food in the Pet Shop (the Events menu's Kennel Shop). The board's pet cell and the Feathers are seeded; the
// flip and the purchase use the UI.
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {
  createSeededNinja,
  dialog,
  giveItem,
  heldCount,
  openEvent,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const FEATHER = 'i150319'
const SEEDED_FEATHERS = 5
const FIND_FEATHERS = 10
const PET_CELL = 4
// kennel-shop.json: Meatball (i170114) costs 1 Feather from level 8.
const FOOD = { itemId: 'i170114', name: 'Meatball', price: 1 }
const BOUGHT = 5

test('a ninja finds a traced pet and buys food with Feathers', async ({ browser }) => {
  // Arrange: level 20 with Feathers and today's board hiding the pet in the middle cell.
  const { context, page, name } = await createSeededNinja(browser, 'Tracer')
  try {
    seedCharacter(name, 'level = 20')
    giveItem(name, FEATHER, { count: SEEDED_FEATHERS })
    sql(
      `insert into character_pet_tracing (character_id, day, board)
       select id, (now() at time zone 'utc')::date, jsonb_build_object(
         'petCell', :'cell'::int, 'opened', '[]'::jsonb, 'id', :'board'::text, 'seed', 1)
       from characters where name = :'name'`,
      { name, cell: PET_CELL, board: randomUUID() },
    )
    await reloadGame(page)

    // Act: open Pet Tracing and flip the pet's cell.
    await openEvent(page, 'Pet Tracing')
    const tracing = dialog(page, 'Pet Tracing')
    const flipped = page.waitForResponse((r) => r.url().endsWith('/tracing/flip') && r.ok())
    await tracing.getByRole('button', { name: `Cell ${PET_CELL + 1}: hidden`, exact: true }).click()
    const flip = await (await flipped).json()

    // Assert: a find pays 10 Feathers, uses an attempt and starts a new board.
    expect(flip.reward.feathers).toBe(FIND_FEATHERS)
    expect(flip.attemptsLeft).toBe(9)
    expect(flip.cells.every((cell: string | null) => cell === null)).toBe(true)
    await expect(tracing.getByRole('status')).toContainText('Pet found!')
    expect(heldCount(name, FEATHER)).toBe(String(SEEDED_FEATHERS + FIND_FEATHERS))
    await tracing.getByRole('button', { name: 'Close', exact: true }).click()

    // Act: buy five Meatballs in the Pet Shop and confirm the cost.
    await openEvent(page, 'Pet Shop')
    const shop = dialog(page, 'Pet Shop')
    const card = shop.getByRole('listitem', { name: FOOD.name, exact: true })
    await card.getByRole('combobox', { name: 'Quantity' }).selectOption(String(BOUGHT))
    await card.getByRole('button', { name: 'Buy', exact: true }).click()
    const prompt = shop.getByRole('alertdialog')
    await expect(prompt).toContainText(`Cost: ${BOUGHT * FOOD.price} Feathers`)
    const bought = page.waitForResponse((r) => r.url().endsWith('/shop/buy') && r.ok())
    await prompt.getByRole('button', { name: 'Accept', exact: true }).click()
    const result = await (await bought).json()

    // Assert: the Feathers paid for the food and the daily count rose.
    const feathersLeft = SEEDED_FEATHERS + FIND_FEATHERS - BOUGHT * FOOD.price
    expect(result.feathers).toBe(feathersLeft)
    expect(result.offers.find((o: { itemId: string }) => o.itemId === FOOD.itemId).purchased).toBe(
      BOUGHT,
    )
    await expect(shop.getByLabel('Feathers')).toHaveText(String(feathersLeft))
    expect(heldCount(name, FOOD.itemId)).toBe(String(BOUGHT))
    expect(heldCount(name, FEATHER)).toBe(String(feathersLeft))
  } finally {
    await context.close()
  }
})
