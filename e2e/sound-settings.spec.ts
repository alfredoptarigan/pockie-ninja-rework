// M6 sound journey: a ninja mutes the music and sets its volume in the Settings menu; both survive
// a reload (they live in localStorage under pockie.audio).
import { expect, test, type Page } from '@playwright/test'
import { createSeededNinja, reloadGame } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const VOLUME = 30

async function openSound(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return page.getByRole('list', { name: 'Settings' }).getByRole('group', { name: 'Sound' })
}

test('mute and music volume persist across a reload', async ({ browser }) => {
  const { context, page } = await createSeededNinja(browser, 'Sound')
  try {
    // Act: mute the music and set the volume.
    let sound = await openSound(page)
    await expect(sound.getByRole('checkbox', { name: 'Mute music' })).not.toBeChecked()
    await sound.getByRole('checkbox', { name: 'Mute music' }).check()
    await sound.getByRole('slider').fill(String(VOLUME))
    await expect(sound.getByRole('status')).toHaveText(`${VOLUME}%`)

    // Act: reload the game.
    await reloadGame(page)

    // Assert: the menu and the music element keep both settings.
    sound = await openSound(page)
    await expect(sound.getByRole('checkbox', { name: 'Mute music' })).toBeChecked()
    await expect(sound.getByRole('slider')).toHaveValue(String(VOLUME))
    const audio = page.locator('audio')
    expect(await audio.evaluate((el: HTMLAudioElement) => [el.muted, el.volume])).toEqual([
      true,
      VOLUME / 100,
    ])
  } finally {
    await context.close()
  }
})
