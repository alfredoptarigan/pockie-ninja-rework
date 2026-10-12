// Shared steps of the game journeys, and DB seeding for journeys a fresh ninja cannot reach
// (currency, levels, items, a cleared toll gate). Seeding runs psql against the e2e server's
// database: DATABASE_URL, else the one in the repository's .env.
import { expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const PASSWORD = 'e2e-journey-password'

export const dialog = (page: Page, name: string) =>
  page.getByRole('dialog', { name, exact: true })

export const location = (page: Page) => page.getByRole('region', { name: 'Location' })

export async function expectScene(page: Page, name: string) {
  await expect(location(page).getByRole('heading', { name })).toBeVisible({ timeout: 15_000 })
}

/** Buttons of the scene's keyboard action list are hidden until focused. */
export async function sceneAction(page: Page, name: string) {
  const button = page.getByRole('region', { name: 'Scene actions' }).getByRole('button', { name })
  await button.focus()
  return button
}

/** Talks to a building NPC and picks its window option (Shop, Blacksmith, Enter...). */
export async function openNpcWindow(page: Page, npc: string, option: string) {
  await (await sceneAction(page, npc)).click()
  await dialog(page, npc).getByRole('button', { name: option, exact: true }).click()
}

/** Creates a fresh Fire Village ninja for an independent journey and returns its name. */
export async function createNinja(page: Page, role: string) {
  const id = `${role}_${Date.now().toString(36).slice(-5)}`
  await page.goto('/register')
  await page.getByLabel('Username').fill(id)
  await page.getByLabel('Email').fill(`${id}@example.test`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/play/create')
  await page.getByLabel('Character Name').fill(id)
  for (const choice of ['Ggio Vega', 'Fire Village']) {
    await page
      .getByRole('radio', { name: new RegExp(`^${choice}`) })
      .locator('..')
      .click()
  }
  await page.getByRole('button', { name: 'Enter Game' }).click()
  await expect(
    page.getByRole('main', { name: 'Game' }).getByRole('heading', { name: id }),
  ).toBeVisible({ timeout: 15_000 })
  return id
}

// Fields stay blocked on the World Map until visited (decision 7); Leave walks out of the
// village to its ToScene field.
export async function leaveVillage(page: Page, field = 'Smelting Mountains') {
  await location(page).getByRole('button', { name: 'Leave', exact: true }).click()
  await expectScene(page, field)
}

/** The HUD shows `amount` of a currency ('Stone', 'Gold' or 'Coupons'). */
export async function expectCurrency(
  page: Page,
  name: 'Stone' | 'Gold' | 'Coupons',
  amount: number,
) {
  await expect(
    page
      .getByLabel('Currencies')
      .locator('div', { has: page.locator('dt', { hasText: name }) })
      .locator('dd'),
  ).toHaveText(amount.toLocaleString('en-US'))
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const file = new URL('../.env', import.meta.url)
  const url = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).DATABASE_URL : undefined
  if (!url) throw new Error('Seeding needs DATABASE_URL (env or .env)')
  return url
}

/**
 * Runs SQL with psql variables (`:'name'` is a quoted literal), so values are never spliced into
 * the query text. Returns the unaligned output.
 */
export function sql(query: string, vars: Record<string, string | number> = {}) {
  const args = [databaseUrl(), '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1']
  for (const [key, value] of Object.entries(vars)) args.push('-v', `${key}=${value}`)
  return execFileSync('psql', args, { input: query, encoding: 'utf8' }).trim()
}

/** Updates the ninja's character row; `set` is a SQL assignment list that may use `:'var'`. */
export function seedCharacter(
  name: string,
  set: string,
  vars: Record<string, string | number> = {},
) {
  sql(`update characters set ${set} where name = :'name';`, { ...vars, name })
}

/** Puts an item in the ninja's bag (or worn, with `equipped_slot`); `columns` are SQL names. */
export function giveItem(
  name: string,
  itemId: string,
  columns: Record<string, string | number | boolean> = {},
) {
  const extra = Object.keys(columns)
  sql(
    `insert into inventory_items (character_id, item_id${extra.map((key) => `, ${key}`).join('')})
     select id, :'item'${extra.map((key) => `, :'${key}'`).join('')}
     from characters where name = :'name';`,
    {
      ...Object.fromEntries(Object.entries(columns).map(([key, value]) => [key, String(value)])),
      item: itemId,
      name,
    },
  )
}
