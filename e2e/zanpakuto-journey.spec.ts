// Zanpakuto journey: a level-61 ninja opens Zanpakuto from the village icon, equips a crystal into
// its Sharp slot, refines it once (a free try) and buys spirit slot 5 with coupons. The crystals
// come from the grant script (server/scripts/grant-zanpakuto.ts): no in-game source exists yet.
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createSeededNinja, dialog, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// Runs tsx's CLI with this Node rather than through `pnpm exec`: on Windows pnpm is a .cmd shim,
// which execFileSync cannot spawn without a shell.
const serverDir = fileURLToPath(new URL('../server/', import.meta.url))
const tsxCli = fileURLToPath(new URL('../server/node_modules/tsx/dist/cli.mjs', import.meta.url))

const grant = (name: string, iid: number) =>
  execFileSync(
    process.execPath,
    [tsxCli, '--env-file-if-exists=../.env', 'scripts/grant-zanpakuto.ts', name, String(iid)],
    { cwd: serverDir, encoding: 'utf8' },
  )

const zanpakutoValue = (name: string, column: string) =>
  sql(
    `select z.${column} from character_zanpakuto z join characters c on c.id = z.character_id
     where c.name = :'name';`,
    { name },
  )

test('a ninja equips, refines and makes room for Zanpakuto crystals', async ({ browser }) => {
  // Arrange: level 61 (the unlock level), 1000 coupons, two crystals in the spirit inventory.
  const { context, page, name } = await createSeededNinja(browser, 'Zanpa')
  try {
    seedCharacter(name, 'level = 61, gift_coupon = 1000')
    grant(name, 480001)
    grant(name, 480031)
    await reloadGame(page)

    // Act: open Zanpakuto and equip the Sharp Blue Crystal I from spirit slot 1.
    await page.getByRole('button', { name: 'Zanpakuto', exact: true }).click()
    const zanpakuto = dialog(page, 'Zanpakuto')
    await zanpakuto.getByRole('button', { name: 'Spirit slot 1: Sharp Blue Crystal I' }).click()
    await zanpakuto.getByRole('menuitem', { name: 'Equip Crystal' }).click()

    // Assert: it sits in Sharp slot 1 and spirit slot 1 is empty.
    await zanpakuto.getByRole('tab', { name: 'Sharp' }).click()
    await expect(
      zanpakuto.getByRole('button', { name: 'Sharp slot 1: Sharp Blue Crystal I' }),
    ).toBeVisible()
    await expect(zanpakuto.getByRole('button', { name: 'Spirit slot 1: empty' })).toBeVisible()

    // Act: refine it with the first free try of the day.
    await zanpakuto.getByRole('button', { name: 'Refine', exact: true }).click()
    const refine = dialog(page, 'Zanpakuto Refine')
    await expect(refine).toContainText('3 free refining tries left today!')
    await refine.getByRole('button', { name: 'Refine', exact: true }).click()
    await refine.getByRole('button', { name: 'Accept' }).click()

    // Assert: one free try used, no Spirit Coins spent.
    await expect(refine).toContainText('2 free refining tries left today!')
    expect(zanpakutoValue(name, 'refines_used')).toBe('1')
    await refine.getByRole('button', { name: 'Close' }).click()

    // Act: buy spirit slot 5 (index 4) for 800 coupons.
    await zanpakuto.getByRole('button', { name: 'Spirit slot 5: locked' }).click()
    await dialog(page, 'Unlock Spirit Slot').getByRole('button', { name: '800 Coupons' }).click()

    // Assert: the slot is open and the coupons are spent.
    await expect(zanpakuto.getByRole('button', { name: 'Spirit slot 5: empty' })).toBeVisible()
    expect(zanpakutoValue(name, 'unlocked_slots')).toBe('{4}')
    expect(sql(`select gift_coupon from characters where name = :'name';`, { name })).toBe('200')
  } finally {
    await context.close()
  }
})
