// M6 pets journey: a ninja adopts a pet from the bag, feeds it, finishes digestion with Gold, sets
// it active and wins a field fight in which the pet attacks. The pet item, food, Gold, weapon and the
// pet's PET_ATTACK skill are seeded; adoption, feeding, digestion, activation and the fight use the UI.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  createSeededNinja,
  dialog,
  giveItem,
  leaveVillage,
  openMenu,
  reloadGame,
  sceneAction,
  seedCharacter,
  skipReplay,
  sql,
} from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(180_000)

const text = JSON.parse(
  readFileSync(new URL('../client/src/i18n/reborn.json', import.meta.url), 'utf8'),
) as Record<string, string>
const PET = { itemId: 'i320002', name: text.lg_reborn_item_320002! }
// pet-foods.json: Midsized Beans are type 1 (any food), so they fit every rolled food slot.
const FOOD = 'i170127'
const DIGEST_GOLD = 8
// skills.json 40001: PET_ATTACK, a Support skill that fires on 21% of the master's hits.
const PET_ATTACK = 40001
// A level-10 ninja with Newbie Swiping Fists needs many hits on a level-8 Scarlet (n32001), so
// the pet attacks in about 9 of 10 wins; a few fights make a pet attack certain in practice.
const LEVEL = 10
const FISTS = 'i270100'
const MONSTER = 'Scarlet'
const MAX_FIGHTS = 6

/** Fights the monster through the scene and returns the fight response body. */
async function fight(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/game/fight') && r.request().method() === 'POST',
  )
  await (await sceneAction(page, `Fight ${MONSTER}`)).click()
  const body = await (await response).json()
  await skipReplay(page)
  const summary = dialog(page, body.won ? 'Victory' : 'Defeat')
  await summary.getByRole('button', { name: 'Close' }).click()
  return body as { won: boolean; replay: unknown }
}

test('a ninja adopts, feeds and activates a pet that attacks in a field fight', async ({
  browser,
}) => {
  // Arrange: level 10 with Gold, the fists, a pet item and one food.
  const { context, page, name } = await createSeededNinja(browser, 'Pet')
  try {
    seedCharacter(name, 'level = :level, gold = 100', { level: LEVEL })
    giveItem(name, FISTS, { equipped_slot: 'Weapon' })
    giveItem(name, PET.itemId)
    giveItem(name, FOOD)
    await reloadGame(page)

    // Act: use the pet item in the bag.
    await openMenu(page, 'Bag')
    const bag = dialog(page, 'Inventory')
    await bag.getByRole('button', { name: PET.name, exact: true }).click()
    const adopted = page.waitForResponse(
      (r) => /\/api\/game\/items\/.+\/use$/.test(r.url()) && r.ok(),
    )
    await bag.getByRole('menuitem', { name: `Use ${PET.name}`, exact: true }).click()
    await adopted
    await bag.getByRole('button', { name: 'Close', exact: true }).click()

    // Act: open the Pet Kennel and feed the food in the first slot.
    await openMenu(page, 'Character')
    await dialog(page, 'Stats').getByRole('button', { name: 'Pet Kennel', exact: true }).click()
    const kennel = dialog(page, 'Pet Kennel')
    await expect(kennel.getByRole('region', { name: PET.name })).toBeVisible()
    await kennel.getByLabel('Food slot 1').selectOption(FOOD)
    const fed = page.waitForResponse((r) => r.url().endsWith('/feed') && r.ok())
    await kennel.getByRole('button', { name: 'Feed', exact: true }).click()
    await fed
    await expect(kennel.getByRole('timer')).toBeVisible()

    // Act: finish the digestion now for Gold.
    const digested = page.waitForResponse((r) => r.url().endsWith('/digest-now') && r.ok())
    await kennel
      .getByRole('button', { name: `Finish now (${DIGEST_GOLD} Gold)`, exact: true })
      .click()
    const digest = await (await digested).json()

    // Assert: the food became appetite and the Gold is spent.
    expect(digest.pets[0].digestEndsAt).toBeNull()
    expect(digest.pets[0].appetite).toBeGreaterThan(0)
    expect(digest.character.gold).toBe(100 - DIGEST_GOLD)
    await expect(kennel.getByRole('meter', { name: 'Appetite' })).not.toHaveAttribute(
      'aria-valuenow',
      '0',
    )

    // Act: set it active.
    const activated = page.waitForResponse((r) => r.url().endsWith('/active') && r.ok())
    await kennel.getByRole('button', { name: 'Set active', exact: true }).click()
    expect((await (await activated).json()).pets[0].active).toBe(true)
    await expect(kennel.getByRole('button', { name: 'Rest', exact: true })).toBeVisible()

    // Arrange: teach it PET_ATTACK, refill HP and walk to the field.
    sql(
      `with pet as (
         update character_pets p set help_slots = 1 from characters c
         where c.id = p.character_id and c.name = :'name' returning p.id)
       insert into character_pet_skills (pet_id, skill_id, kind, slot, learned_order)
       select id, :'skill', 2, 0, 0 from pet`,
      { name, skill: PET_ATTACK },
    )
    const { character } = await (await page.request.get('/api/game/character')).json()
    seedCharacter(name, 'hp = :hp, mp = :mp', { hp: character.maxHp, mp: character.maxMp })
    await reloadGame(page)
    await leaveVillage(page)

    // Act: fight until a win whose replay has a pet event (the first win almost always does).
    let petWin = false
    for (let round = 0; round < MAX_FIGHTS && !petWin; round++) {
      const result = await fight(page)
      expect(result.won).toBe(true)
      petWin = JSON.stringify(result.replay).includes('"isPet":true')
    }

    // Assert: the active pet attacked in a won field fight.
    expect(petWin).toBe(true)
  } finally {
    await context.close()
  }
})
