// M5 secret technique journey: a level-51 ninja wins an arena fight whose replay holds the outfit's
// secret technique, and the replay loads and plays the technique's art. The execute roll is rigged
// with the defender's stored snapshot (an avatar level far below the attacker's makes both the
// chance and the HP condition certain), so the technique fires on the first strike.
import { expect, test } from '@playwright/test'
import { armNinja, createTwoNinjas, dialog, skipReplay, sql } from './helpers'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

// The attacker's outfit is clothing 3: its ultimate is skill 1903 (reborn-secret-techniques.json),
// drawn from this atlas.
const SECRET = { skillId: 1903, atlas: '/assets/reborn/entities/avatars/3/secret_technique.json' }
// A defender the attacker kills with its first hit and that never hits back.
const WEAK_DEFENDER = {
  hp: 100,
  maxHp: 100,
  minAttack: 0,
  maxAttack: 0,
  dodge: 0,
  parry: 0,
  priority: 0,
  counter: 0,
  skills: [],
  avatarLevel: -60,
}

interface FightEvent {
  actor: number
  skillId?: number
  damage?: number
}

test('a ninja wins an arena fight whose replay plays a secret technique', async ({ browser }) => {
  // Arrange: an attacker at level 51 and a defender in the arena, slot 0 aimed at the defender.
  const [attacker, defender] = await createTwoNinjas(browser, ['Secret', 'Foe'])
  try {
    await armNinja(attacker.page, attacker.name, 'level = 51')
    sql(`update characters set level = 20 where name = :'name'`, { name: defender.name })
    await defender.page.request.get('/api/game/arena')
    await attacker.page.request.get('/api/game/arena')
    sql(
      `update arena_players set snapshot = jsonb_set(snapshot, '{fighter}',
         (snapshot -> 'fighter') || :'weak'::jsonb)
       where character_id = (select id from characters where name = :'defender')`,
      { weak: JSON.stringify(WEAK_DEFENDER), defender: defender.name },
    )
    sql(
      `update arena_opponents set kind = 'player', npc_id = null, referee_place = null, beaten = false,
         opponent_id = (select id from characters where name = :'defender')
       where slot = 0 and character_id = (select id from characters where name = :'attacker')`,
      { attacker: attacker.name, defender: defender.name },
    )
    const { page } = attacker

    // Act: open the arena and attack the defender; the stage loads the technique's atlas.
    await page.getByRole('button', { name: 'Arena', exact: true }).click()
    const arena = dialog(page, 'Arena')
    const atlas = page.waitForResponse((r) => r.url().endsWith(SECRET.atlas) && r.ok())
    const fight = page.waitForResponse((r) => r.url().endsWith('/api/game/arena/fight') && r.ok())
    await arena
      .getByRole('listitem')
      .filter({ hasText: defender.name })
      .getByRole('button', { name: /^Attack / })
      .click()

    // Assert: a win whose replay has the attacker casting its ultimate for the kill.
    const result = await (await fight).json()
    expect(result.won).toBe(true)
    const events: FightEvent[] = result.replay.events
    expect(events.some((e) => e.actor === 0 && e.skillId === SECRET.skillId)).toBe(true)
    await atlas
    await skipReplay(page)
    await expect(arena.getByRole('status')).toContainText(/^Victory!/)
  } finally {
    await attacker.context.close()
    await defender.context.close()
  }
})
