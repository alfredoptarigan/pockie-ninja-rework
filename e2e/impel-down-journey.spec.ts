// Impel Down journey: a level-61 ninja opens Impel Down from the village icon, clears floors 4
// and 5 of gate 1, gets floor 5's guaranteed Zanpakuto crystal and finds it in Zanpakuto. Floors
// 1-3 are seeded as cleared; a lost fight gives the life back by SQL so the run stays short.
import { expect, test } from '@playwright/test'
import { armNinja, createSeededNinja, dialog, skipReplay, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(180_000)

const impelDown = (name: string, column: string) =>
  sql(
    `select i.${column} from impel_down_players i join characters c on c.id = i.character_id
     where c.name = :'name';`,
    { name },
  )
const crystalCount = (name: string) =>
  sql(
    `select count(*) from zanpakuto_crystals z join characters c on c.id = z.character_id
     where c.name = :'name';`,
    { name },
  )

test('a ninja clears Impel Down floors and gets the floor-5 crystal', async ({ browser }) => {
  // Arrange: level 61 with the journey weapon, standing on gate 1 floor 4.
  const { context, page, name } = await createSeededNinja(browser, 'Impel')
  try {
    sql(
      `insert into impel_down_players (character_id, floor, max_floor)
       select id, 3, 3 from characters where name = :'name';`,
      { name },
    )
    await armNinja(page, name, 'level = 61')

    // Act: open Impel Down from the top-right icon and fight the current floor until floor 5 is
    // cleared (a defeat costs a life, which the journey hands back).
    await page.getByRole('button', { name: 'Impel Down', exact: true }).click()
    const window = dialog(page, 'Impel Down')
    await expect(window.getByLabel('Current')).toHaveText('Gate 1, Floor 4')
    for (let fights = 0; fights < 10 && Number(impelDown(name, 'floor')) < 5; fights++) {
      const floor = Number(impelDown(name, 'floor'))
      await dialog(page, 'Impel Down')
        .getByRole('button', { name: `Floor ${floor + 1}`, exact: true })
        .click()
      await skipReplay(page)
      const result = page.getByRole('dialog', { name: /^(Victory|Defeat)$/ })
      await expect(result).toBeVisible()
      sql(
        `update impel_down_players set lives_used = 0
         where character_id = (select id from characters where name = :'name');`,
        { name },
      )
      await result.getByRole('button', { name: 'OK' }).click()
    }

    // Assert: floor 5 cleared, the window moved on, and the guaranteed crystal was kept.
    expect(impelDown(name, 'max_floor')).toBe('5')
    await expect(dialog(page, 'Impel Down').getByLabel('Current')).toHaveText('Gate 1, Floor 6')
    expect(Number(crystalCount(name))).toBeGreaterThanOrEqual(1)

    // Act: close Impel Down and open Zanpakuto.
    await dialog(page, 'Impel Down').getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Zanpakuto', exact: true }).click()

    // Assert: the crystal sits in the spirit inventory.
    await expect(
      dialog(page, 'Zanpakuto').getByRole('button', { name: /^Spirit slot 1: .+ Crystal I$/ }),
    ).toBeVisible()
  } finally {
    await context.close()
  }
})
