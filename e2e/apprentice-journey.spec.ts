// Master and Apprentice journey: a level-20 ninja asks a level-55 ninja by name from the Player
// List's Apprentice tab, the master accepts the popup, both tabs list the bond; at level 40 the
// master graduates the apprentice and both get their Stone reward.
// Levels and the scene are seeded; every apprentice step is UI.
import { expect, test } from '@playwright/test'
import { APPRENTICE_CONFIG } from '../game-core/src/social/apprentice'
import { createTwoNinjas, meetInScene, reloadGame, seedCharacter, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(150_000)

// Crossroads: a neutral field, where the Player List shows.
const FIELD = 2601

const stoneOf = (name: string) =>
  Number(sql(`select stone from characters where name = :'name'`, { name }))
const bondsOf = (master: string) =>
  sql(
    `select count(*) from apprenticeships a join characters c on c.id = a.master_id
     where c.name = :'name'`,
    { name: master },
  )

test('an apprentice finds a master and graduates', async ({ browser }) => {
  const players = await createTwoNinjas(browser, ['Pupil', 'Sensei'])
  const [pupil, sensei] = players
  try {
    // Arrange: the pupil at level 20, the sensei at 55, both in the same field.
    seedCharacter(pupil.name, 'level = 20, stone = 0')
    seedCharacter(sensei.name, 'level = 55, stone = 0')
    await meetInScene([...players], FIELD)
    const tab = (page: typeof pupil.page) => page.getByRole('region', { name: 'Player List' })

    // Act: the pupil asks the sensei by name.
    const pupilList = tab(pupil.page)
    await pupilList.getByRole('tab', { name: 'Apprentice' }).click()
    await pupilList.getByLabel('Ninja name').fill(sensei.name)
    await pupilList.getByRole('button', { name: 'Request' }).click()
    await expect(pupilList).toContainText(`Waiting for ${sensei.name}...`)

    // The sensei accepts the popup.
    const asked = sensei.page.getByRole('alertdialog', { name: 'Apprentice request' })
    await expect(asked).toContainText(`${pupil.name} (Level 20) wants to be your apprentice.`)
    await asked.getByRole('button', { name: 'Accept' }).click()

    // Assert: both tabs list the bond.
    await expect(pupilList.getByRole('list', { name: 'Your master' })).toContainText(sensei.name)
    const senseiList = tab(sensei.page)
    await senseiList.getByRole('tab', { name: 'Apprentice' }).click()
    await expect(senseiList.getByRole('list', { name: 'Your apprentices' })).toContainText(
      pupil.name,
    )
    expect(bondsOf(sensei.name)).toBe('1')

    // Act: the pupil reaches level 40; the sensei graduates them.
    seedCharacter(pupil.name, 'level = :level', { level: APPRENTICE_CONFIG.graduateLevel })
    await reloadGame(sensei.page)
    await senseiList.getByRole('tab', { name: 'Apprentice' }).click()
    await senseiList.getByRole('button', { name: 'Graduate' }).click()

    // Assert: the bond ended and both got their reward.
    await expect(senseiList.getByRole('list', { name: 'Your apprentices' })).not.toContainText(
      pupil.name,
    )
    await expect.poll(() => bondsOf(sensei.name)).toBe('0')
    expect(stoneOf(sensei.name)).toBe(APPRENTICE_CONFIG.rewards.master.stone)
    expect(stoneOf(pupil.name)).toBe(APPRENTICE_CONFIG.rewards.apprentice.stone)
  } finally {
    for (const { context } of players) await context.close()
  }
})
