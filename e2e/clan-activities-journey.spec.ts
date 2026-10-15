// Clan Training, Protection, Logs, Clan Wars and Clan Missions journeys, all from the Clan window
// (bottom-bar Clan icon). Training: the leader donates the Beginner's Course. Protection: one boss
// fight (replay skipped), one attempt fewer; both show on the Logs tab. Clan Wars: the leader's
// set I is registered on open, the clan and a rival get four and five more seeded fighters (copies
// of the leader's snapshot), and the leader attacks 5v5. Clan Missions: the leader starts the first
// boss from clan storage and attacks it.
import { expect, test, type Page } from '@playwright/test'
import {
  createSeededNinja,
  dialog,
  openMenu,
  reloadGame,
  seedCharacter,
  skipReplay,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(180_000)

const characterOf = `(select id from characters where name = :'name')`
const clanOf = `(select clan_id from clan_members where character_id = ${characterOf})`

/** A level-30 ninja leading a fresh clan, on the Clan window's Events tab. */
async function clanLeader(page: Page, name: string) {
  sql(
    `with me as (select id from characters where name = :'name'),
     clan as (insert into clans (name, founder_id, stone) select :'clan', id, 10000000 from me returning id)
     insert into clan_members (character_id, clan_id, role) select me.id, clan.id, 'leader' from me, clan;`,
    { name, clan: `Act${Date.now().toString(36).slice(-6)}` },
  )
  seedCharacter(name, 'level = 30, stone = 1000000, gift_coupon = 1000, gold = 1000')
  await reloadGame(page)
  await openMenu(page, 'Clan')
  const clan = dialog(page, 'Clan')
  await clan.getByRole('tab', { name: 'Events' }).click()
  return clan
}

/**
 * `count` seeded ninjas (users + characters copied from `name`) in clan `clanName` (created when
 * `role` is 'leader' for the first one), each with a copy of `name`'s saved Clan War fighter.
 */
function seedFighters(name: string, prefix: string, count: number, clan: 'mine' | string) {
  for (let i = 0; i < count; i++) {
    const ninja = `${prefix}${i}`
    sql(
      `with u as (
         insert into users (username, email, password_hash)
         values (:'ninja', lower(:'ninja') || '@example.test', 'x') returning id),
       me as (select * from characters where name = :'name'),
       c as (
         insert into characters (user_id, name, gender, nation, clothing, avatar_id, hp, mp, scene_id, level)
         select u.id, :'ninja', me.gender, me.nation, me.clothing, me.avatar_id, me.hp, me.mp, me.scene_id, me.level
         from u, me returning id)
       insert into clan_war_fighters (character_id, set, power, name, level, clothing, snapshot)
       select c.id, f.set, f.power, :'ninja', f.level, f.clothing, f.snapshot
       from c, clan_war_fighters f where f.character_id = (select id from me);`,
      { name, ninja },
    )
    if (clan === 'mine')
      sql(
        `insert into clan_members (character_id, clan_id)
         select (select id from characters where name = :'ninja'), ${clanOf};`,
        { name, ninja },
      )
    else if (i === 0)
      sql(
        `with leader as (select id from characters where name = :'ninja'),
         clan as (insert into clans (name, founder_id) select :'clan', id from leader returning id)
         insert into clan_members (character_id, clan_id, role) select leader.id, clan.id, 'leader' from leader, clan;`,
        { ninja, clan },
      )
    else
      sql(
        `insert into clan_members (character_id, clan_id)
         select (select id from characters where name = :'ninja'), (select id from clans where name = :'clan');`,
        { ninja, clan },
      )
  }
}

test('donates to Training, fights Protection and reads both on the Logs tab', async ({
  browser,
}) => {
  const { context, page, name } = await createSeededNinja(browser, 'Train')
  try {
    // Arrange: a clan leader on the Events tab.
    const clan = await clanLeader(page, name)

    // Act: Training -> Beginner's Course -> Confirm.
    await clan.getByRole('button', { name: 'Training' }).click()
    const training = dialog(page, 'Training')
    await training.getByRole('button', { name: "Beginner's Course" }).click()
    const confirm = dialog(page, 'Confirm your donation?')
    await expect(confirm).toContainText('Spend 30,000 Stones to gain 850 Experience')
    await confirm.getByRole('button', { name: 'Confirm' }).click()

    // Assert: the course is done for today; Stones were paid.
    await expect(training.getByRole('button', { name: 'Primary medal, donated' })).toBeDisabled()
    expect(sql(`select stone from characters where name = :'name'`, { name })).toBe('970000')
    await training.getByRole('button', { name: 'Close' }).click()

    // Act: Protection -> Battle, skip the replay, close the result.
    await clan.getByRole('button', { name: 'Protection' }).click()
    const protection = dialog(page, 'Clan Protection')
    await expect(protection).toContainText('Attempts Left: 3')
    await protection.getByRole('button', { name: 'Battle' }).click()
    await skipReplay(page)
    const result = page.getByRole('dialog', { name: /^(Victory|Defeat)$/ })
    await expect(result).toContainText('Attempts Left: 2')
    await result.getByRole('button', { name: 'OK' }).click()
    await expect(dialog(page, 'Clan Protection')).toContainText('Attempts Left: 2')
    await dialog(page, 'Clan Protection').getByRole('button', { name: 'Close' }).click()

    // Assert: the Logs tab lists both.
    await clan.getByRole('tab', { name: 'Logs' }).click()
    const log = clan.getByRole('list', { name: 'Clan Activity Log' })
    await expect(log).toContainText("Beginner's Course")
    await expect(log).toContainText('Protection')
  } finally {
    await context.close()
  }
})

test('the leader attacks a rival clan 5v5 in Clan Wars', async ({ browser }) => {
  const { context, page, name } = await createSeededNinja(browser, 'War')
  try {
    // Arrange: opening Clan Wars registers the leader's set I.
    const clan = await clanLeader(page, name)
    await clan.getByRole('button', { name: 'Clan Wars' }).click()
    let wars = dialog(page, 'Clan Wars')
    await expect(wars).toContainText('Fighters: 1')
    await wars.getByRole('button', { name: 'My Fighter' }).click()
    await expect(wars.getByLabel('Saved fighter')).toContainText(name)
    await wars.getByRole('button', { name: 'Close' }).click()

    // Arrange: four more fighters for us, a rival clan of five.
    const tag = Date.now().toString(36).slice(-4)
    const rival = `Riv${tag}`
    seedFighters(name, `Ally${tag}_`, 4, 'mine')
    seedFighters(name, `Foe${tag}_`, 5, rival)

    // Act: reopen Clan Wars, pick the rival, 5v5, Attack Clan -> Confirm Attack.
    await clan.getByRole('button', { name: 'Clan Wars' }).click()
    wars = dialog(page, 'Clan Wars')
    await expect(wars).toContainText('Fighters: 5')
    await wars.getByRole('textbox', { name: 'Search clan' }).fill(rival)
    await wars.getByRole('list', { name: 'Rival clans' }).getByRole('button').first().click()
    await expect(wars.getByRole('button', { name: '5v5' })).toBeEnabled()
    await expect(wars.getByRole('button', { name: '10v10' })).toBeDisabled()
    await wars.getByRole('button', { name: 'Attack Clan' }).click()
    const attack = dialog(page, `Attack ${rival}?`)
    await expect(attack).toContainText('The rosters are closely matched. Full base rewards apply.')
    await attack.getByRole('button', { name: 'Confirm Attack' }).click()

    // Assert: the war is in History and today's attack is used.
    await expect(wars.getByRole('status')).toContainText(`war complete against ${rival}`)
    await expect(
      wars.getByRole('listitem', { name: new RegExp(`^(VICTORY|DEFEAT|DRAW) against ${rival}$`) }),
    ).toBeVisible()
    await wars.getByRole('button', { name: 'War', exact: true }).click()
    await expect(wars.getByRole('button', { name: 'Attacked Today', exact: true })).toBeDisabled()
    expect(
      sql(
        `select count(*) from clan_wars where defender_clan_id = (select id from clans where name = :'rival')`,
        { rival },
      ),
    ).toBe('1')
  } finally {
    await context.close()
  }
})

test('the leader starts a Clan Missions boss and attacks it', async ({ browser }) => {
  const { context, page, name } = await createSeededNinja(browser, 'Boss')
  try {
    // Arrange: a clan with 10,000,000 Stones in storage.
    const clan = await clanLeader(page, name)

    // Act: Clan Missions -> Shadow Grunt -> Start Battle -> Start Now.
    await clan.getByRole('button', { name: 'Clan Missions' }).click()
    const missions = dialog(page, 'Clan Missions')
    const grunt = missions.getByRole('listitem', { name: 'Shadow Grunt' })
    await grunt.getByRole('button', { name: 'Start Battle' }).click()
    const start = dialog(page, 'Shadow Grunt')
    await expect(start).toContainText('Cost: 1M Stones (from clan storage)')
    await start.getByRole('button', { name: 'Start Now' }).click()

    // Assert: the boss is up with its shared HP; storage paid.
    await expect(grunt.getByRole('meter', { name: 'Boss HP' })).toBeVisible()
    await expect(missions).toContainText('Missions started today: 1/3')
    expect(sql(`select stone from clans where id = ${clanOf}`, { name })).toBe('9000000')

    // Act: attack it, skip the replay.
    await grunt.getByRole('button', { name: 'Attack Shadow Grunt' }).click()
    await skipReplay(page)
    const result = page.getByRole('dialog', { name: /^(Attack Over|Boss Defeated)$/ })
    await expect(result).toContainText('Damage')
    await result.getByRole('button', { name: 'OK' }).click()

    // Assert: the attack counted.
    await expect(dialog(page, 'Clan Missions')).toContainText('Your attacks: 1')
  } finally {
    await context.close()
  }
})
