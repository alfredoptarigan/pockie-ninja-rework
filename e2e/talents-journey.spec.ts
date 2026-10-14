// M5 talents journey: a level-51 ninja upgrades a talent in the Talents window and activates it.
// The level, Stone and the talent's EXP are seeded; the upgrade and the activation go through the UI.
import { expect, test } from '@playwright/test'
import { createSeededNinja, dialog, openMenu, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// talents.json: the first attempt of the day costs 10,000 Stone, every upgrade gives 100 EXP (300
// on a crit) and level 1 needs 100 EXP.
const FIRST_UPGRADE_STONE = 10_000
const TALENT_ID = 1

const talentRow = (name: string) =>
  sql(
    `select t.level, t.exp, coalesce(t.active_slot::text, '') from character_talents t
     join characters c on c.id = t.character_id where c.name = :'name' and t.talent_id = :'id'`,
    { name, id: TALENT_ID },
  )

test('a level-51 ninja upgrades a talent and activates it', async ({ browser }) => {
  // Arrange: level 51 with Stone, and the first talent one EXP short of level 1 so any upgrade
  // (crit or not) levels it up.
  const { context, page, name } = await createSeededNinja(browser, 'Talent')
  try {
    seedCharacter(name, 'level = 51, stone = 100000')
    sql(
      `insert into character_talents (character_id, talent_id, level, exp)
       select id, :'id', 0, 99 from characters where name = :'name'`,
      { name, id: TALENT_ID },
    )
    await reloadGame(page)

    // Act: Character window, Talents, then a Stone upgrade of the first talent.
    await openMenu(page, 'Character')
    await dialog(page, 'Stats').getByRole('button', { name: 'Talents', exact: true }).click()
    const talents = dialog(page, 'Talents')
    const upgrade = talents.getByRole('button', { name: /^Normal \(/ })
    await expect(upgrade).toBeEnabled()
    const upgraded = page.waitForResponse(
      (r) => r.url().includes(`/api/game/talents/${TALENT_ID}/upgrade`) && r.ok(),
    )
    await upgrade.click()
    await upgraded

    // Assert: the talent reached level 1 and the Stone was spent.
    await expect(
      talents.getByRole('list', { name: 'Talents' }).getByRole('listitem').first(),
    ).toContainText('Level 1')
    expect(talentRow(name)).toMatch(/^1\|\d+\|$/)
    expect(sql(`select stone from characters where name = :'name'`, { name })).toBe(
      String(100_000 - FIRST_UPGRADE_STONE),
    )

    // Act: activate it.
    const activated = page.waitForResponse(
      (r) => r.url().includes(`/api/game/talents/${TALENT_ID}/active`) && r.ok(),
    )
    await talents.getByRole('button', { name: 'Activate', exact: true }).click()
    await activated

    // Assert: it is active in the window and in slot 0 of the database.
    await expect(talents.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible()
    await expect(talents).toContainText('Active: 1/3')
    expect(talentRow(name)).toMatch(/^1\|\d+\|0$/)
  } finally {
    await context.close()
  }
})
