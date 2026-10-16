// Skill showcase: the QA ninja's dev page plays every skill with Reborn art in one replay (each
// ninjutsu effect and each outfit ultimate, cast once) and no animation asset fails to load.
// Needs the QA account in the server's database (`pnpm db:seed-qa`) and a dev client (the page is
// dev-only). Long: a few seconds per skill. The recorded video is the replay to watch:
//   E2E_REUSE=1 pnpm e2e e2e/skill-showcase.spec.ts
//   then open test-results/skill-showcase-*/video.webm
import { expect, test } from '@playwright/test'

const QA = { login: 'qapockieninja', password: 'password123' }

test.use({ viewport: { width: 1440, height: 900 }, video: 'on' })
test.setTimeout(60 * 60_000)

test('every skill animation plays for the QA ninja', async ({ page }) => {
  // Arrange: watch every animation request, sign in as QA and open the showcase.
  const broken: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && response.status() >= 400) {
      broken.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (request.url().includes('/assets/')) broken.push(`failed ${request.url()}`)
  })
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(QA.login)
  await page.getByLabel('Password').fill(QA.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('**/play')
  await page.goto('/play/skill-showcase')
  await expect(page.getByRole('heading', { name: 'Skill showcase' })).toBeVisible({
    timeout: 15_000,
  })

  // Act: play everything at double speed until the replay ends by itself.
  await page.getByRole('button', { name: 'Play everything' }).click()
  const replay = page.getByRole('region', { name: 'Battle replay' })
  await replay.getByRole('button', { name: 'Speed x2' }).click()
  await expect(page.getByRole('status')).toHaveText('Finished: Everything', {
    timeout: 55 * 60_000,
  })

  // Assert: no effect, ultimate or motion asset was missing.
  await test.info().attach('broken-assets.txt', { body: broken.join('\n') || 'none' })
  expect(broken).toEqual([])
})
