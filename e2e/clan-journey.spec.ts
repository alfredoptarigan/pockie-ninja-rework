// Clan journey: a level-30 ninja founds a clan from the Clan Browser (bottom-bar Clan icon), a
// second ninja finds it by name and applies, the founder accepts on Applications, and both talk
// on the Clan chat channel. Only the levels are seeded; the rest is UI.
import { expect, test, type Page } from '@playwright/test'
import { createTwoNinjas, dialog, openMenu, reloadGame, seedCharacter } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })

test('founds a clan, accepts an applicant and chats on the clan channel', async ({ browser }) => {
  // Arrange: two level-30 ninjas online in their villages.
  const players = await createTwoNinjas(browser, ['Kage', 'Genin'])
  const [kage, genin] = players
  const clanName = `Clan${Date.now().toString(36).slice(-5)}`
  try {
    for (const { page, name } of players) {
      seedCharacter(name, 'level = 30')
      await reloadGame(page)
      await expect(chat(page).getByText('Online', { exact: true })).toBeVisible()
    }

    // Act: the founder creates the clan from the Clan Browser (the first one is free).
    await openMenu(kage.page, 'Clan')
    await dialog(kage.page, 'Clan Browser').getByRole('button', { name: 'Create' }).click()
    const create = dialog(kage.page, 'Create Clan')
    await expect(create).toContainText('Free (first clan)')
    await create.getByLabel('Enter Clan Name').fill(clanName)
    await create.getByRole('button', { name: 'Create' }).click()

    // Assert: the Clan window opens with the founder as Leader.
    const clan = dialog(kage.page, 'Clan')
    await expect(clan.getByRole('row', { name: kage.name })).toContainText('Leader')

    // Act: the second ninja searches the clan by name and applies.
    await openMenu(genin.page, 'Clan')
    const browserWindow = dialog(genin.page, 'Clan Browser')
    await browserWindow.getByLabel('Search').fill(clanName)
    await browserWindow.getByRole('button', { name: 'Find' }).click()
    const row = browserWindow.getByRole('row', { name: clanName })
    await expect(row).toContainText('1/15')
    await row.getByRole('button', { name: 'Apply' }).click()
    await expect(row.getByRole('button', { name: 'Applied' })).toBeDisabled()

    // Act: the founder accepts on Applications.
    await clan.getByRole('button', { name: 'Applications' }).click()
    const applications = dialog(kage.page, 'Applications')
    await applications
      .getByRole('row', { name: genin.name })
      .getByRole('button', { name: 'Accept' })
      .click()
    await expect(applications.getByText('No applications')).toBeVisible()
    await applications.getByRole('button', { name: 'Close' }).click()

    // Assert: both see the new member; the applicant is told in chat.
    await expect(clan.getByRole('row', { name: genin.name })).toContainText('Member')
    await expect(chat(genin.page)).toContainText(`You joined the clan ${clanName}.`)
    // The open Clan Browser turns into the Clan window once the clan notice arrives.
    const geninClan = dialog(genin.page, 'Clan')
    await expect(geninClan.getByRole('row', { name: kage.name })).toContainText('Leader')
    await geninClan.getByRole('button', { name: 'Close' }).click()

    // Act: the applicant writes on the Clan channel.
    await chat(genin.page).getByRole('tab', { name: 'Clan' }).click()
    const input = chat(genin.page).getByLabel('Message to clan chat')
    await input.fill('Reporting for duty')
    await chat(genin.page).getByRole('button', { name: 'Send' }).click()

    // Assert: the founder reads it on the Clan tab.
    await clan.getByRole('button', { name: 'Close' }).click()
    await chat(kage.page).getByRole('tab', { name: 'Clan' }).click()
    await expect(chat(kage.page).getByRole('list', { name: 'Clan messages' })).toContainText(
      `${genin.name}: Reporting for duty`,
    )
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
