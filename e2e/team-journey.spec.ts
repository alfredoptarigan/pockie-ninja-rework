// M4 team journey: two ninjas in Demon City form a party (invite by name, accept the popup), the
// captain leads it into toll gate 100001 and fights, and both members get the rewards and cards.
// Levels, the scene, a strong weapon and full HP are seeded; every team and gate action is UI.
import { expect, test, type Page } from '@playwright/test'
import {
  armNinja,
  createTwoNinjas,
  dialog,
  expectScene,
  openNpcWindow,
  skipReplay,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(150_000)

const DEMON_CITY = { id: 171, name: 'Demon City' }
// TollGate_100001: Valhalla Camp (Hard), level 16-25, solo or team, two stages of five points, no
// entry item. 100021 is the Normal Valhalla Camp.
const GATE = { name: 'Valhalla Camp', row: 'Hard - Level 16-25' }

/** Stone and EXP progress (level and EXP in one number) of a ninja. */
function rewardsOf(name: string) {
  const [level, exp, stone] = sql(`select level, exp, stone from characters where name = :'name'`, {
    name,
  }).split('|')
  return { stone: Number(stone), progress: Number(level) * 1e12 + Number(exp) }
}

const guard = (page: Page) => dialog(page, 'Demon City Guard')

async function openGuard(page: Page) {
  await openNpcWindow(page, 'Demon City Guard', 'Enter')
  await expect(guard(page)).toBeVisible()
}

test('a captain invites by name, leads the team through toll gate 100001 and both are paid', async ({
  browser,
}) => {
  // Arrange: two level-20 ninjas at the Demon City Guard, armed and at full HP.
  const players = await createTwoNinjas(browser, ['Cap', 'Mate'])
  const [captain, mate] = players
  try {
    for (const { page, name } of players) {
      await armNinja(page, name, `level = 20, scene_id = ${DEMON_CITY.id}`)
      await expectScene(page, DEMON_CITY.name)
    }

    // Act: the captain creates a party and invites the mate by name.
    await captain.page.getByRole('button', { name: 'Party', exact: true }).click()
    const team = dialog(captain.page, 'Party')
    await expect(team).toContainText('You are not in a party.')
    await team.getByRole('button', { name: 'Create party' }).click()
    await team.getByLabel('Ninja name').fill(mate.name)
    await team.getByRole('button', { name: 'Invite' }).click()
    await expect(team).toContainText('Invitation sent.')

    // The mate accepts in the Party Invite popup and sees both party portraits.
    const prompt = dialog(mate.page, 'Party Invite')
    await expect(prompt).toContainText(
      `${captain.name} (Level 20) invites you to join their party.`,
    )
    await prompt.getByRole('button', { name: 'Accept' }).click()
    const portraits = mate.page.getByRole('list', { name: 'Party members' })
    await expect(portraits.getByRole('listitem')).toHaveCount(2)
    await expect(portraits.getByRole('listitem').first()).toHaveAccessibleName(captain.name)

    // Assert: the captain's Party window shows the fight order, the leader first.
    const members = team.getByRole('list', { name: 'Fight order' })
    await expect(members.getByRole('listitem')).toHaveCount(2)
    await expect(members.getByRole('listitem').first()).toContainText(`${captain.name} Lv. 20`)
    await expect(members.getByRole('listitem').first()).toContainText('Leader')
    await team.getByRole('button', { name: 'Close' }).click()

    // Act: the captain enters the gate for the team and fights the first point.
    await openGuard(captain.page)
    await guard(captain.page)
      .getByRole('listitem')
      .filter({ hasText: GATE.row })
      .getByRole('button', { name: `Enter ${GATE.name}` })
      .click()
    const stages = guard(captain.page).getByRole('list', { name: 'Stages' })
    // The first team entry of a fresh server loads the gate tables, which can take seconds.
    await expect(stages).toContainText('Stage 1: point 1 of 5', { timeout: 30_000 })
    await guard(captain.page).getByRole('button', { name: 'Fight', exact: true }).click()
    await skipReplay(captain.page)

    // Assert: the win moves both runs on and the mate hears of it (the first points pay nothing;
    // the stage and gate rewards come at the ends).
    await expect(guard(captain.page).getByRole('status')).toContainText('Victory!')
    await expect(stages).toContainText('Stage 1: point 2 of 5')
    const mateChat = mate.page.getByRole('region', { name: 'Chat' })
    await expect(mateChat).toContainText('Your team won the fight.')
    expect(
      sql(
        `select string_agg(point::text, ',') from toll_gate_runs r
         join characters c on c.id = r.character_id where c.name in (:'a', :'b')`,
        { a: captain.name, b: mate.name },
      ),
    ).toBe('1,1')

    // Arrange: eight more points take long to replay, so both runs skip to the last point
    // (stage 2, point 5) as winPoint leaves them after point 9.
    sql(
      `update toll_gate_runs set sub_gate = 1, point = 4, passed_point = 8
       where character_id in (select id from characters where name in (:'a', :'b'));`,
      { a: captain.name, b: mate.name },
    )
    const before = { [captain.name]: rewardsOf(captain.name), [mate.name]: rewardsOf(mate.name) }
    await guard(captain.page).getByRole('button', { name: 'Close' }).click()
    await openGuard(captain.page)
    await expect(stages).toContainText('Stage 2: point 5 of 5')

    // Act: the captain fights the last point and clears the gate.
    await guard(captain.page).getByRole('button', { name: 'Fight', exact: true }).click()
    await skipReplay(captain.page)

    // Assert: the stage and gate rewards reach both members (the captain with the bonus).
    await expect(guard(captain.page).getByRole('status')).toContainText(/EXP \+\d+, Stone \+\d+/)
    await expect(mateChat).toContainText(/You received [1-9]\d* EXP and [1-9]\d* Stone\./)
    for (const { name } of players) {
      const now = rewardsOf(name)
      expect(now.stone).toBeGreaterThan(before[name]!.stone)
      expect(now.progress).toBeGreaterThan(before[name]!.progress)
    }

    // Each member has five cards of their own and takes one.
    for (const { page } of players) {
      if (page === mate.page) await openGuard(page)
      await expect(guard(page)).toContainText('Toll gate cleared! Take one of the five cards.')
      await guard(page).getByRole('button', { name: 'Take card 1' }).click()
      await expect(guard(page).getByRole('status')).toContainText('You took')
    }
    expect(
      sql(
        `select count(*) from toll_gate_runs r join characters c on c.id = r.character_id
         where c.name in (:'a', :'b')`,
        { a: captain.name, b: mate.name },
      ),
    ).toBe('0')
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
