// Home and clan Events journeys. Home: a ninja opens Home from the village icon, buys Grass for an
// empty field, the crop ripens (seeded: its ripening time is moved into the past) and is harvested
// into the bag. Ninja Garden: a clan leader plants a Money Tree from the Clan window's Events tab,
// it grows (seeded) and the harvest pays Bankai Coins and Clan Points. Picnic: in a level-4 clan
// the leader gives Stones and an outfit to the warehouse and finds itself on the leaderboard.
import { expect, test, type Page } from '@playwright/test'
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
test.setTimeout(120_000)

const characterOf = `(select id from characters where name = :'name')`

/** Moves every ripening time in `table`.plots (at `path`) into the past. */
function ripen(name: string, table: 'home_farms' | 'clan_gardens', path: string) {
  sql(
    `update ${table} set plots = (
       select jsonb_agg(case when p #> '${path}' is null or p #> '${path}' = 'null'::jsonb
         then p else jsonb_set(p, '${path}', '1') end)
       from jsonb_array_elements(plots) p)
     where character_id = ${characterOf};`,
    { name },
  )
}

/** A level-30 ninja leading a fresh clan of `level`. */
async function clanLeader(page: Page, name: string, level: number) {
  sql(
    `with me as (select id from characters where name = :'name'),
     clan as (insert into clans (name, founder_id, level) select :'clan', id, :level from me returning id)
     insert into clan_members (character_id, clan_id, role) select me.id, clan.id, 'leader' from me, clan;`,
    { name, clan: `Home${Date.now().toString(36).slice(-5)}`, level },
  )
  seedCharacter(name, 'level = 30, stone = 1000000, gift_coupon = 1000, gold = 100')
  await reloadGame(page)
  await openMenu(page, 'Clan')
  const clan = dialog(page, 'Clan')
  await clan.getByRole('tab', { name: 'Events' }).click()
  return clan
}

test('plants a seed at Home and harvests the ripe crop into the bag', async ({ browser }) => {
  // Arrange: a ninja with Stones for a seed.
  const { context, page, name } = await createSeededNinja(browser, 'Farmer')
  try {
    seedCharacter(name, 'stone = 10000')
    await reloadGame(page)

    // Act: open Home from the village icon and buy Grass for the first field.
    await page
      .getByRole('navigation', { name: 'Features' })
      .getByRole('button', { name: 'Home' })
      .click()
    const home = dialog(page, 'Home')
    await home.getByRole('button', { name: 'Field 1: empty' }).click()
    const seeds = dialog(page, 'Seeds')
    await seeds
      .getByRole('listitem', { name: 'Grass' })
      .getByRole('button', { name: 'Buy' })
      .click()

    // Assert: the field grows with an hour on the server clock; Stones were paid.
    await expect(
      home.getByRole('button', { name: /^Field 1: Grass, 0[01]:\d\d:\d\d$/ }),
    ).toBeVisible()
    expect(sql(`select stone from characters where name = :'name'`, { name })).toBe('9500')

    // Act: the crop ripens; reopen Home and harvest it.
    ripen(name, 'home_farms', '{readyAt}')
    await home.getByRole('button', { name: 'Close' }).click()
    await page
      .getByRole('navigation', { name: 'Features' })
      .getByRole('button', { name: 'Home' })
      .click()
    await dialog(page, 'Home').getByRole('button', { name: 'Field 1: Grass, ready' }).click()

    // Assert: five Grass in the bag and the field is empty again.
    await expect(page.getByText('Harvested Grass x5.')).toBeVisible()
    await expect(dialog(page, 'Home').getByRole('button', { name: 'Field 1: empty' })).toBeVisible()
    expect(heldCount(name, 'i170001')).toBe('5')
  } finally {
    await context.close()
  }
})

