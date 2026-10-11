import { expect, test, type Page } from '@playwright/test'

// A fresh account per run keeps the journey independent of existing data.
const suffix = Date.now().toString(36).slice(-8)
const account = {
  username: `E2e_${suffix}`,
  email: `e2e_${suffix}@example.test`,
  password: 'e2e-journey-password',
}

async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Claim your ninja name' })).toBeVisible()
}

test('register, log in, see the account, open play and log out', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pockie Ninja')

  // Register
  await page.getByRole('link', { name: 'Create account' }).first().click()
  await expect(page).toHaveURL('/register')
  await page.getByLabel('Username').fill(account.username)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/play')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(account.username)
  await logOut(page)

  // Log in with the email in different casing, remembered for 30 days
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(account.email.toUpperCase())
  await page.getByLabel('Password').fill(account.password)
  await page.getByLabel('Remember me for 30 days').check()
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/play')

  const session = (await page.context().cookies()).find((cookie) => cookie.name === 'pn_session')
  expect(session?.httpOnly).toBe(true)
  expect(session?.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 60 * 60)

  // Account panel on the landing page
  await page.goto('/')
  await expect(page.getByText('Signed in as')).toBeVisible()
  await expect(page.getByRole('heading', { name: account.username })).toBeVisible()

  // Play, then log out; play is protected afterwards
  await page.getByRole('link', { name: 'Play', exact: true }).first().click()
  await expect(page).toHaveURL('/play')
  await logOut(page)
  await page.goto('/play')
  await expect(page).toHaveURL('/login')
})

test('shows a generic error for a wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('Nobody_here')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong username, email or password.')
})
