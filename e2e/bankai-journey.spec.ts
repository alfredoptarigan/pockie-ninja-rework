// Bankai journey: a level-40 ninja opens Bankai from the bottom bar, unlocks Zangetsu, upgrades it
// from the EXP pool, rings a crystal, devours one crystal into another and buys a crystal cell.
// The EXP pool, the crystals and the coupons are seeded (no Bankai source exists in our game yet).
import { expect, test } from '@playwright/test'
import { createSeededNinja, dialog, openMenu, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const query = (name: string, select: string, from: string) =>
  sql(
    `select ${select} from ${from} x join characters c on c.id = x.character_id
       where c.name = :'name';`,
    { name },
  )

test('a ninja unlocks, upgrades and fills a Bankai', async ({ browser }) => {
  // Arrange: level 40 (Zangetsu's gate), 1000 coupons, a 5000 EXP pool and three green crystals.
  const { context, page, name } = await createSeededNinja(browser, 'Bankai')
  try {
    seedCharacter(name, 'level = 40, gift_coupon = 1000')
    sql(
      `insert into character_bankai (character_id, exp_pool)
       select id, 5000 from characters where name = :'name';
       insert into bankai_crystals (character_id, quality, stat, inventory_slot)
       select c.id, 'green', s.stat, s.slot from characters c,
         (values ('strength', 0), ('minAttack', 1), ('agility', 2)) as s(stat, slot)
       where c.name = :'name';`,
      { name },
    )
    await reloadGame(page)

    // Act: open Bankai and unlock Zangetsu.
    await openMenu(page, 'Bankai')
    const bankai = dialog(page, 'Bankai')
    await bankai.getByRole('button', { name: 'Unlock', exact: true }).click()
    await expect(bankai).toContainText('Lv.1 Zangetsu')

    // Act: upgrade; Lv1 needs 3000 of the 5000 pool.
    await bankai.getByRole('button', { name: 'Upgrade', exact: true }).click()

    // Assert: level 2 and 2000 EXP left.
    await expect(bankai).toContainText('Lv.2 Zangetsu')
    await expect(bankai).toContainText('EXP Pool: 2,000')
    expect(query(name, 'x.level', 'bankai_weapons')).toBe('2')

    // Act: pick up the Sky Rift (cell 1) and drop it on ring slot 1.
    await bankai.getByRole('button', { name: 'Cell 1: Sky Rift Lv1' }).click()
    await bankai.getByRole('button', { name: 'Ring slot 1: empty' }).click()

    // Assert: it sits in the ring and its stat shows under Soul Crystal.
    await expect(bankai.getByRole('button', { name: 'Ring slot 1: Sky Rift Lv1' })).toBeVisible()
    await expect(bankai.getByRole('list', { name: 'Soul Crystal' })).toContainText('Strength: 4')

    // Act: devour Chaos (cell 2) into Dark Shadow (cell 3).
    await bankai.getByRole('button', { name: 'Cell 3: Dark Shadow Lv1' }).click()
    await bankai.getByRole('button', { name: 'Set as target', exact: true }).click()
    await bankai.getByRole('button', { name: 'Cell 2: Chaos Lv1' }).click()
    await bankai.getByRole('button', { name: 'Add as food', exact: true }).click()
    await bankai.getByRole('button', { name: 'Devour', exact: true }).click()

    // Assert: 25 XP went into Dark Shadow and Chaos is gone.
    await expect(bankai).toContainText('+25 XP → Lv.1')
    expect(
      query(name, "string_agg(x.stat || ':' || x.exp, ',' order by x.stat)", 'bankai_crystals'),
    ).toBe('agility:25,strength:0')

    // Act: buy crystal cell 9 with coupons (50 x slot 8).
    await bankai.getByRole('button', { name: 'Cell 9: locked' }).click()
    await dialog(page, 'Unlock Slot').getByRole('button', { name: '400 Coupons' }).click()

    // Assert: the cell is open and 400 coupons are spent.
    await expect(bankai).toContainText('Slot unlocked!')
    await expect(bankai.getByRole('button', { name: 'Cell 9: empty' })).toBeVisible()
    expect(sql(`select gift_coupon from characters where name = :'name';`, { name })).toBe('600')
  } finally {
    await context.close()
  }
})
