// M4 social journey: a ninja sends a friend request from the Social window (the friend accepts it on
// Requests), views the friend's stats until the friend ticks the Inventory's Hide, PMs them from
// View Character and mails them from the Mail tab; the friend reads the mail and blocks the sender,
// whose next whisper and mail are refused.
// Only the levels are seeded (whispers and mail need level 10); the rest is UI.
import { expect, test, type Page } from '@playwright/test'
import { createTwoNinjas, dialog, openMenu, reloadGame, seedCharacter } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

const chat = (page: Page) => page.getByRole('region', { name: 'Chat' })

async function whisper(page: Page, to: string, text: string) {
  const input = chat(page).getByLabel('Message to world chat')
  await input.fill(`/${to} ${text}`)
  await chat(page).getByRole('button', { name: 'Send' }).click()
}

async function writeLetter(scope: ReturnType<typeof dialog>, subject: string, body: string) {
  await scope.getByLabel('Subject').fill(subject)
  await scope.getByLabel('Message').fill(body)
  await scope.getByRole('button', { name: 'Send' }).click()
}

test('friends whisper and mail, and a block refuses both', async ({ browser }) => {
  // Arrange: two level-25 ninjas online in their villages.
  const players = await createTwoNinjas(browser, ['Ami', 'Bo'])
  const [ami, bo] = players
  try {
    for (const { page, name } of players) {
      seedCharacter(name, 'level = 25')
      await reloadGame(page)
      await expect(chat(page).getByText('Online', { exact: true })).toBeVisible()
    }

    // Act: Ami sends Bo a friend request from the Social window.
    await openMenu(ami.page, 'Social')
    const social = dialog(ami.page, 'Social')
    await social.getByLabel('Player Name').fill(bo.name)
    await social.getByRole('button', { name: 'Send Friend Request' }).click()
    await expect(social.getByText('Friend request sent!')).toBeVisible()

    // Assert: Bo is on Ami's list, online; Bo sees the request and accepts it.
    const row = social.getByRole('list', { name: 'Friends' }).getByRole('listitem')
    await expect(row.filter({ hasText: bo.name })).toContainText('Online')
    await expect(chat(bo.page)).toContainText(`${ami.name} added you as a friend.`)
    await openMenu(bo.page, 'Social')
    const boSocial = dialog(bo.page, 'Social')
    await boSocial.getByRole('tab', { name: 'Requests' }).click()
    const request = boSocial.getByRole('list', { name: 'Friend requests' }).getByRole('listitem')
    await expect(request).toContainText(ami.name)
    await request.getByRole('button', { name: 'Accept' }).click()
    await boSocial.getByRole('tab', { name: 'Friends' }).click()
    await expect(
      boSocial.getByRole('list', { name: 'Friends' }).getByRole('listitem'),
    ).toContainText(ami.name)
    await boSocial.getByRole('button', { name: 'Close' }).click()

    // Act: Ami opens Bo's View Character from the name.
    // Assert: Bo's stats are there (level 25, an attack range) with Reborn's footer.
    await row.getByRole('button', { name: bo.name }).click()
    const sheet = dialog(ami.page, 'View Character')
    const stats = sheet.getByRole('region', { name: 'Stats' })
    await expect(stats.getByTitle(bo.name)).toBeVisible()
    await expect(stats.getByText(/^[1-9]\d* - [1-9]\d*$/)).toBeVisible()
    await expect(stats).toContainText('Hover over stats to get detailed information.')
    await sheet.getByRole('button', { name: 'Close' }).click()

    // Act: Bo ticks Hide in the Inventory.
    await openMenu(bo.page, 'Inventory')
    const hide = dialog(bo.page, 'Inventory').getByRole('checkbox', { name: 'Hide' })
    await hide.check()
    await expect(hide).toBeChecked()
    await dialog(bo.page, 'Inventory').getByRole('button', { name: 'Close' }).click()

    // Assert: Ami now sees every one of Bo's stats as 0, as Reborn shows a hidden ninja.
    await row.getByRole('button', { name: bo.name }).click()
    await expect(stats.getByTitle(bo.name)).toBeVisible()
    // Name, Level and the 15 combat values, all of them 0.
    await expect(stats.getByRole('definition').filter({ hasText: /^0$/ })).toHaveCount(15)

    // Act: Ami sends a PM from View Character (it prefills /Name).
    await sheet.getByRole('button', { name: 'PM' }).click()
    await expect(social).toBeHidden()
    const input = chat(ami.page).getByLabel('Message to world chat')
    await expect(input).toHaveValue(`/${bo.name} `)
    // The closing window hands focus back to the menu, so the caret goes to the end first.
    await input.press('End')
    await input.pressSequentially('Meet me in Demon City')
    await chat(ami.page).getByRole('button', { name: 'Send' }).click()

    // Assert: Bo reads it on the PM tab Reborn opens for Ami.
    await chat(bo.page).getByRole('tab', { name: ami.name }).click()
    await expect(chat(bo.page).getByRole('list', { name: `${ami.name} messages` })).toContainText(
      `From ${ami.name}: Meet me in Demon City`,
    )

    // Act: Ami writes a letter from the Mail tab.
    await openMenu(ami.page, 'Social')
    await social.getByRole('tab', { name: 'Mail' }).click()
    await social.getByRole('button', { name: 'Write Letter' }).click()
    await social.getByLabel('To').fill(bo.name)
    await writeLetter(social, 'Toll gate', 'Bring a weapon and full HP.')
    await expect(social.getByLabel('Subject')).toBeHidden()
    await social.getByRole('button', { name: 'Close' }).click()

    // Assert: Bo's minimap Mail button counts it and opens Social on the Mail tab; Bo reads it.
    // Two unread: the letter and the friend notice (Player Interaction).
    await bo.page.getByRole('button', { name: 'Mail (2 unread)' }).click()
    const mail = dialog(bo.page, 'Social')
    await expect(mail.getByRole('tab', { name: 'Mail' })).toHaveAttribute('aria-selected', 'true')
    await mail
      .getByRole('list', { name: 'Player Mail list' })
      .getByRole('button', { name: 'Toll gate' })
      .click()
    const read = mail.getByRole('article', { name: 'Mail' })
    await expect(read).toContainText(`From: ${ami.name}`)
    await expect(read).toContainText('Bring a weapon and full HP.')

    // Act: Bo blocks Ami from the letter (after the confirmation).
    bo.page.once('dialog', (confirm) => void confirm.accept())
    await read.getByRole('button', { name: 'Block' }).click()
    await expect(read).toContainText(`${ami.name} is blocked.`)

    // Assert: Ami's next whisper and letter are refused.
    await whisper(ami.page, bo.name, 'Still there?')
    await expect(chat(ami.page)).toContainText('You cannot whisper to this player.')
    // Ami has unread mail too: Bo's add-back notice.
    await ami.page.getByRole('button', { name: /^Mail \(\d+ unread\)$/ }).click()
    const amiMail = dialog(ami.page, 'Social')
    await amiMail.getByRole('button', { name: 'Write Letter' }).click()
    await amiMail.getByLabel('To').fill(bo.name)
    await writeLetter(amiMail, 'Sorry', 'Can we talk?')
    await expect(amiMail).toContainText('You cannot send mail to this ninja.')
    // Bo's chat is still on Ami's PM tab: the refused whisper never arrived.
    await expect(
      chat(bo.page).getByRole('list', { name: `${ami.name} messages` }),
    ).not.toContainText('Still there?')
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