test('plants and harvests a Money Tree in the clan Ninja Garden', async ({ browser }) => {
  const { context, page, name } = await createSeededNinja(browser, 'Garden')
  try {
    // Arrange: a clan leader on the Clan window's Events tab.
    const clan = await clanLeader(page, name, 1)
    await expect(clan.getByRole('meter', { name: 'Clan EXP' })).toHaveText('0 / 35000')

    // Act: Garden -> plot 1 -> Money Tree -> Plant Tree.
    await clan.getByRole('button', { name: 'Garden' }).click()
    const garden = dialog(page, 'Ninja Garden')
    await garden.getByRole('button', { name: 'Plot 1: empty' }).click()
    await dialog(page, 'Choose Tree')
      .getByRole('button', { name: /Money Tree/ })
      .click()
    const ninjutsu = dialog(page, 'Ninjutsu Garden')
    await expect(ninjutsu).toContainText('240 Bankai coin and 300 Clan points.')
    await ninjutsu.getByRole('button', { name: 'Plant Tree' }).click()

    // Assert: the tree grows; it cannot be harvested yet.
    const tree = garden.getByRole('button', { name: 'Plot 1: Level 1 Money Tree, growing' })
    await expect(tree).toBeVisible()
    await tree.click()
    await expect(dialog(page, 'Notice')).toContainText('The tree is still growing.')
    await dialog(page, 'Notice').getByRole('button', { name: 'OK' }).click()

    // Act: the tree grows (seeded); reopen the garden and harvest.
    ripen(name, 'clan_gardens', '{tree,readyAt}')
    await garden.getByRole('button', { name: 'Close' }).click()
    await clan.getByRole('button', { name: 'Garden' }).click()
    await dialog(page, 'Ninja Garden')
      .getByRole('button', { name: 'Plot 1: Level 1 Money Tree, ready' })
      .click()

    // Assert: the rewards, the resting plot, Bankai Coins and the clan's EXP.
    const notice = dialog(page, 'Notice')
    await expect(notice).toContainText('Harvested Level 1 Money Tree!')
    await expect(notice).toContainText('+300 Clan Honor')
    await expect(notice).toContainText('+240 Coins')
    await notice.getByRole('button', { name: 'OK' }).click()
    await expect(
      dialog(page, 'Ninja Garden').getByRole('button', { name: 'Plot 1: on cooldown' }),
    ).toBeVisible()
    expect(
      sql(`select coins from character_bankai where character_id = ${characterOf}`, { name }),
    ).toBe('240')
    await dialog(page, 'Ninja Garden').getByRole('button', { name: 'Close' }).click()
    await clan.getByRole('tab', { name: 'Management' }).click()
    await clan.getByRole('tab', { name: 'Events' }).click()
    await expect(clan.getByRole('meter', { name: 'Clan EXP' })).toHaveText('300 / 35000')
  } finally {
    await context.close()
  }
})

test('fills the Picnic warehouse with Stones and an outfit', async ({ browser }) => {
  const { context, page, name } = await createSeededNinja(browser, 'Picnic')
  try {
    // Arrange: a level-4 clan and a spare outfit (+12) in the bag.
    giveItem(name, 'i291101')
    const clan = await clanLeader(page, name, 4)

    // Act: Stone Contribution.
    await clan.getByRole('button', { name: 'Picnic' }).click()
    const picnic = dialog(page, 'Picnic in Garden')
    await expect(picnic.getByRole('meter', { name: 'Warehouse' })).toHaveText('0 / 1000')
    await picnic.getByRole('button', { name: 'Stone Contribution' }).click()
    const confirm = dialog(page, 'Stone Contribution')
    await expect(confirm).toContainText('Spend 150,000 Stones for +10 warehouse points?')
    await confirm.getByRole('button', { name: 'Confirm' }).click()
    await expect(dialog(page, 'Success')).toContainText('+10 points!')
    await dialog(page, 'Success').getByRole('button', { name: 'OK' }).click()

    // Act: Outfit Contribution through Select Outfit.
    await picnic.getByRole('button', { name: 'Outfit Contribution' }).click()
    const select = dialog(page, 'Select Outfit')
    await select.getByRole('list', { name: 'Outfits' }).getByRole('button').first().click()
    await expect(dialog(page, 'Success')).toContainText('+3 points!')
    await dialog(page, 'Success').getByRole('button', { name: 'OK' }).click()

    // Assert: the warehouse bar, the outfit gone, and the leaderboard row.
    await expect(picnic.getByRole('meter', { name: 'Warehouse' })).toHaveText('13 / 1000')
    expect(heldCount(name, 'i291101')).toBe('0')
    await picnic.getByRole('button', { name: 'Leaderboard' }).click()
    await expect(dialog(page, 'Contribution Leaderboard').getByRole('row', { name })).toContainText(
      '13',
    )
  } finally {
    await context.close()
  }
})
