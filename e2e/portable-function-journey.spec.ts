// Portable Function journey (Inventory "Compose"): a ninja synthesizes three +1 outfits into the
// +2 (a 100% recipe), recasts the new outfit with a Recast Talisman, and impresses a weapon with a
// Carving Blade and enough Carving Crystals for a sure new stat line. Everything is seeded.
import { expect, test } from '@playwright/test'
import {
  createSeededNinja,
  dialog,
  giveItem,
  heldCount,
  openMenu,
  reloadGame,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// EquipCompose.ini: i290001 x3 (Ichigo Kurosaki +1) makes i290101 (+2) at 100%.
const OUTFIT = { itemId: 'i290001', name: 'Ichigo Kurosaki +1' }
const OUTFIT_2 = { itemId: 'i290101', name: 'Ichigo Kurosaki +2' }
const TALISMAN = 'i161007'
// i250101 Dogsmasher (level 1); i350001 blade for items up to 30; i350101 crystals, +5 each:
// 75% + 5 crystals reach 100%.
const WEAPON = { itemId: 'i250101', name: 'Dogsmasher' }
const BLADE = { itemId: 'i350001', name: 'Lv.1 Engrave Blade' }
const CRYSTAL = { itemId: 'i350101', name: 'Lv. 1 Carving Crystal x6' }

const lineCount = (name: string) =>
  sql(
    `select jsonb_array_length(i.props) from inventory_items i
     join characters c on c.id = i.character_id where c.name = :'name' and i.item_id = :'item'`,
    { name, item: WEAPON.itemId },
  )
const recastRows = (name: string) =>
  sql(
    `select count(*) from outfit_recasts r join inventory_items i on i.id = r.item_id
     join characters c on c.id = i.character_id where c.name = :'name' and i.item_id = :'item'`,
    { name, item: OUTFIT_2.itemId },
  )

test('a ninja synthesizes, recasts and impresses in the Portable Function', async ({ browser }) => {
  // Arrange: a level-20 ninja with three +1 outfits, two Recast Talismans, a one-line weapon, a
  // blade and six crystals.
  const { context, page, name } = await createSeededNinja(browser, 'Synth')
  try {
    sql(`update characters set level = 20 where name = :'name'`, { name })
    for (let i = 0; i < 3; i++) giveItem(name, OUTFIT.itemId)
    giveItem(name, TALISMAN, { count: 2 })
    giveItem(name, WEAPON.itemId, {
      can_identify: true,
      identify_count: 1,
      identify_times: 1,
      props: '[{"propId":1,"value":3000}]',
    })
    giveItem(name, BLADE.itemId)
    giveItem(name, CRYSTAL.itemId, { count: 6 })
    await reloadGame(page)

    // Act: Inventory, Compose; put the three outfits in the slots and create.
    await openMenu(page, 'Inventory')
    await dialog(page, 'Inventory').getByRole('button', { name: 'Compose', exact: true }).click()
    const window = dialog(page, 'Portable Function')
    const picker = window.getByRole('list', { name: 'Items to synthesize' })
    for (let i = 0; i < 3; i++)
      await picker.getByRole('button', { name: OUTFIT.name, exact: true }).nth(i).click()
    await expect(window.getByText(OUTFIT_2.name, { exact: true })).toBeVisible()
    await expect(window.getByText('100%', { exact: true })).toBeVisible()
    const made = page.waitForResponse((r) => r.url().endsWith('/portable-function/synthesis'))
    await window.getByRole('button', { name: 'Create', exact: true }).click()

    // Assert: the three outfits became the +2.
    expect(await (await made).json()).toMatchObject({
      success: true,
      resultItemId: OUTFIT_2.itemId,
    })
    await expect(
      page.getByRole('status').filter({ hasText: `Synthesized ${OUTFIT_2.name}.` }),
    ).toBeVisible()
    expect(heldCount(name, OUTFIT.itemId)).toBe('0')
    expect(heldCount(name, OUTFIT_2.itemId)).toBe('1')

    // Act: Recast the new outfit with no stat locked (one talisman).
    await window.getByRole('tab', { name: 'Recast' }).click()
    await window
      .getByRole('list', { name: 'Outfits' })
      .getByRole('button', { name: OUTFIT_2.name, exact: true })
      .click()
    await expect(window.getByRole('list', { name: 'Individual Stat Values' })).toContainText(
      'Strength:',
    )
    const recast = page.waitForResponse(
      (r) => r.url().endsWith('/portable-function/recast') && r.ok(),
    )
    await window.getByRole('button', { name: 'Attempt', exact: true }).click()
    await recast

    // Assert: one talisman used and the ISV stored on the outfit.
    await expect(window.getByText('Recast complete!')).toBeVisible()
    expect(heldCount(name, TALISMAN)).toBe('1')
    expect(recastRows(name)).toBe('1')

    // Act: Impress the weapon with the blade and the crystals.
    await window.getByRole('tab', { name: 'Impress' }).click()
    await window.getByRole('button', { name: WEAPON.name, exact: true }).click()
    await window.getByRole('combobox', { name: 'Blade' }).selectOption({ label: BLADE.name })
    await window.getByRole('combobox', { name: 'Crystals' }).selectOption({ label: CRYSTAL.name })
    await expect(window.getByText('Rate: 100%')).toBeVisible()
    const impressed = page.waitForResponse((r) => r.url().endsWith('/portable-function/impress'))
    await window.getByRole('button', { name: 'Attempt', exact: true }).click()

    // Assert: a second stat line, the blade and five crystals used up.
    expect(await (await impressed).json()).toMatchObject({ success: true })
    expect(lineCount(name)).toBe('2')
    expect(heldCount(name, BLADE.itemId)).toBe('0')
    expect(heldCount(name, CRYSTAL.itemId)).toBe('1')
  } finally {
    await context.close()
  }
})
