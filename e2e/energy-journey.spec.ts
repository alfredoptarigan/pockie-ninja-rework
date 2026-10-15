// Energy (VP) and Battle Power journeys: a chain attack pays its energy, the daily restore shows
// after a seeded day change, Energy Refill fills up for Gold, and Battle Power rises with gear.
import { expect, test, type Page } from '@playwright/test'
import {
  armNinja,
  createSeededNinja,
  dialog,
  expectCurrency,
  expectScene,
  giveItem,
  openMenu,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(150_000)

const FIELD = 2101
const MONSTER = 'Sunflower'
const FISTS = 'Newbie Swiping Fists'
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const energy = (current: number, offset = 0, refills = 0) =>
  `energy = '${JSON.stringify({ current, day: day(offset), refills, items: {} })}'::jsonb`

const card = (page: Page) => page.getByRole('region', { name: 'Character' })
const vp = (page: Page) => card(page).getByRole('meter', { name: 'VP' })
const storedEnergy = (name: string) =>
  sql(`select energy->>'current' from characters where name = :'name'`, { name })

test('a chain attack pays 1 energy per monster and Energy Refill fills up for Gold', async ({
  browser,
}) => {
  // Arrange: a level-30 ninja in the Smelting Mountains with 5 energy and 100 Gold.
  const { context, page, name } = await createSeededNinja(browser, 'Vp')
  try {
    seedCharacter(name, `scene_id = :scene, gold = 100, ${energy(5)}`, { scene: FIELD })
    await armNinja(page, name, 'level = 30')
    await expectScene(page, 'Smelting Mountains')
    await expect(vp(page)).toHaveText('5/200')

    // Act: Chain Attack on a Sunflower; MAX stops at the 5 energy; chain 2.
    await page.getByTestId('monster-card').filter({ hasText: MONSTER }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Chain Attack' }).click()
    const config = dialog(page, 'Chain Attack')
    await config.getByRole('button', { name: 'MAX' }).click()
    await expect(config).toContainText('5 Monsters')
    await config.getByLabel('Monsters to chain').selectOption('2')
    await config.getByRole('button', { name: 'Begin' }).click()
    const progress = dialog(page, 'Chain Attack Progress')
    await expect(progress).toContainText('Fighting 2 Monsters')
    await progress.getByRole('button', { name: 'Close' }).last().click()

    // Assert: 2 energy paid at Begin.
    await expect(vp(page)).toHaveText('3/200')
    expect(storedEnergy(name)).toBe('3')

    // Act: the VP refill icon opens Energy Refill; refill for 35 Gold.
    await card(page).getByRole('button', { name: 'Energy refill' }).click()
    const refill = dialog(page, 'Energy Refill')
    await expect(refill).toContainText('Energy to restore:+197')
    await expect(refill).toContainText('Next refill cost:70 Gold')
    await refill.getByRole('button', { name: 'Refill for 35 Gold' }).click()

    // Assert: full energy, 35 Gold spent, one refill today.
    await expect(page.getByText('Energy refilled! Restored 197 energy.')).toBeVisible()
    await expect(refill).toHaveCount(0)
    await expect(vp(page)).toHaveText('200/200')
    await expectCurrency(page, 'Gold', 65)
    expect(sql(`select energy->>'refills' from characters where name = :'name'`, { name })).toBe(
      '1',
    )
  } finally {
    await context.close()
  }
})

test('a new day restores 100 energy and resets the refill price', async ({ browser }) => {
  // Arrange: 10 energy and 2 refills, stored yesterday.
  const { context, page, name } = await createSeededNinja(browser, 'Dawn')
  try {
    seedCharacter(name, energy(10, -1, 2))

    // Act: load the game today.
    await reloadGame(page)

    // Assert: +100 energy, refills back to 0 (35 Gold again).
    await expect(vp(page)).toHaveText('110/200')
    await card(page).getByRole('button', { name: 'Energy refill' }).click()
    const refill = dialog(page, 'Energy Refill')
    await expect(refill).toContainText('Refills today:0')
    await expect(refill).toContainText('Current cost:35 Gold')
    await expect(refill.getByRole('button', { name: 'Not enough gold' })).toBeDisabled()
  } finally {
    await context.close()
  }
})

test('Battle Power shows on the portrait and rises when a weapon is equipped', async ({
  browser,
}) => {
  // Arrange: a fresh ninja with the newbie fists in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Power')
  try {
    giveItem(name, 'i270100')
    await reloadGame(page)
    const power = card(page).getByLabel(/^Battle Power [\d,]+$/)
    await expect(power).toBeVisible()
    const before = Number((await power.textContent())!.replace(/,/g, ''))

    // Act: equip the fists from the bag.
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')
    await bag.getByRole('button', { name: FISTS, exact: true }).click({ button: 'right' })
    await bag.getByRole('menuitem', { name: `Equip ${FISTS}` }).click()

    // Assert: a higher Battle Power, flashed as +N.
    await expect(card(page).getByText(/^\+\d+$/)).toBeVisible()
    await expect
      .poll(async () => Number((await power.textContent())!.replace(/,/g, '')))
      .toBeGreaterThan(before)
  } finally {
    await context.close()
  }
})
