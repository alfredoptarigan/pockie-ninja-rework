// Shared steps of the game journeys, and DB seeding for journeys a fresh ninja cannot reach
// (currency, levels, items, a cleared toll gate). Seeding runs psql against the e2e server's
// database: DATABASE_URL, else the one in the repository's .env.
import { expect, test, type Browser, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { hashPassword } from '../server/src/modules/auth/password'

const PASSWORD = 'e2e-journey-password'

export const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true })

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
  await createCharacter(page, id)
  return id
}

/** Completes character creation for a signed-in account without a ninja. */
async function createCharacter(page: Page, id: string) {
  await expect(page).toHaveURL('/play/create', { timeout: 30_000 })
  await page.getByLabel('Character Name').fill(id)
  for (const choice of ['Ggio Vega', 'Fire Village']) {
    await page
      .getByRole('radio', { name: new RegExp(`^${choice}`) })
      .locator('..')
      .click()
  }
  const heading = page.getByRole('main', { name: 'Game' }).getByRole('heading', { name: id })
  const limited = page.getByRole('alert').filter({ hasText: 'Too many attempts' })
  // A full run creates more ninjas than the server's 10 a minute per IP
  // (RATE_LIMITS.createCharacter): when limited, wait for the window and try again.
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.getByRole('button', { name: 'Enter Game' }).click()
    await expect(heading.or(limited)).toBeVisible({ timeout: 15_000 })
    if (await heading.isVisible()) return
    test.info().setTimeout(test.info().timeout + 5_000)
    await page.waitForTimeout(5_000)
  }
  await expect(heading).toBeVisible()
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

/** How many of an item the ninja holds (bag and worn), as psql prints it. */
export const heldCount = (name: string, itemId: string) =>
  sql(
    `select coalesce(sum(i.count), 0) from inventory_items i
     join characters c on c.id = i.character_id where c.name = :'name' and i.item_id = :'item'`,
    { name, item: itemId },
  )

// Seeded fixtures insert the account and its session, so the suite stays within the auth
// endpoints' per-IP limits (10 registrations an hour, 10 logins in 15 minutes); the auth journey
// covers both forms. Character creation still runs through the real UI.
let passwordHash: Promise<string> | undefined

/** A ninja in its own browser context (own cookies and socket), signed in by a seeded session. */
export async function createSeededNinja(browser: Browser, role: string) {
  const name = `${role}_${Date.now().toString(36).slice(-5)}`
  const token = randomBytes(32).toString('base64url')
  sql(
    `with account as (
       insert into users (username, email, password_hash) values (:'name', :'email', :'hash')
       returning id)
     insert into sessions (token_hash, user_id, expires_at)
     select :'token', id, now() + interval '1 day' from account;`,
    {
      name,
      email: `${name.toLowerCase()}@example.test`,
      hash: await (passwordHash ??= hashPassword(PASSWORD)),
      // sessions.ts hashToken
      token: createHash('sha256').update(token).digest('hex'),
    },
  )
  const context = await browser.newContext()
  try {
    const url = test.info().project.use.baseURL!
    await context.addCookies([{ name: 'pn_session', value: token, url }])
    const page = await context.newPage()
    await page.goto('/play')
    await createCharacter(page, name)
    return { context, page, name }
  } catch (error) {
    await context.close()
    throw error
  }
}

/** Two seeded ninjas; the first game load and character creation run one after the other. */
export async function createTwoNinjas(browser: Browser, roles: [string, string]) {
  const first = await createSeededNinja(browser, roles[0])
  try {
    return [first, await createSeededNinja(browser, roles[1])] as const
  } catch (error) {
    await first.context.close()
    throw error
  }
}

/** Moves every ninja to `sceneId` in the DB, then reloads each page so it reconnects there. */
export async function meetInScene(players: { page: Page; name: string }[], sceneId: number) {
  for (const { name } of players) seedCharacter(name, 'scene_id = :scene', { scene: sceneId })
  for (const { page } of players) {
    await page.reload()
    await expect(location(page)).toBeVisible()
  }
}

// A level-71 weapon (Equip_Gloves99, Ggio Vega's kind): seeded on, it wins toll gate and arena
// fights a journey ninja would otherwise lose.
const STRONG_WEAPON = 'i299902'

/** Seeds `set` (SQL assignments), wears the strong weapon, then fills HP and MP and reloads. */
export async function armNinja(page: Page, name: string, set: string) {
  seedCharacter(name, set)
  giveItem(name, STRONG_WEAPON, { equipped_slot: 'Weapon' })
  const { character } = await (await page.request.get('/api/game/character')).json()
  seedCharacter(name, 'hp = :hp, mp = :mp', { hp: character.maxHp, mp: character.maxMp })
  await reloadGame(page)
}

/** Reloads the game after seeding and waits for the HUD (a cold reload can take seconds). */
export async function reloadGame(page: Page) {
  await page.reload()
  await expect(location(page)).toBeVisible({ timeout: 15_000 })
}

/** Opens a window from the bottom-right menu (Bag, Friends, Market...). */
export async function openMenu(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name }).click()
}

/** Opens a window from the top strip's Events menu (Card Room, Pet Tracing, Kennel Shop...). */
export async function openEvent(page: Page, label: string) {
  await page.getByRole('button', { name: 'Events', exact: true }).click()
  await page
    .getByRole('list', { name: 'Events' })
    .getByRole('button', { name: label, exact: true })
    .click()
}

/** Skips the battle replay that a fight opens. */
export async function skipReplay(page: Page) {
  await page
    .getByRole('region', { name: 'Battle replay' })
    .getByRole('button', { name: 'Skip' })
    .click()
}

/** Opens the chat box's player list and returns it. */
export async function openPlayerList(page: Page) {
  await page.getByRole('button', { name: /^Players \(\d+\)$/ }).click()
  return page.getByRole('region', { name: /^Players here/ })
}
