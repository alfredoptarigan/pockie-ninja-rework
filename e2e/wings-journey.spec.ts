// M6 wings journey: a ninja equips a wing, enhances it with a wing stone and registers it in the
// Wing Collection. The wing and the stone are seeded; equipping, enhancing and registering use the
// Wings window.
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

test('a ninja equips, enhances and registers a wing', async ({ browser }) => {
  // Arrange: a level-51 ninja with a +0 wing and one +3 wing stone in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Wing')
  try {
    seedCharacter(name, 'level = 51')
    giveItem(name, WING.itemId)
    giveItem(name, STONE.itemId)
    await reloadGame(page)

    // Act: Inventory, Collection (the wings window), then equip the wing.
    await openMenu(page, 'Inventory')
    await dialog(page, 'Inventory').getByRole('button', { name: 'Collection', exact: true }).click()
    const wings = dialog(page, 'Wings')
    const equipped = page.waitForResponse(
      (r) => /\/api\/game\/items\/.+\/equip$/.test(r.url()) && r.ok(),
    )
    await wings.getByRole('button', { name: 'Equip', exact: true }).click()
    await equipped

    // Assert: it sits in the Wing slot.
    await expect(wings.getByRole('button', { name: 'Unequip', exact: true })).toBeVisible()
    expect(wingRow(name)).toBe('0|Wing')

    // Act: enhance it with the stone.
    await wings
      .getByRole('radio', { name: `${STONE.name} (+${STONE.levelJump}) x1`, exact: true })
      .check()
    await expect(wings.getByRole('list', { name: 'Outcome odds' })).toContainText('Success: 100%')
    const enhanced = page.waitForResponse((r) => r.url().endsWith('/enhance') && r.ok())
    await wings.getByRole('button', { name: 'Enhance', exact: true }).click()
    const result = await (await enhanced).json()

    // Assert: the level rose by the stone's jump and the stone is used up.
    expect(result).toMatchObject({ outcome: 'success', level: STONE.levelJump })
    await expect(wings).toContainText(`It is now +${STONE.levelJump}.`)
    expect(wingRow(name)).toBe(`${STONE.levelJump}|Wing`)
    expect(heldCount(name, STONE.itemId)).toBe('0')

    // Act: register it in the Wing Collection.
    await wings.getByRole('tab', { name: 'Collection', exact: true }).click()
    const registered = page.waitForResponse(
      (r) => r.url().endsWith(`/wings/collection/${WING.itemId}`) && r.ok(),
    )
    await wings.getByRole('button', { name: `Register ${WING.name}`, exact: true }).click()
    expect((await (await registered).json()).reward).toBe(REWARD)

    // Assert: the entry is registered, the shards are paid and the wing is kept.
    await expect(
      wings.getByRole('list', { name: 'Wing Collection' }).getByRole('listitem').first(),
    ).toContainText('Registered')
    expect(heldCount(name, SHARD)).toBe(String(REWARD))
    expect(wingRow(name)).toBe(`${STONE.levelJump}|Wing`)
  } finally {
    await context.close()
  }
})
