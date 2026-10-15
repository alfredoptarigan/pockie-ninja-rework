// Akatsuki and Hashirama journeys.
// Akatsuki: a level-30 ninja whose first pair's ambush is waiting (seeded: field-win ambushes are
// random) opens Akatsuki from the village icon, asks Zetsu, faces Deidara & Sasori until beaten,
// then claims Deidara's red outfit. Hashirama: with a battle open (seeded), the icon appears; the
// ninja fights for Madara and attacks Hashirama; the battle ends (by SQL), the spins are paid and
// the ninja spins the Fortune Wheel.
import { expect, test, type Page } from '@playwright/test'
import { armNinja, createSeededNinja, dialog, reloadGame, skipReplay, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(240_000)

const DEIDARA_RED = 'i2944250'
const ofNinja = `(select id from characters where name = :'name')`

async function faceUntilBeaten(page: Page, name: string) {
  const akatsuki = dialog(page, 'Akatsuki Invasion')
  for (let fights = 0; fights < 8; fights++) {
    await akatsuki.getByRole('button', { name: 'Zetsu. Informant' }).click()
    await akatsuki.getByRole('button', { name: 'Face them now' }).click()
    await skipReplay(page)
    const result = page.getByRole('dialog', { name: /^(Victory|Defeat)$/ })
    await expect(result).toBeVisible()
    const won = await page.getByRole('dialog', { name: 'Victory' }).isVisible()
    await result.getByRole('button', { name: 'OK' }).click()
    if (won) return
    // A lost ambush leaves; the journey sends the pair back and reopens the window.
    sql(`update akatsuki_hunters set pending_ambush = true where character_id = ${ofNinja};`, {
      name,
    })
    await akatsuki.getByRole('button', { name: 'Leave' }).click()
    await page.getByRole('button', { name: 'Akatsuki', exact: true }).click()
  }
  throw new Error('Never beat Deidara & Sasori')
}

test('a ninja beats an Akatsuki ambush and claims the red outfit', async ({ browser }) => {
  // Arrange: level 30 with the journey weapon; Deidara & Sasori's ambush is waiting.
  const { context, page, name } = await createSeededNinja(browser, 'Akat')
  try {
    sql(`insert into akatsuki_hunters (character_id, pending_ambush) select ${ofNinja}, true;`, {
      name,
    })
    await armNinja(page, name, 'level = 30')

    // Act: open Akatsuki from the top-right icon and read Zetsu.
    await page.getByRole('button', { name: 'Akatsuki', exact: true }).click()
    const akatsuki = dialog(page, 'Akatsuki Invasion')
    await expect(akatsuki.getByText('Pairs defeated: 0 / 4')).toBeVisible()
    await expect(akatsuki.getByText('Hunted by Deidara & Sasori')).toBeVisible()
    await akatsuki.getByRole('button', { name: 'Zetsu. Informant' }).click()
    await expect(akatsuki.getByRole('region', { name: 'Zetsu' })).toContainText(
      '"Deidara & Sasori are waiting for you right now."',
    )
    await akatsuki.getByRole('button', { name: 'Zetsu. Informant' }).click()

    // Act: face the ambush until the pair is beaten.
    await faceUntilBeaten(page, name)

    // Assert: the next pair hunts, Deidara is beaten and gives the red outfit.
    await expect(akatsuki.getByText('Pairs defeated: 1 / 4')).toBeVisible()
    await expect(akatsuki.getByText('Hunted by Hidan & Kakuzu')).toBeVisible()
    await akatsuki.getByRole('button', { name: 'Deidara. Defeated' }).click()
    await akatsuki.getByRole('button', { name: 'Claim red outfit' }).click()
    await expect(akatsuki.getByRole('button', { name: 'Red outfit claimed' })).toBeDisabled()
    expect(
      sql(
        `select count(*) from inventory_items where character_id = ${ofNinja}
         and item_id = :'item' and bound;`,
        { name, item: DEIDARA_RED },
      ),
    ).toBe('1')
  } finally {
    await context.close()
  }
})

test('a ninja fights for Madara and spins the Fortune Wheel', async ({ browser }) => {
  // Arrange: a running battle (an admin would start it) and an armed level-40 ninja.
  sql(`delete from hashirama_events;`)
  sql(
    `insert into hashirama_events (ends_at, closes_at)
     values (now() + interval '1 hour', now() + interval '25 hours');`,
  )
  const { context, page, name } = await createSeededNinja(browser, 'Valley')
  try {
    await armNinja(page, name, 'level = 40')

    // Act: the icon shows while the battle is open; choose Madara and attack Hashirama.
    await page.getByRole('button', { name: 'Hashirama vs Madara', exact: true }).click()
    const valley = dialog(page, 'Valley of the End: Hashirama vs Madara')
    await valley.getByRole('button', { name: 'Fight for Madara' }).click()
    await expect(valley.getByText('You fight for Madara')).toBeVisible()
    await valley.getByRole('button', { name: 'Attack Hashirama' }).click()
    await skipReplay(page)
    const report = page.getByRole('dialog', { name: 'Battle report' })
    await expect(report).toContainText(/You dealt [\d,]+ damage to Hashirama Senju\./)
    await report.getByRole('button', { name: 'OK' }).click()
    await expect(
      valley.getByRole('region', { name: 'Top damage: Madara' }).getByText(name),
    ).toBeVisible()

    // Act: the battle ends; reopening counts it and pays the spins.
    sql(`update hashirama_events set ends_at = now() - interval '1 second';`)
    await reloadGame(page)
    await page.getByRole('button', { name: 'Hashirama vs Madara', exact: true }).click()
    // The first request after the end counts the battle (a few seconds on a busy machine).
    await expect(valley.getByText("Madara's side won the battle!")).toBeVisible({
      timeout: 30_000,
    })
    await expect(valley.getByText('You earned 15 free Fortune Wheel spins.')).toBeVisible()

    // Act: choose three prizes at random and spin.
    await valley.getByRole('button', { name: 'Fortune Wheel (15 free spins)' }).click()
    const wheel = dialog(page, 'Fortune Wheel')
    await wheel.getByRole('button', { name: 'Random set' }).click()
    await expect(wheel.getByText('Your prizes 3/3')).toBeVisible()
    await wheel.getByRole('button', { name: 'SPIN', exact: true }).click()

    // Assert: the reward is shown and one spin was used (a spin prize may add some back).
    const won = page.getByRole('dialog', { name: 'Congratulations!' })
    await expect(won).toBeVisible({ timeout: 15_000 })
    await won.getByRole('button', { name: 'Continue' }).click()
    expect(
      Number(
        sql(`select spin_token from hashirama_players where character_id = ${ofNinja};`, {
          name,
        }),
      ),
    ).toBe(1)
  } finally {
    await context.close()
    sql(`delete from hashirama_events;`)
  }
})
