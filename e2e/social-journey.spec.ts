// M4 social journey: a ninja adds another as a friend, whispers and mails them from the Friends
// window; the friend reads the mail and blocks the sender, whose next whisper and mail are refused.
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

    // Act: Ami adds Bo by name.
    await openMenu(ami.page, 'Friends')
    const friends = dialog(ami.page, 'Friends')
    await friends.getByLabel('Ninja name').fill(bo.name)
    await friends.getByRole('button', { name: 'Add Friend' }).click()

    // Assert: Bo is on Ami's list, online; Bo hears of it and adds Ami back.
    const row = friends.getByRole('list', { name: 'Friends' }).getByRole('listitem')
    await expect(row.filter({ hasText: bo.name })).toBeVisible()
    await expect(row.getByRole('img', { name: 'Online' })).toBeVisible()
    await expect(chat(bo.page)).toContainText(`${ami.name} added you as a friend.`)
    await openMenu(bo.page, 'Friends')
    const boFriends = dialog(bo.page, 'Friends')
    await expect(boFriends).toContainText(`${ami.name} (Level 25) added you as a friend.`)
    await boFriends.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(
      boFriends.getByRole('list', { name: 'Friends' }).getByRole('listitem'),
    ).toContainText(ami.name)
    await boFriends.getByRole('button', { name: 'Close' }).click()

    // Act: Ami whispers from the friend row (it prefills /Name in the chat box).
    await row.getByRole('button', { name: 'Whisper' }).click()
    await expect(friends).toBeHidden()
    const input = chat(ami.page).getByLabel('Message to world chat')
    await expect(input).toHaveValue(`/${bo.name} `)
    // The closing window hands focus back to the menu, so the caret goes to the end first.
    await input.press('End')
    await input.pressSequentially('Meet me in Demon City')
    await chat(ami.page).getByRole('button', { name: 'Send' }).click()

    // Assert: Bo reads it on the Whisper tab.
    await chat(bo.page).getByRole('tab', { name: 'Whisper' }).click()
    await expect(chat(bo.page).getByRole('list', { name: 'Whisper messages' })).toContainText(
      `From ${ami.name}: Meet me in Demon City`,
    )

    // Act: Ami writes a letter from the friend row.
    await openMenu(ami.page, 'Friends')
    await row.getByRole('button', { name: 'Mail' }).click()
    const letter = dialog(ami.page, 'Write Letter')
    await expect(letter.getByLabel('To')).toHaveValue(bo.name)
    await writeLetter(letter, 'Toll gate', 'Bring a weapon and full HP.')
    await expect(letter).toBeHidden()
    await friends.getByRole('button', { name: 'Close' }).click()

    // Assert: Bo's minimap Mail button counts it; Bo reads it.
    // Two unread: the letter and the friend notice (Player Interaction).
    await bo.page.getByRole('button', { name: 'Mail (2 unread)' }).click()
    const mail = dialog(bo.page, 'Mail')
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
    const amiMail = dialog(ami.page, 'Mail')
    await amiMail.getByRole('button', { name: 'Write Letter' }).click()
    await amiMail.getByLabel('To').fill(bo.name)
    await writeLetter(amiMail, 'Sorry', 'Can we talk?')
    await expect(amiMail).toContainText('You cannot send mail to this ninja.')
    // Bo's chat is still on the Whisper tab: the refused whisper never arrived.
    await expect(chat(bo.page).getByRole('list', { name: 'Whisper messages' })).not.toContainText(
      'Still there?',
    )
  } finally {
    await Promise.all(players.map(({ context }) => context.close()))
  }
})
