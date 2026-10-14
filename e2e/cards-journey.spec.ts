// M6 cards journey: a ninja opens a card box from the bag and claims the Akatsuki collection prize
// in the Card Room. A box's card is random, so every card of the collection is seeded and the box
// adds a copy of one of them; opening the box and the claim use the UI.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  createSeededNinja,
  dialog,
  giveItem,
  openEvent,
  openMenu,
  reloadGame,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const text = JSON.parse(
  readFileSync(new URL('../client/src/i18n/reborn.json', import.meta.url), 'utf8'),
) as Record<string, string>
// game-core cards/constants.ts: collection 6 (Akatsuki) is the only purple one, cards 38-46, and
// its prize is the Wings of Abaddon (i218009).
const COLLECTION = { id: 6, name: text.reborn_card_collection_6!, firstCard: 38, lastCard: 46 }
const BOX = { itemId: 'i171003', name: text.lg_reborn_item_171003! }
const PRIZE = 'i218009'
const CARDS = COLLECTION.lastCard - COLLECTION.firstCard + 1

const cardCount = (name: string) =>
  sql(
    `select coalesce(sum(k.count), 0) from character_cards k join characters c on c.id = k.character_id
     where c.name = :'name'`,
    { name },
  )

test('a ninja opens a card box and claims a completed collection', async ({ browser }) => {
  // Arrange: every Akatsuki card once and a purple card box in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Cards')
  try {
    sql(
      `insert into character_cards (character_id, card_id, count)
       select c.id, card, 1 from characters c, generate_series(:'first'::int, :'last'::int) card
       where c.name = :'name'`,
      { name, first: COLLECTION.firstCard, last: COLLECTION.lastCard },
    )
    giveItem(name, BOX.itemId)
    await reloadGame(page)

    // Act: use the card box in the bag.
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')
    await bag.getByRole('button', { name: BOX.name, exact: true }).click()
    const opened = page.waitForResponse(
      (r) => /\/api\/game\/items\/.+\/use$/.test(r.url()) && r.ok(),
    )
    await bag.getByRole('menuitem', { name: `Use ${BOX.name}`, exact: true }).click()
    const { card } = await (await opened).json()
    await bag.getByRole('button', { name: 'Close', exact: true }).click()

    // Assert: the box gave one Akatsuki card and is used up.
    expect(card.cardId).toBeGreaterThanOrEqual(COLLECTION.firstCard)
    expect(card.cardId).toBeLessThanOrEqual(COLLECTION.lastCard)
    expect(cardCount(name)).toBe(String(CARDS + 1))

    // Act: open the Card Room on the Akatsuki page and claim the prize.
    await openEvent(page, 'Card Room')
    const room = dialog(page, 'Card Room')
    await room
      .getByRole('navigation', { name: 'Collections' })
      .getByRole('button', { name: `${COLLECTION.name} (${CARDS}/${CARDS})`, exact: true })
      .click()
    const claimed = page.waitForResponse(
      (r) => r.url().endsWith(`/cards/collections/${COLLECTION.id}/claim`) && r.ok(),
    )
    await room.getByRole('button', { name: 'Claim prize', exact: true }).click()
    const result = await (await claimed).json()

    // Assert: the prize is paid once and the button shows it.
    expect(result.collections.find((c: { id: number }) => c.id === COLLECTION.id).claimed).toBe(
      true,
    )
    await expect(room.getByRole('button', { name: 'Prize claimed', exact: true })).toBeDisabled()
    expect(
      sql(
        `select count(*) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item'`,
        { name, item: PRIZE },
      ),
    ).toBe('1')
  } finally {
    await context.close()
  }
})
