// The M2 journey: a new ninja plays the Fire Village tutorial (90000-90004) through the HUD up to
// the first fight in Smelting Mountains, and visits every window on the way. Screenshots for the
// visual check land in test-results/visual/ (gitignored).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { createNinja, dialog, leaveVillage, sceneAction } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
// Character creation, five quests, two scenes and a battle replay.
test.setTimeout(60_000)

const suffix = Date.now().toString(36).slice(-6)
const account = {
  username: `Hero_${suffix}`,
  email: `hero_${suffix}@example.test`,
  password: 'e2e-journey-password',
}
const ninja = `Ninja_${suffix}`

// English names from client/src/i18n/en.json.
const ELDER = 'Fire Village Elder in the Hall'
const SCOUT = 'Genin'
const FIELD = 'Smelting Mountains'
const MONSTER = 'Sunflower'
const PACK = 'Lv.1 Newbie Pack'
const FISTS = 'Newbie Swiping Fists'
// lg_Task_90000-90004.
const QUEST = {
  elder: 'Visit the Village Elder',
  pack: 'Newbie Pack',
  weapon: 'Weapon Equipment',
  panel: 'Quest Panel',
  combat: 'Combat Training [I]',
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/visual/${name}.png` })

const questNavigation = (page: Page) => page.getByRole('region', { name: 'Quest Navigation' })

/** Presses Go on a Quest Navigation entry of the given tab. */
async function go(page: Page, tab: 'Accepted' | 'Available', quest: string) {
  const nav = questNavigation(page)
  await nav.getByRole('tab', { name: tab }).click()
  await nav.getByRole('button', { name: `Go: ${quest}`, exact: true }).click()
}

const expMeter = (page: Page) =>
  page.getByRole('region', { name: 'Experience' }).getByRole('meter', { name: 'EXP' })

async function expectLevel(page: Page, level: number) {
  await expect(page.getByRole('region', { name: 'Experience' })).toContainText(`Level: ${level}`)
}

async function expectExp(page: Page, exp: number) {
  await expect(expMeter(page)).toHaveAttribute('aria-valuenow', String(exp))
}

/** Every <img> under `scope` has loaded real pixels (no broken or missing art). */
async function expectImagesLoaded(scope: Locator) {
  const images = scope.locator('img')
  await expect(images.first()).toBeVisible()
  await expect
    .poll(() =>
      images.evaluateAll((list) =>
        list.every(
          (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)
}

/** Talks to the NPC through Go on an available quest, accepts it and ends the conversation. */
async function acceptFrom(page: Page, npc: string, quest: string) {
  await go(page, 'Available', quest)
  const talk = dialog(page, npc)
  await talk.getByRole('button', { name: /^Quests/ }).click()
  await talk
    .getByRole('article')
    .filter({ hasText: quest })
    .getByRole('button', { name: 'Accept quest' })
    .click()
  await expect(talk.getByRole('status')).toContainText(`Quest accepted: ${quest}.`)
  await talk.getByRole('button', { name: 'Close' }).click()
  await expect(talk).toBeHidden()
}

test('another account receives world chat and sees the sender only in the shared scene', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000)
  // Arrange: two authenticated accounts have separate cookie jars.
  const sender = await createNinja(page, 'Sender')
  const observerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  try {
    const observer = await observerContext.newPage()
    const receiver = await createNinja(observer, 'Reader')
    const senderChat = page.getByRole('region', { name: 'Chat' })
    const receiverChat = observer.getByRole('region', { name: 'Chat' })
    await expect(senderChat.getByText('Online', { exact: true })).toBeVisible()
    await expect(receiverChat.getByText('Online', { exact: true })).toBeVisible()

    // Act: send through the world channel and open the second account's player list.
    const message = `Greetings from ${sender}`
    await senderChat.getByLabel('Message to world chat').fill(message)
    await senderChat.getByRole('button', { name: 'Send' }).click()
    await receiverChat.getByRole('button', { name: /^Players \(/ }).click()

    // Assert: the remote account receives the broadcast and the scene membership.
    await expect(receiverChat.getByRole('list', { name: 'World messages' })).toContainText(
      `${sender}: ${message}`,
    )
    const players = observer.getByRole('region', { name: /^Players here/ })
    await expect(players).toContainText(sender)
    await expect(players).toContainText(receiver)
    await leaveVillage(page)
    await expect(players).not.toContainText(sender)
    await expect(players).toContainText(receiver)
  } finally {
    await observerContext.close()
  }
})

test('a fresh ninja searches an exploration spot and sees the result cards', async ({ page }) => {
  test.setTimeout(60_000)
  // Arrange: a new character has the original seven daily searches and no cooldown.
  await createNinja(page, 'Search')
  await leaveVillage(page)
  await page
    .getByRole('region', { name: 'Exploration' })
    .getByRole('button', { name: 'Explore' })
    .click()
  const explore = dialog(page, 'Exploration')
  await expect(explore).toContainText('7 / 7')

  // Act: confirm the first free spot; a randomly drawn fight may open a replay.
  await explore
    .getByRole('button', { name: /^Explore / })
    .first()
    .click()
  await dialog(page, 'Start Exploring?')
    .getByRole('button', { name: 'Explore', exact: true })
    .click()
  // Five face-down cards: pick the first without paying to peek.
  await dialog(page, 'Choose an Exploration Card')
    .getByRole('button', { name: 'Pick card 1' })
    .click()
  const result = dialog(page, 'Exploration Result')
  const skip = page
    .getByRole('region', { name: 'Battle replay' })
    .getByRole('button', { name: 'Skip' })
  await expect(result.or(skip)).toBeVisible()
  if (await skip.isVisible()) await skip.click()

  // Assert: one selected card plus four alternatives, and one search consumed.
  await expect(result).toBeVisible()
  await expect(
    result.getByRole('list', { name: 'The other cards held' }).getByRole('listitem'),
  ).toHaveCount(4)
  await result.getByRole('button', { name: 'Back to Exploration' }).click()
  await expect(explore).toContainText('6 / 7')
  await expect(explore.getByRole('button', { name: /^Explore / }).first()).toBeDisabled()
})

test('a ninja defeated in a field fight returns to the village with one HP', async ({ page }) => {
  test.setTimeout(60_000)
  // Arrange: an unarmed level-one ninja deals 0 damage (original fists rule), so it cannot win.
  await createNinja(page, 'Revive')
  await leaveVillage(page)

  // Act: lose a real server-simulated fight and finish its replay.
  await (await sceneAction(page, `Fight ${MONSTER}`)).click()
  await page.getByRole('button', { name: 'Fight anyway', exact: true }).click()
  await page
    .getByRole('region', { name: 'Battle replay' })
    .getByRole('button', { name: 'Skip' })
    .click()
  const defeat = dialog(page, 'Defeat')
  await expect(defeat).toContainText(`${MONSTER} defeated you.`)
  await defeat.getByRole('button', { name: 'Close' }).click()
  const revive = dialog(page, 'Defeated')
  await expect(revive.getByRole('button', { name: 'Revive here', exact: true })).toBeDisabled()
  await revive.getByRole('button', { name: 'Return to village', exact: true }).click()

  // Assert: the home revive from relive.ini restores one HP and allows travel again.
  await expect(revive).toBeHidden()
  await expect(
    page.getByRole('region', { name: 'Location' }).getByRole('heading', { name: 'Fire Village' }),
  ).toBeVisible()
  await expect(page.getByRole('meter', { name: 'HP', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '1',
  )
  await leaveVillage(page)
})

test('a new ninja plays the Fire Village tutorial to the first fight and levels up', async ({
  page,
}) => {
  // Register and create the ninja in the Fire Village.
  await page.goto('/register')
  await page.getByLabel('Username').fill(account.username)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/play/create')

  // The original creation screen: portraits and village icons are radios inside their art.
  await page.getByLabel('Character Name').fill(ninja)
  for (const choice of ['Ggio Vega', 'Fire Village']) {
    const radio = page.getByRole('radio', { name: new RegExp(`^${choice}`) })
    await radio.locator('..').click()
    await expect(radio).toBeChecked()
  }
  await expectImagesLoaded(page.locator('form'))
  await shot(page, 'create')
  await page.getByRole('button', { name: 'Enter Game' }).click()

  await expect(page).toHaveURL('/play')
  const game = page.getByRole('main', { name: 'Game' })
  await expect(game.getByRole('heading', { name: ninja })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Location' }).getByRole('heading', { name: 'Fire Village' }),
  ).toBeVisible()
  await expectLevel(page, 1)
  await expectExp(page, 0)

  // World chat: the message comes back through the server broadcast.
  const chat = page.getByRole('region', { name: 'Chat' })
  await expect(chat.getByText('Online', { exact: true })).toBeVisible()
  const message = `Hello from ${ninja}`
  await chat.getByLabel('Message to world chat').fill(message)
  await chat.getByRole('button', { name: 'Send' }).click()
  await expect(chat.getByRole('list', { name: 'world messages' })).toContainText(
    `${ninja}: ${message}`,
  )

  // 90000: talk to the Village Elder (auto-accepted on creation).
  await go(page, 'Accepted', QUEST.elder)
  const elder = dialog(page, ELDER)
  await expect(elder.getByRole('status').first()).toContainText(`Quest complete: ${QUEST.elder}.`)
  await expect(elder.getByRole('list', { name: /Received for/ })).toBeVisible()
  await elder.getByRole('button', { name: 'End Conversation' }).click()
  await expectExp(page, 5)

  // 90001: Go opens the bag at the newbie pack; the bag shows original item icons.
  await go(page, 'Accepted', QUEST.pack)
  const bag = dialog(page, 'Inventory')
  await expect(bag.getByRole('img', { name: PACK })).toBeVisible()
  await expectImagesLoaded(bag)
  await bag.getByRole('button', { name: `Use ${PACK}` }).click()
  await expect(bag.getByRole('status')).toContainText(`Quest complete: ${QUEST.pack}.`)
  await expect(bag.getByRole('img', { name: FISTS })).toBeVisible()
  await expectImagesLoaded(bag)
  await shot(page, 'bag')
  await bag.getByRole('button', { name: 'Close' }).click()
  await expectExp(page, 10)

  // 90002: accept at the Elder, equip the newbie weapon; its EXP reaches level 2.
  await acceptFrom(page, ELDER, QUEST.weapon)
  await go(page, 'Accepted', QUEST.weapon)
  await bag.getByRole('button', { name: `Equip ${FISTS}` }).click()
  await expect(bag.getByRole('status')).toContainText(`Quest complete: ${QUEST.weapon}.`)
  await expect(bag.getByRole('listitem').filter({ hasText: FISTS })).toContainText('Equipped')
  await bag.getByRole('button', { name: 'Close' }).click()
  await expectLevel(page, 2)
  await expect(game.getByText('Lv. 2', { exact: true })).toBeVisible()

  // 90003: accept, then talk to the Elder again.
  await acceptFrom(page, ELDER, QUEST.panel)
  await go(page, 'Accepted', QUEST.panel)
  await expect(elder.getByRole('status').first()).toContainText(`Quest complete: ${QUEST.panel}.`)
  await elder.getByRole('button', { name: 'End Conversation' }).click()
  await expectExp(page, 20)

  // World Map: the painting with its places; the first field is a click away.
  await page
    .getByRole('region', { name: 'Location' })
    .getByRole('button', { name: 'World Map' })
    .click()
  const map = dialog(page, 'World Map')
  await expectImagesLoaded(map)
  // No labels on the painting: names are the places' accessible names and their tooltips.
  await expect(map.getByRole('button', { name: 'Fire Village (You are here)' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  // An unvisited field keeps its tooltip but is blocked until the ninja has walked there.
  const field = map.getByRole('button', { name: `${FIELD} (not visited yet)`, exact: true })
  await expect(field).toHaveAttribute('aria-disabled', 'true')
  await field.hover()
  await expect(map.getByRole('tooltip')).toContainText('Entry level: Level 1')
  await shot(page, 'world-map')
  await map.getByRole('button', { name: 'Close' }).click()
  await expect(map).toBeHidden()
  await leaveVillage(page)
  // Phaser removes the old scene's canvas a frame after the new one mounts.
  const pictureCanvas = page.getByTestId('scene-picture').locator('canvas')
  await expect(pictureCanvas).toHaveCount(1)
  await expect(pictureCanvas).toBeVisible()

  // The field HUD has the Explore button by the scene plaque.
  const exploration = page.getByRole('region', { name: 'Exploration' })
  await expect(exploration).toContainText('today')
  await page.waitForTimeout(1_000) // let the picture finish drawing
  await shot(page, 'scene-hud')

  // Explore window: the field's spots (looked at, not searched: the cards are random).
  await exploration.getByRole('button', { name: 'Explore' }).click()
  const explore = dialog(page, 'Exploration')
  await expect(explore.getByText('Searches left today')).toBeVisible()
  const spots = explore.getByRole('button', { name: /^Explore / })
  await expect(spots.first()).toBeVisible()
  expect(await spots.count()).toBeGreaterThan(0)
  await shot(page, 'explore')
  await explore.getByRole('button', { name: 'Close' }).click()
  await expect(explore).toBeHidden()

  // Drops menu of the Sunflower (the keyboard twin of the portrait's hover panel).
  const drops = await sceneAction(page, `Drops: ${MONSTER}`)
  await drops.click()
  await expect(drops).toHaveAttribute('aria-expanded', 'true')
  const dropList = page.getByRole('list', { name: `${MONSTER} drops` })
  await expect(dropList).toBeVisible()
  await expect(dropList.getByRole('listitem').first()).toBeVisible()
  await shot(page, 'drops')
  await drops.click()

  // Hovering the Sunflower card (monster row at the top of the HUD) shows its Drops panel.
  await expect(pictureCanvas).toHaveCount(1)
  await page.getByTestId('monster-card').filter({ hasText: MONSTER }).hover()
  await expect(page.locator(`section[aria-label="${MONSTER} drops"]`)).toBeVisible()
  await shot(page, 'drops-hover')
  await page.mouse.move(10, 400)

  // 90004: accept at the scout, then beat a Sunflower with the weapon drawn.
  await acceptFrom(page, SCOUT, QUEST.combat)
  const expBefore = Number(await expMeter(page).getAttribute('aria-valuenow'))
  await (await sceneAction(page, `Fight ${MONSTER}`)).click()
  const replay = page.getByRole('region', { name: 'Battle replay' })
  await expect(replay.getByRole('button', { name: 'Skip' })).toBeEnabled()
  await page.waitForTimeout(1_500) // a few ticks in, both fighters on stage
  await shot(page, 'battle')
  // The HUD keeps the pre-fight values while the replay plays.
  await expectLevel(page, 2)
  expect(Number(await expMeter(page).getAttribute('aria-valuenow'))).toBe(expBefore)
  await replay.getByRole('button', { name: 'Skip' }).click()

  // A level-2 ninja with a weapon beats a Sunflower; the quest reward brings level 3.
  const summary = dialog(page, 'Victory')
  await expect(summary).toContainText(`You defeated ${MONSTER}.`)
  await expect(summary).toContainText(/EXP\s*\+\d+/)
  await summary.getByRole('button', { name: 'Close' }).click()
  await expectLevel(page, 3)
  expect(Number(await expMeter(page).getAttribute('aria-valuenow'))).not.toBe(expBefore)
})
