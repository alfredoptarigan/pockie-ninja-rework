// Outfits as items: a ninja equips a second outfit, switches equipment sets (each wears its own
// outfit), sets and clears a Visual Outfit (250 gold) and stores an outfit in the Wardrobe and
// takes it back out. The spare outfits and the gold are seeded.
import { expect, test } from '@playwright/test'
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

const KIBA = 'i290017' // Kiba Inuzuka +1 (clothing 17)
const KIBA_2 = 'i290117' // Kiba Inuzuka +2

const column = (name: string, select: string) =>
  sql(`select ${select} from characters where name = :'name';`, { name })
const location = (name: string, itemId: string) =>
  sql(
    `select i.location || coalesce(':' || i.wardrobe_slot, '') from inventory_items i
       join characters c on c.id = i.character_id where c.name = :'name' and i.item_id = :'item';`,
    { name, item: itemId },
  )

test('a ninja swaps outfits, sets a visual outfit and uses the wardrobe', async ({ browser }) => {
  // Arrange: a Ggio Vega ninja (clothing 3) with 300 gold and two Kiba Inuzuka outfits.
  const { context, page, name } = await createSeededNinja(browser, 'Outfit')
  try {
    seedCharacter(name, 'gold = 300')
    giveItem(name, KIBA)
    giveItem(name, KIBA_2)
    await reloadGame(page)
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')
    const equipment = bag.getByRole('list', { name: 'Equipment' })
    const bagCell = (outfit: string) =>
      bag.getByRole('list', { name: 'Bag' }).getByRole('button', { name: outfit, exact: true })
    await expect(equipment).toContainText('Outfit: Ggio Vega +1')

    // Act: equip Kiba Inuzuka +1 from its menu.
    await bagCell('Kiba Inuzuka +1').click({ button: 'right' })
    await bag.getByRole('menuitem', { name: 'Equip Kiba Inuzuka +1' }).click()

    // Assert: set I wears it and the ninja is drawn and fights as clothing 17.
    await expect(equipment).toContainText('Outfit: Kiba Inuzuka +1')
    await expect(bagCell('Ggio Vega +1')).toBeVisible()
    expect(column(name, 'clothing')).toBe('17')

    // Act: switch to set II and wear Ggio Vega there.
    const sets = bag.getByRole('group', { name: 'Equipment sets' })
    await sets.getByRole('button', { name: 'II', exact: true }).click()
    await expect(sets.getByRole('button', { name: 'II', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await bagCell('Ggio Vega +1').click({ button: 'right' })
    await bag.getByRole('menuitem', { name: 'Equip Ggio Vega +1' }).click()

    // Assert: set II wears Ggio Vega; back on set I the ninja wears Kiba again.
    await expect(equipment).toContainText('Outfit: Ggio Vega +1')
    expect(column(name, 'clothing')).toBe('3')
    await sets.getByRole('button', { name: 'I', exact: true }).click()
    await expect(equipment).toContainText('Outfit: Kiba Inuzuka +1')
    expect(column(name, 'clothing')).toBe('17')

    // Act: Manage Outfit, choose Kiba Inuzuka +2 as the Visual Outfit and confirm the gold.
    await equipment.getByRole('button', { name: 'Kiba Inuzuka +1' }).click({ button: 'right' })
    await bag.getByRole('menuitem', { name: 'Manage' }).click()
    const manage = dialog(page, 'Manage Outfit')
    await manage.getByRole('button', { name: 'Choose Visual Outfit' }).click()
    await dialog(page, 'Choose an outfit to show visually')
      .getByRole('button', { name: 'Kiba Inuzuka +2' })
      .click()
    await bag.getByRole('alertdialog').getByRole('button', { name: 'Accept' }).click()

    // Assert: 250 gold spent, the look changes but the stats stay with the worn outfit.
    await expect(manage.getByRole('button', { name: 'Remove' })).toBeVisible()
    expect(column(name, "gold || ':' || visual_clothing || ':' || avatar_id")).toBe('50:17:17')

    // Act: remove it (free).
    await manage.getByRole('button', { name: 'Remove' }).click()

    // Assert: no visual outfit, no gold spent.
    await expect(manage.getByRole('button', { name: 'Choose Visual Outfit' })).toBeVisible()
    expect(column(name, "gold || ':' || coalesce(visual_clothing::text, 'none')")).toBe('50:none')
    await manage.getByRole('button', { name: 'Close' }).click()

    // Act: open the Wardrobe, pick up Kiba Inuzuka +2 and store it in slot 1.
    await bag.getByRole('button', { name: 'Wardrobe', exact: true }).click()
    const wardrobe = dialog(page, 'Wardrobe')
    await bagCell('Kiba Inuzuka +2').click()
    await wardrobe.getByRole('button', { name: 'Store in slot 1' }).click()

    // Assert: it left the bag for wardrobe slot 0.
    await expect(wardrobe.getByRole('button', { name: 'Take out Kiba Inuzuka +2' })).toBeVisible()
    await expect(bagCell('Kiba Inuzuka +2')).toHaveCount(0)
    expect(location(name, KIBA_2)).toBe('wardrobe:0')

    // Act: take it out again.
    await wardrobe.getByRole('button', { name: 'Take Out' }).first().click()

    // Assert: back in the bag, the slot is empty.
    await expect(bagCell('Kiba Inuzuka +2')).toBeVisible()
    await expect(wardrobe.getByRole('button', { name: 'Store in slot 1' })).toBeVisible()
    expect(location(name, KIBA_2)).toBe('bag')
    await wardrobe.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(wardrobe).toBeHidden()
  } finally {
    await context.close()
  }
})
