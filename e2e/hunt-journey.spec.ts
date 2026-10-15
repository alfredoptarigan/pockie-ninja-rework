// Hunt, Chain Attack and Adventure with Jiraiya journeys: a chain attack configured from a monster
// card and finished instantly, a hunt begun and finished at the Arena Master, and the battle guard
// of an adventure with Jiraiya.
import { expect, test } from '@playwright/test'
import {
  armNinja,
  createSeededNinja,
  dialog,
  expectScene,
  openNpcWindow,
  reloadGame,
  sceneAction,
  seedCharacter,
  sql,
} from './helpers'
import { visitRequiredScenes } from '../server/src/modules/game/field-data'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(150_000)

const FIELD = 2101
const MONSTER = 'Sunflower'
const ARENA = 'Arena Master'

test('a chain attack runs from a monster card, blocks fights and finishes instantly', async ({
  browser,
}) => {
  // Arrange: a level-30 ninja with coupons in the Smelting Mountains.
  const { context, page, name } = await createSeededNinja(browser, 'Chain')
  try {
    seedCharacter(name, 'scene_id = :scene, gift_coupon = 100', { scene: FIELD })
    await armNinja(page, name, 'level = 30')
    await expectScene(page, 'Smelting Mountains')

    // Act: right-click the Sunflower card, Chain Attack, 2 monsters, Begin.
    await page.getByTestId('monster-card').filter({ hasText: MONSTER }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Chain Attack' }).click()
    const config = dialog(page, 'Chain Attack')
    await config.getByLabel('Monsters to chain').selectOption('2')
    await expect(config).toContainText('00:06:00')
    await config.getByRole('button', { name: 'Begin' }).click()
    const progress = dialog(page, 'Chain Attack Progress')
    await expect(progress).toContainText('Fighting 2 Monsters')
    await progress.getByRole('button', { name: 'Close' }).last().click()

    // Assert: no other battle while it runs.
    await (await sceneAction(page, `Fight ${MONSTER}`)).click()
    await expect(
      page.getByText('Cannot start a battle while chain attack is in progress.'),
    ).toBeVisible()

    // Act: the HUD timer reopens the progress; Instant Finish for 10 coupons.
    await page.getByRole('button', { name: /^Chain/ }).click()
    await dialog(page, 'Chain Attack Progress')
      .getByRole('button', { name: 'Instant Finish' })
      .click()
    const confirm = dialog(page, 'Finish this task instantly?')
    await expect(confirm).toContainText('Cost: 10 Coupons')
    await confirm.getByRole('button', { name: 'Confirm' }).click()

    // Assert: both Sunflowers fought, coupons spent, the chain gone.
    const result = dialog(page, 'Chain Attack')
    await expect(result).toContainText('Defeated 2 of 2 monsters.')
    await result.getByRole('button', { name: 'OK' }).click()
    expect(sql(`select gift_coupon from characters where name = :'name'`, { name })).toBe('90')
    expect(
      sql(
        `select count(*) from chain_attacks a join characters c on c.id = a.character_id
         where c.name = :'name'`,
        { name },
      ),
    ).toBe('0')
  } finally {
    await context.close()
  }
})

test('a hunt begun at the Arena Master is finished there for arena challenges', async ({
  browser,
}) => {
  // Arrange: a level-30 ninja in the Fire Village who used 7 arena challenges today.
  const { context, page, name } = await createSeededNinja(browser, 'Hunter')
  try {
    // Hunts pick monsters in areas the ninja has entered: all of the walkable world.
    seedCharacter(name, `scenes_entered = '{${visitRequiredScenes().join(',')}}'`)
    await armNinja(page, name, 'level = 30')
    sql(
      `insert into arena_players (character_id, day, tries_used)
       select id, (now() at time zone 'utc')::date, 7 from characters where name = :'name'`,
      { name },
    )

    // Act: Hunt Monsters, Begin Hunt.
    await openNpcWindow(page, ARENA, 'Hunt Monsters')
    await dialog(page, ARENA).getByRole('button', { name: 'Begin Hunt' }).click()
    const hunt = page.getByRole('region', { name: 'Hunt', exact: true })
    await expect(hunt.getByRole('button', { name: /travel to it$/ })).toHaveCount(3)
    await dialog(page, ARENA).getByRole('button', { name: 'End Conversation' }).click()

    // The hunted monsters are random: make it one Sunflower so the journey can win the fight.
    sql(
      `update hunts set targets = '{n33017}', target_scenes = '{${FIELD}}', killed = '{f}'
       where character_id = (select id from characters where name = :'name')`,
      { name },
    )
    await reloadGame(page)
    await hunt.getByRole('button', { name: `${MONSTER}, travel to it` }).click()
    await expectScene(page, 'Smelting Mountains')
    await (await sceneAction(page, `Fight ${MONSTER}`)).click()
    // The strong weapon wins at once: the replay may be over before Skip can be pressed.
    await dialog(page, 'Victory').getByRole('button', { name: 'OK' }).click({ timeout: 30_000 })

    // Completed travels home; Finish Hunt at the Arena Master pays 5 challenges back.
    await hunt.getByRole('button', { name: 'Completed' }).click()
    await expectScene(page, 'Fire Village')
    await openNpcWindow(page, ARENA, 'Hunt Monsters')
    await dialog(page, ARENA).getByRole('button', { name: 'Finish Hunt' }).click()
    await expect(page.getByText('Hunt complete! 5 arena challenges restored.')).toBeVisible()
    await expect(hunt).toHaveCount(0)
    expect(
      sql(
        `select h.hunts_done || ',' || a.tries_used from hunts h
         join arena_players a on a.character_id = h.character_id
         join characters c on c.id = h.character_id where c.name = :'name'`,
        { name },
      ),
    ).toBe('1,2')
  } finally {
    await context.close()
  }
})

test('a ninja on an adventure with Jiraiya cannot fight', async ({ browser }) => {
  // Arrange: a clan member away with Jiraiya since an hour ago.
  const { context, page, name } = await createSeededNinja(browser, 'Sage')
  try {
    seedCharacter(name, 'scene_id = :scene', { scene: FIELD })
    await armNinja(page, name, 'level = 30')
    sql(
      `with me as (select id from characters where name = :'name'),
       clan as (insert into clans (name, founder_id) select replace(:'name', '_', ''), id from me
         returning id),
       member as (insert into clan_members (character_id, clan_id, role)
         select me.id, clan.id, 'leader' from me, clan)
       insert into jiraiya_adventures (character_id, started_at)
       select id, now() - interval '1 hour' from me`,
      { name },
    )
    await reloadGame(page)

    // Act: fight a Sunflower.
    await (await sceneAction(page, `Fight ${MONSTER}`)).click()

    // Assert: Reborn's battle guard message, and no fight was recorded.
    await expect(
      page.getByText('You are on an adventure with Jiraiya! Return from your adventure first.'),
    ).toBeVisible()
    await expect(page.getByRole('region', { name: 'Battle replay' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
