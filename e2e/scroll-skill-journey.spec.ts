// M5 scroll skill journey: a level-51 ninja uses a 7-day scroll from the bag, then slots the
// scroll skill it taught in the Skills window. The level and the scroll are seeded.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  createSeededNinja,
  dialog,
  giveItem,
  openMenu,
  reloadGame,
  seedCharacter,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

// scroll-skills.json: i540001 is the 7-day scroll of skill 1831.
const SCROLL = { itemId: 'i540001', skillId: 1831 }
const text = JSON.parse(
  readFileSync(new URL('../client/src/i18n/reborn.json', import.meta.url), 'utf8'),
) as Record<string, string>
const SCROLL_NAME = text[`lg_reborn_item_${SCROLL.itemId.slice(1)}`]!
const SKILL_NAME = text[`lg_Skill_${SCROLL.skillId}`]!
const WEEK_MS = 7 * 86_400_000

test('a level-51 ninja uses a 7-day scroll and slots the scroll skill', async ({ browser }) => {
  // Arrange: level 51 with one 7-day scroll in the bag.
  const { context, page, name } = await createSeededNinja(browser, 'Scroll')
  try {
    seedCharacter(name, 'level = 51')
    giveItem(name, SCROLL.itemId)
    await reloadGame(page)

    // Act: open the scroll's menu in the bag and use it.
    await openMenu(page, 'Inventory')
    const bag = dialog(page, 'Inventory')
    await bag.getByRole('button', { name: SCROLL_NAME, exact: true }).click({ button: 'right' })
    const used = page.waitForResponse((r) => /\/api\/game\/items\/.+\/use$/.test(r.url()) && r.ok())
    await bag.getByRole('menuitem', { name: `Use ${SCROLL_NAME}`, exact: true }).click()
    await used
    await bag.getByRole('button', { name: 'Close', exact: true }).click()

    // Assert: the scroll is consumed and the skill expires in about seven days.
    const expiry = sql(
      `select extract(epoch from s.expires_at) * 1000 from character_skills s
       join characters c on c.id = s.character_id where c.name = :'name' and s.skill_id = :'skill'`,
      { name, skill: SCROLL.skillId },
    )
    expect(Number(expiry) - Date.now()).toBeGreaterThan(WEEK_MS - 120_000)
    expect(Number(expiry) - Date.now()).toBeLessThanOrEqual(WEEK_MS)
    expect(
      sql(
        `select count(*) from inventory_items i join characters c on c.id = i.character_id
         where c.name = :'name' and i.item_id = :'item'`,
        { name, item: SCROLL.itemId },
      ),
    ).toBe('0')

    // Act: the Scroll Skills panel lists it; slot it in preset 1.
    await openMenu(page, 'Skills')
    const skills = dialog(page, 'Skills')
    await skills.getByRole('button', { name: 'Scroll Skills', exact: true }).click()
    const slotted = page.waitForResponse(
      (r) => r.url().includes('/api/game/skills/') && r.request().method() !== 'GET' && r.ok(),
    )
    await skills.getByRole('button', { name: `Add ${SKILL_NAME} to preset 1`, exact: true }).click()
    await slotted

    // Assert: the button flips to Remove and the skill sits in a slot of preset 1.
    await expect(
      skills.getByRole('button', { name: `Remove ${SKILL_NAME} from preset 1`, exact: true }),
    ).toBeVisible()
    const { trees } = await (await page.request.get('/api/game/skills')).json()
    expect(
      trees[0].some((slot: { skillId: number | null }) => slot.skillId === SCROLL.skillId),
    ).toBe(true)
  } finally {
    await context.close()
  }
})
