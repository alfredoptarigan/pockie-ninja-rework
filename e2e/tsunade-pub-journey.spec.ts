// Tsunade Pub journey: a ninja opens the pub from the village icon, spends a free spin (quick),
// sees the prize land and collects it into the bag, then buys a spin for 10 Gold.
import { expect, test } from '@playwright/test'
import { createSeededNinja, dialog, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const pubValue = (name: string, column: string) =>
  sql(
    `select ${column} from tsunade_pub p join characters c on c.id = p.character_id
     where c.name = :'name';`,
    { name },
  )

test('a ninja spins the Tsunade Pub roulette, collects the prize and buys a spin', async ({
  browser,
}) => {
  // Arrange: 100 Gold for the bought spin.
  const { context, page, name } = await createSeededNinja(browser, 'Pub')
  try {
    seedCharacter(name, 'gold = 100')
    await reloadGame(page)

    // Act: open the pub from the top-right icon.
    await page.getByRole('button', { name: 'Tsunade Pub', exact: true }).click()
    const pub = dialog(page, 'Tsunade Pub')
    const wheel = pub.getByRole('list', { name: 'Prize roulette' })
    await expect(wheel.getByRole('listitem')).toHaveCount(16)
    await expect(pub.getByText('FREE').locator('xpath=following-sibling::dd')).toHaveText('5')

    // Act: a quick free spin.
    await pub.getByRole('checkbox', { name: 'Quick Spin' }).check()
    await pub.getByRole('button', { name: 'Spin', exact: true }).click()

    // Assert: the prize lands in the centre, one free spin is gone and the prize is unclaimed.
    await expect(pub.getByRole('status', { name: /^Prize: (?!none yet)/ })).toBeVisible({
      timeout: 15_000,
    })
    await expect(pub.getByText('FREE').locator('xpath=following-sibling::dd')).toHaveText('4')
    await expect(pub.getByText(/^Unclaimed Prizes \([12]\)$/)).toBeVisible()
    await expect(pub.getByRole('button', { name: 'Spin', exact: true })).toBeEnabled()
    expect(pubValue(name, 'free_used')).toBe('1')

    // Act: collect everything into the bag.
    await pub.getByRole('button', { name: 'Collect All' }).click()

    // Assert: nothing left unclaimed, in the window and the database.
    await expect(pub.getByText('Unclaimed Prizes (0)')).toBeVisible()
    expect(pubValue(name, 'jsonb_array_length(p.won)')).toBe('0')

    // Act: buy one spin.
    await pub.getByRole('button', { name: 'Buy 10g' }).click()

    // Assert: one paid spin and 10 Gold spent.
    await expect(pub.getByText('PAID').locator('xpath=following-sibling::dd')).toHaveText('1')
    expect(pubValue(name, 'paid_attempts')).toBe('1')
    expect(sql(`select gold from characters where name = :'name';`, { name })).toBe('90')
  } finally {
    await context.close()
  }
})
