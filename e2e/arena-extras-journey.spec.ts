// Reborn's arena extras: Buy Arena Tickets and the Weekly Rewards claim, a Squad Arena 3v3 fight
// against another player's squad, and joining the Championship bracket. Levels, Gift
// Certificates, outfits for the other sets and last week's points are seeded.
import { expect, test } from '@playwright/test'
import {
  createSeededNinja,
  createTwoNinjas,
  dialog,
  giveItem,
  reloadGame,
  seedCharacter,
  skipReplay,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(180_000)

// Set I wears the creation outfit (AGI); these give sets II and III a STR and a STA outfit.
const STR_OUTFIT = 'i290001'
const STA_OUTFIT = 'i290006'

const honorOf = (name: string) =>
  Number(sql(`select honor from characters where name = :'name'`, { name }))

test('a ninja buys arena tickets and claims last week reward', async ({ browser }) => {
  // Arrange: 300 Gift Certificates; first on last week's arena points.
  const { context, page, name } = await createSeededNinja(browser, 'Weekly')
  try {
    seedCharacter(name, 'level = 20, gift_coupon = 300, honor = 0')
    sql(
      `insert into arena_weekly_points (kind, week, character_id, points)
       select 'arena', date_trunc('week', now() at time zone 'utc')::date - 7, id, 100000
       from characters where name = :'name';`,
      { name },
    )
    await reloadGame(page)

    // Act: buy two tickets.
    await page.getByRole('button', { name: 'Arena', exact: true }).click()
    const arena = dialog(page, 'Arena')
    await arena.getByRole('button', { name: 'Buy Tickets' }).click()
    const buy = dialog(page, 'Buy Arena Tickets')
    await buy.getByLabel('Number of tickets to buy').fill('2')
    await expect(buy).toContainText('Cost: 200 Gift Certificates')
    await buy.getByRole('button', { name: 'Buy', exact: true }).click()
    await expect(dialog(page, 'Purchase successful!')).toContainText(
      'Your purchase was successful!',
    )
    await dialog(page, 'Purchase successful!').getByRole('button', { name: 'OK' }).click()

    // Assert: two tickets, 100 Gift Certificates left.
    await expect(arena.getByRole('region', { name: 'Your arena' })).toContainText('Tickets2')
    expect(sql(`select gift_coupon from characters where name = :'name'`, { name })).toBe('100')

    // Act: open Weekly Rewards; claim while the claim window (Monday to Friday) is open.
    await arena.getByRole('button', { name: 'Weekly Rewards' }).click()
    const weekly = dialog(page, 'Arena Weekly Rewards')
    await expect(weekly.getByRole('table', { name: 'Rewards by Rank' })).toContainText('#11-50')
    const claim = weekly.getByRole('button', { name: 'Claim', exact: true })
    const day = new Date().getUTCDay()
    if (day >= 1 && day <= 5) {
      await claim.click()
      await expect(weekly.getByText('Claimed Rank Rewards')).toBeVisible()
      expect(honorOf(name)).toBeGreaterThan(0)
    } else {
      await expect(claim).toBeDisabled()
    }
  } finally {
    await context.close()
  }
})

test('a ninja builds a squad and fights another player squad', async ({ browser }) => {
  // Arrange: two level 60 ninjas with STR and STA outfits in sets II and III; the rival's
  // squad is saved.
  const [me, rival] = await createTwoNinjas(browser, ['Squad', 'Rival'])
  try {
    for (const { name } of [me, rival]) {
      seedCharacter(name, 'level = 60')
      giveItem(name, STR_OUTFIT, { equipped_slot: 'Outfit', equipped_set: 2 })
      giveItem(name, STA_OUTFIT, { equipped_slot: 'Outfit', equipped_set: 3 })
    }
    sql(
      `insert into squad_players (character_id, loadouts)
       select id, '{1,2,3}' from characters where name = :'name';`,
      { name: rival.name },
    )
    const { page } = me
    await reloadGame(page)

    // Act: Edit Squad with loadouts I (AGI), II (STR), III (STA).
    await page.getByRole('button', { name: 'Arena', exact: true }).click()
    const arena = dialog(page, 'Arena')
    await arena.getByRole('tab', { name: 'Squad Arena' }).click()
    await arena.getByRole('button', { name: 'Edit Squad' }).click()
    const edit = dialog(page, 'Select Your Squad')
    for (const loadout of ['Loadout I: AGI', 'Loadout II: STR', 'Loadout III: STA'])
      await edit.getByRole('button', { name: loadout }).click()
    await edit.getByRole('button', { name: 'Confirm Squad' }).click()
    await expect(edit).toBeHidden()
    await expect(arena.getByRole('region', { name: 'Your squad' })).toContainText('Squad: 3/3')

    // Act: fight the rival's squad and skip the three rounds.
    await arena.getByRole('button', { name: `Fight ${rival.name}` }).click()
    for (let round = 0; round < 3; round++) await skipReplay(page)

    // Assert: the result, 50 Team Coins and a history line.
    await expect(dialog(page, 'Arena').getByRole('status').first()).toContainText(
      /^Squad (Won!|Lost\.) Score [+-]\d+\.\d\d, \+50 Team Coins/,
    )
    const squad = dialog(page, 'Arena')
    await squad.getByRole('tab', { name: 'Squad Arena' }).click()
    await expect(squad.getByRole('region', { name: 'Your squad' })).toContainText('Team Coins: 50')
    await expect(squad.getByRole('region', { name: 'Squad history' })).toContainText(
      `You challenged ${rival.name}`,
    )
  } finally {
    await Promise.all([me, rival].map(({ context }) => context.close()))
  }
})

test('a ninja joins the Championship bracket', async ({ browser }) => {
  // Registration runs 00:00-22:00 UTC (CHAMPIONSHIP_PLACEHOLDERS).
  test.skip(new Date().getUTCHours() >= 22, 'Championship registration is closed after 22:00 UTC')
  const { context, page, name } = await createSeededNinja(browser, 'Champ')
  try {
    seedCharacter(name, 'level = 40')
    await reloadGame(page)
    await page.getByRole('button', { name: 'Arena', exact: true }).click()
    const arena = dialog(page, 'Arena')
    await arena.getByRole('tab', { name: 'Championship' }).click()
    const status = arena.getByRole('region', { name: 'Championship status' })
    await expect(status).toContainText('Registration Open')
    await expect(status).toContainText('Status: Joinable')

    await arena
      .getByRole('button', { name: /^Join slot / })
      .first()
      .click()

    await expect(status).toContainText('Status: Registered')
    await expect(arena.getByText(`${name} (Lv. 40) (You)`)).toBeVisible()
  } finally {
    await context.close()
  }
})
