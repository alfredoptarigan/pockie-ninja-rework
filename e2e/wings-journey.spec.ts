// M6 wings journey: a ninja enhances a wing with a wing stone (bag menu "Enhance Wing"), equips it
// and registers it in the Collection's Wings tab. The wing and the stone are seeded.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  createSeededNinja,
  dialog,
  giveItem,
  heldCount,
  openMenu,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const text = JSON.parse(
  readFileSync(new URL('../client/src/i18n/reborn.json', import.meta.url), 'utf8'),
) as Record<string, string>
const WING = { itemId: 'i218000', name: text.lg_reborn_item_218000! }
// wings.json: i218022 jumps 3 levels; game-core wings/constants.ts: targets up to +5 always succeed.
const STONE = { itemId: 'i218022', name: text.lg_reborn_item_218022!, levelJump: 3 }
// collectionReward: wings 218000-218008 pay 5 Plume Shards (i218021).
const SHARD = 'i218021'
const REWARD = 5

const wingRow = (name: string) =>
  sql(
    `select i.enhance_level, coalesce(i.equipped_slot, '') from inventory_items i
     join characters c on c.id = i.character_id where c.name = :'name' and i.item_id = :'item'`,
    { name, item: WING.itemId },
  )

test('a ninja enhances, equips and registers a wing', async ({ browser }) => {
  // Arrange: a level-51 ninja with a +0 wing and one +3 wing stone in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Wing')
  try {
    seedCharacter(name, 'level = 51')
    giveItem(name, WING.itemId)
    giveItem(name, STONE.itemId)
    await reloadGame(page)

    // Act: the bag item menu's Enhance Wing opens Wing Enhancement; enhance with the stone.
    await openMenu(page, 'Inventory')
    await dialog(page, 'Inventory')
      .getByRole('button', { name: WING.name, exact: true })
      .click({ button: 'right' })
    await page.getByRole('menuitem', { name: `Enhance Wing ${WING.name}`, exact: true }).click()
    const wings = dialog(page, 'Wing Enhancement')
    await wings.getByLabel('Material', { exact: true }).selectOption(STONE.itemId)
    await expect(wings).toContainText('Success Rate: 100%')
    const enhanced = page.waitForResponse((r) => r.url().endsWith('/enhance') && r.ok())
    await wings.getByRole('button', { name: 'Enhance', exact: true }).click()
    const result = await (await enhanced).json()

    // Assert: the level rose by the stone's jump and the stone is used up.
    expect(result).toMatchObject({ outcome: 'success', level: STONE.levelJump })
    await expect(wings).toContainText('Enhancement Success!')
    await expect(wings).toContainText(`Level: +${STONE.levelJump}`)
    expect(wingRow(name)).toBe(`${STONE.levelJump}|`)
    expect(heldCount(name, STONE.itemId)).toBe('0')
    await wings.getByRole('button', { name: 'Close' }).click()

    // Act: equip it from the bag.
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')
    const equipped = page.waitForResponse((r) => r.url().endsWith('/equip') && r.ok())
    await bag.getByRole('button', { name: WING.name, exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: `Equip ${WING.name}`, exact: true }).click()
    await equipped

    // Assert: it sits in the Wing slot.
    await expect.poll(() => wingRow(name)).toBe(`${STONE.levelJump}|Wing`)

    // Act: Collection (Wings tab), then submit it from Submit Wing.
    await bag.getByRole('button', { name: 'Collection', exact: true }).click()
    const collection = dialog(page, 'Collection')
    await collection
      .getByRole('list', { name: 'Wing Collection' })
      .getByRole('button', { name: WING.name, exact: true })
      .click()
    const registered = page.waitForResponse(
      (r) => r.url().endsWith(`/wings/collection/${WING.itemId}`) && r.ok(),
    )
    await collection
      .getByRole('dialog', { name: 'Submit Wing' })
      .getByRole('button', { name: 'Submit', exact: true })
      .click()
    expect((await (await registered).json()).reward).toBe(REWARD)

    // Assert: the entry is collected, the shards are paid and the wing is kept.
    await expect(
      collection.getByRole('list', { name: 'Wing Collection' }).getByRole('listitem').first(),
    ).toContainText('Collected')
    expect(heldCount(name, SHARD)).toBe(String(REWARD))
    expect(wingRow(name)).toBe(`${STONE.levelJump}|Wing`)
  } finally {
    await context.close()
  }
})
