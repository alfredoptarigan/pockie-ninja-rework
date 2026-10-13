// Shared setup of the arena API tests: ninjas with their own session, arena rows and helpers that
// make a fight's outcome certain (a defender snapshot with 1 HP and no attack).
import { and, eq } from 'drizzle-orm'
import { buildTestApp, Client, type createTestDb } from '../../../test/helpers.js'
import { arenaLogs, arenaOpponents, arenaPlayers, characters } from '../../db/schema.js'

type TestDb = ReturnType<typeof createTestDb>['db']
export type Ninja = Awaited<ReturnType<ReturnType<typeof arenaTestApp>['ninja']>>

/** The test app (app.ts registers the arena). */
export function arenaTestApp(db: TestDb) {
  const app = buildTestApp(db)
  let count = 0

  async function ninja(name: string) {
    count++
    const client = new Client(app)
    await client.post('/api/auth/register', {
      username: `Player_${count}`,
      email: `player${count}@example.com`,
      password: 'believe-it',
    })
    const created = await client.post('/api/game/characters', {
      name,
      gender: 0,
      clothing: 3,
      nation: 0,
    })
    const id: string = created.json().character.id
    const set = (values: Partial<typeof characters.$inferInsert>) =>
      db.update(characters).set(values).where(eq(characters.id, id))
    const row = async () => (await db.select().from(characters).where(eq(characters.id, id)))[0]!
    const arena = async () =>
      (await db.select().from(arenaPlayers).where(eq(arenaPlayers.characterId, id)))[0]!
    const setArena = (values: Partial<typeof arenaPlayers.$inferInsert>) =>
      db.update(arenaPlayers).set(values).where(eq(arenaPlayers.characterId, id))
    /** Joins the arena (GET /arena) and applies `values`. */
    const join = async (values: Partial<typeof arenaPlayers.$inferInsert> = {}) => {
      await client.get('/api/game/arena')
      if (Object.keys(values).length) await setArena(values)
    }
    /** Makes this ninja's defence certain to lose (1 HP, no attack, no dodge). */
    const weaken = async () => {
      const snapshot = (await arena()).snapshot as { fighter: Record<string, unknown> }
      const fighter = {
        ...snapshot.fighter,
        hp: 1,
        maxHp: 1,
        minAttack: 0,
        maxAttack: 0,
        dodge: 0,
        parry: 0,
        priority: 0,
        counter: 0,
        skills: [],
      }
      await setArena({ snapshot: { ...snapshot, fighter } })
    }
    const logs = () => db.select().from(arenaLogs).where(eq(arenaLogs.characterId, id))
    return { client, id, name, set, row, arena, setArena, join, weaken, logs }
  }

  /** Points `slot` of `attacker` at `defender`, not beaten. */
  const aim = (attacker: { id: string }, slot: number, defender: { id: string }) =>
    db
      .update(arenaOpponents)
      .set({
        kind: 'player',
        npcId: null,
        refereePlace: null,
        opponentId: defender.id,
        beaten: false,
      })
      .where(and(eq(arenaOpponents.characterId, attacker.id), eq(arenaOpponents.slot, slot)))

  return { app, ninja, aim }
}

export const errorCode = (response: { json: () => { error?: { code: string } } }) =>
  response.json().error?.code
export const today = () => new Date().toISOString().slice(0, 10)
export const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
