// M6 sound journey: a ninja sets the music volume and mutes it in the Settings window; both survive
// a reload (they live in localStorage under pockie.audio).
import { expect, test, type Page } from '@playwright/test'
import { createSeededNinja, dialog, reloadGame } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

const VOLUME = 30

async function openSound(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return dialog(page, 'Settings').getByRole('group', { name: 'Sound:' })
}

test('mute and music volume persist across a reload', async ({ browser }) => {
  const { context, page } = await createSeededNinja(browser, 'Sound')
  try {
    // Act: set the volume, then mute the music (Reborn disables the volume while muted).
    let sound = await openSound(page)
    const mute = () => sound.getByRole('checkbox', { name: 'Mute Music' })
    await expect(mute()).not.toBeChecked()
    await sound.getByRole('slider', { name: 'Volume' }).fill(String(VOLUME))
    await expect(sound.getByRole('spinbutton', { name: 'Volume %' })).toHaveValue(String(VOLUME))
    await mute().check()
    await expect(sound.getByRole('slider', { name: 'Volume' })).toBeDisabled()

    // Act: reload the game.
    await reloadGame(page)

    // Assert: the window and the music element keep both settings.
    sound = await openSound(page)
    await expect(mute()).toBeChecked()
    await expect(sound.getByRole('slider', { name: 'Volume' })).toHaveValue(String(VOLUME))
    const audio = page.locator('audio')
    expect(await audio.evaluate((el: HTMLAudioElement) => [el.muted, el.volume])).toEqual([
      true,
      VOLUME / 100,
    ])
  } finally {
    await context.close()
  }
})
