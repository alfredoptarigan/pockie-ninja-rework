// M5 events journey: a level-51 ninja claims the daily login in the Ninja Diary and rolls the Dice
// of Fate, both opened from the Events menu. Only the level is seeded.
import { expect, test } from '@playwright/test'
import { createSeededNinja, dialog, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// events.json: the first day of the login cycle gives one i150117; a day has ten rolls (dice.rollsPerDay).
const DAY_ONE_ITEM = 'i150117'
const ROLLS_PER_DAY = 10

const count = (query: string, name: string, vars: Record<string, string> = {}) =>
  Number(sql(query, { name, ...vars }))

test('a level-51 ninja claims the daily login and rolls the Dice of Fate', async ({ browser }) => {
  // Arrange: level 51 and a fresh day (no claim, no roll).
  const { context, page, name } = await createSeededNinja(browser, 'Daily')
  try {
    seedCharacter(name, 'level = 51')
    await reloadGame(page)
    const events = page.getByRole('button', { name: 'Events', exact: true })

    // Act: Events menu, Ninja Diary, claim day 1.
    await events.click()
    await page.getByRole('button', { name: 'Ninja Diary', exact: true }).click()
    const diary = dialog(page, 'Ninja Diary')
    const dayOne = diary.getByRole('list', { name: 'Login rewards' }).getByRole('listitem').first()
    const claimed = page.waitForResponse(
      (r) => r.url().includes('/api/game/events/login/claim') && r.ok(),
    )
    await dayOne.getByRole('button', { name: 'Claim', exact: true }).click()
    await claimed

    // Assert: day 1 shows Claimed, the cycle advanced and the reward is in the bag.
    await expect(dayOne.getByRole('button', { name: 'Claimed', exact: true })).toBeDisabled()
    expect(
      sql(
        `select d.completed_days from character_daily_login d
         join characters c on c.id = d.character_id where c.name = :'name'`,
        { name },
      ),
    ).toBe('1')
    expect(
      count(
        `select count(*) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item'`,
        name,
        { item: DAY_ONE_ITEM },
      ),
    ).toBe(1)
    await diary.getByRole('button', { name: 'Close', exact: true }).click()

    // Act: Events menu, Dice of Fate, roll once.
    await events.click()
    await page.getByRole('button', { name: 'Dice of Fate', exact: true }).click()
    const dice = dialog(page, 'Dice of Fate')
    await expect(dice).toContainText(`Rolls left today: ${ROLLS_PER_DAY}.`)
    const rolled = page.waitForResponse(
      (r) => r.url().includes('/api/game/events/dice/roll') && r.ok(),
    )
    await dice.getByRole('button', { name: 'Roll dice', exact: true }).click()
    await rolled

    // Assert: the roll shows six dice, costs one roll and is stored.
    await expect(dice.getByRole('status')).toContainText(/Dice: (\d, ){5}\d\./)
    await expect(dice).toContainText(`Rolls left today: ${ROLLS_PER_DAY - 1}.`)
    expect(sql(`select dice_used from characters where name = :'name'`, { name })).toBe('1')
  } finally {
    await context.close()
  }
})
