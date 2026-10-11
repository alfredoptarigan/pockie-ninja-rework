import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
]) {
  test(`landing page renders seeded content without horizontal scroll at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')

    await expect(page.getByText(/Server online/)).toBeVisible()
    await expect(page.getByRole('img', { name: 'Uzumaki Naruto' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome back, ninja' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Chapter 1: The Five Seals' })).toBeAttached()
    await expect(page.getByText('What is Pockie Ninja Remastered?')).toBeAttached()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })
}

test('news tabs filter by kind', async ({ page }) => {
  await page.goto('/#news')
  await page.getByRole('tab', { name: 'Events' }).click()
  await expect(page.getByRole('heading', { name: 'Event preview: The Sushi Feast' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome back, ninja' })).toBeHidden()
})
