import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../env.js'
import * as schema from './schema.js'

// Runs the real migration files against a scratch database next to the test database.
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const testUrl = new URL(loadEnv().DATABASE_URL)
// Named like every test database, ending in _test (pockie_remastered_migrations_test).
const scratchName = testUrl.pathname.slice(1).replace(/(_test)?$/, '_migrations_test')
const scratchUrl = Object.assign(new URL(testUrl), { pathname: `/${scratchName}` }).toString()
const admin = postgres(testUrl.toString(), { max: 1, onnotice: () => {} })
// Each run builds a whole database; allow for a busy machine.
const SLOW = 60_000
const tmp = mkdtempSync(join(tmpdir(), 'pockie-migrations-'))

/** Applies the first `count` migrations (all when omitted) to the scratch database. */
async function migrateTo(count?: number) {
  let folder = migrationsFolder
  if (count !== undefined) {
    folder = join(tmp, String(count))
    cpSync(migrationsFolder, folder, { recursive: true })
    const journalPath = join(folder, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] }
    journal.entries = journal.entries.slice(0, count)
    writeFileSync(journalPath, JSON.stringify(journal))
  }
  const client = postgres(scratchUrl, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: folder })
  } finally {
    await client.end()
  }
}

async function recreateScratch() {
  await admin.unsafe(`drop database if exists "${scratchName}" with (force)`)
  await admin.unsafe(`create database "${scratchName}"`)
}

const scratch = () => postgres(scratchUrl, { max: 1, onnotice: () => {} })

afterAll(async () => {
  await admin.unsafe(`drop database if exists "${scratchName}" with (force)`)
  await admin.end()
  rmSync(tmp, { recursive: true, force: true })
}, SLOW)

describe('migrations', { timeout: SLOW }, () => {
  it('migrates an empty database to every table of the schema', async () => {
    await recreateScratch()
    await migrateTo()
    const sql = scratch()
    try {
      const tables = await sql<{ name: string }[]>`
        select table_name as name from information_schema.tables
        where table_schema = 'public' order by table_name`
      const expected = Object.values(schema)
        .filter((value) => is(value, PgTable))
        .map((table) => getTableName(table))
        .sort()
      expect(tables.map((t) => t.name)).toEqual(expected)
    } finally {
      await sql.end()
    }
  })

  describe('on a database holding M2 data', () => {
    const sql = scratch()
    let characterId = ''

    beforeAll(async () => {
      await recreateScratch()
      await migrateTo(4) // 0000-0003: the M2 schema
      const [user] = await sql<{ id: string }[]>`
        insert into users (username, email, password_hash)
        values ('Naruto', 'naruto@example.com', 'x') returning id`
      const [character] = await sql<{ id: string }[]>`
        insert into characters (user_id, name, gender, nation, clothing, avatar_id, hp, mp, scene_id, stone)
        values (${user!.id}, 'Hokage_7', 0, 0, 45, 45, 224, 224, 2101, 500) returning id`
      characterId = character!.id
      await sql`
        insert into inventory_items (character_id, item_id, count, bound, equipped_slot) values
          (${characterId}, 'i250101', 1, true, 'Weapon'),
          (${characterId}, 'i300111', 1, false, null),
          (${characterId}, 'i160006', 7, true, null)`
      await sql`
        insert into character_quests (character_id, task_id, state, progress)
        values (${characterId}, 90000, 2, '[1]'), (${characterId}, 10025, 0, '[0, 2]')`
      await sql`
        insert into character_explore_spots (character_id, spot_id, star_level, star_progress)
        values (${characterId}, 21011, 2, 30)`
      await migrateTo()
    }, SLOW)

    afterAll(() => sql.end())

    it('keeps the character, quests and explore spots', async () => {
      const [character] = await sql`select name, stone, scene_id from characters`
      expect(character).toEqual({ name: 'Hokage_7', stone: '500', scene_id: 2101 })
      const quests =
        await sql`select task_id, state, progress, complete_type from character_quests order by task_id`
      expect(quests).toEqual([
        { task_id: 10025, state: 0, progress: [0, 2], complete_type: 0 },
        { task_id: 90000, state: 2, progress: [1], complete_type: 0 },
      ])
      const spots =
        await sql`select spot_id, star_level, star_progress from character_explore_spots`
      expect(spots).toEqual([{ spot_id: 21011, star_level: 2, star_progress: 30 }])
    })

    it('marks the current scene as entered and starts every daily counter at zero', async () => {
      const [character] = await sql`
        select scenes_entered, daily_quest_day, daily_quests_accepted, daily_quests_completed,
               daily_quest_offer_at, daily_score, daily_score_week, toll_gate_day,
               toll_gate_entries, pub_fight_day, pub_fights_today, pub_fight_pulled_at
        from characters`
      expect(character).toEqual({
        scenes_entered: [2101],
        daily_quest_day: null,
        daily_quests_accepted: 0,
        daily_quests_completed: 0,
        daily_quest_offer_at: null,
        daily_score: 0,
        daily_score_week: null,
        toll_gate_day: null,
        toll_gate_entries: 0,
        pub_fight_day: null,
        pub_fights_today: 0,
        pub_fight_pulled_at: null,
      })
    })

    it('gives existing equipment full durability and plain item defaults', async () => {
      const items = await sql`
        select item_id, count, bound, equipped_slot, enhance_level, inscribe_level, durability,
               can_identify, identify_count, identify_times, props, engraved_slot
        from inventory_items order by item_id`
      const plain = {
        enhance_level: 0,
        inscribe_level: 0,
        can_identify: false,
        identify_count: 0,
        identify_times: 0,
        props: [],
        engraved_slot: null,
      }
      expect(items).toEqual([
        {
          item_id: 'i160006',
          count: 7,
          bound: true,
          equipped_slot: null,
          durability: null,
          ...plain,
        },
        {
          item_id: 'i250101',
          count: 1,
          bound: true,
          equipped_slot: 'Weapon',
          durability: 100,
          ...plain,
        },
        // 0040_outfit_items: the creation outfit (clothing 45) as an item worn in set I.
        {
          item_id: 'i290045',
          count: 1,
          bound: true,
          equipped_slot: 'Outfit',
          durability: null,
          ...plain,
        },
        {
          item_id: 'i300111',
          count: 1,
          bound: false,
          equipped_slot: null,
          durability: 1,
          ...plain,
        },
      ])
    })
  })

  describe('on a database holding M3 data', () => {
    const sql = scratch()

    beforeAll(async () => {
      await recreateScratch()
      await migrateTo(12) // 0000-0011: the M3 schema
      const [user] = await sql<{ id: string }[]>`
        insert into users (username, email, password_hash)
        values ('Kakashi', 'kakashi@example.com', 'x') returning id`
      const [character] = await sql<{ id: string }[]>`
        insert into characters (user_id, name, gender, nation, clothing, avatar_id, hp, mp, scene_id, level, stone, honor)
        values (${user!.id}, 'Kakashi', 0, 0, 45, 45, 900, 900, 3102, 40, 12000, 300) returning id`
      const id = character!.id
      await sql`
        insert into inventory_items (character_id, item_id, count, equipped_slot) values
          (${id}, 'i250101', 1, 'Weapon'), (${id}, 'i160006', 7, null)`
      await sql`insert into single_gate (character_id, best_floor) values (${id}, 42)`
      await sql`insert into toll_gate_runs (character_id, gate_id) values (${id}, 100001)`
      await migrateTo()
    }, SLOW)

    afterAll(() => sql.end())

    it('keeps every item in the bag and opens an empty Market wallet', async () => {
      const items = await sql`select item_id, location from inventory_items order by item_id`
      expect(items).toEqual([
        { item_id: 'i160006', location: 'bag' },
        { item_id: 'i250101', location: 'bag' },
        { item_id: 'i290045', location: 'bag' },
      ])
      const [character] = await sql`
        select level, stone, honor, market_stone, market_gold from characters`
      expect(character).toEqual({
        level: 40,
        stone: '12000',
        honor: 300,
        market_stone: '0',
        market_gold: '0',
      })
    })

    it('keeps Las Noches progress and makes a running toll gate run a solo run', async () => {
      expect(await sql`select best_floor from single_gate`).toEqual([{ best_floor: 42 }])
      expect(await sql`select gate_id, team_id from toll_gate_runs`).toEqual([
        { gate_id: 100001, team_id: null },
      ])
    })

    it('starts every M4 table empty', async () => {
      const [counts] = await sql`
        select (select count(*) from friends)::int as friends,
               (select count(*) from mails)::int as mails,
               (select count(*) from teams)::int as teams,
               (select count(*) from market_listings)::int as listings,
               (select count(*) from arena_players)::int as arena,
               (select count(*) from toll_gate_weekly)::int as weekly`
      expect(counts).toEqual({ friends: 0, mails: 0, teams: 0, listings: 0, arena: 0, weekly: 0 })
    })
  })

  describe('on a database holding M6 pet skill rows', () => {
    const sql = scratch()

    beforeAll(async () => {
      await recreateScratch()
      await migrateTo(33) // 0000-0032: unlocked empty skill slots were rows with negative ids
      const [user] = await sql<{ id: string }[]>`
        insert into users (username, email, password_hash)
        values ('Shino', 'shino@example.com', 'x') returning id`
      const [character] = await sql<{ id: string }[]>`
        insert into characters (user_id, name, gender, nation, clothing, avatar_id, hp, mp, scene_id)
        values (${user!.id}, 'Shino', 0, 0, 45, 45, 224, 224, 2101) returning id`
      const [pet] = await sql<{ id: string }[]>`
        insert into character_pets (character_id, species, kennel_slot, growth, base_attack,
          base_defence, base_disturb, base_active, base_savvy)
        values (${character!.id}, 'i320002', 0, 120, 11, 6, 8, 8, 6) returning id`
      // Halo: slot 0 empty. Pass: slot 0 holds 50020, slot 1 empty, slot 2 holds 40043.
      // 40044 is learned but in no slot.
      await sql`
        insert into character_pet_skills (pet_id, skill_id, learned_order, kind, slot) values
          (${pet!.id}, -11, 0, 1, 0),
          (${pet!.id}, 50020, 0, 3, 0),
          (${pet!.id}, -32, 0, 3, 1),
          (${pet!.id}, 40043, 1, 3, 2),
          (${pet!.id}, 40044, 2, 3, null)`
      await migrateTo()
    }, SLOW)

    afterAll(() => sql.end())

    it('moves unlocked slots to per-kind counts and deletes the empty-slot rows', async () => {
      expect(await sql`select halo_slots, help_slots, pass_slots from character_pets`).toEqual([
        { halo_slots: 1, help_slots: 0, pass_slots: 3 },
      ])
      const skills = await sql`
        select skill_id, kind, slot from character_pet_skills order by skill_id`
      expect(skills).toEqual([
        { skill_id: 40043, kind: 3, slot: 2 },
        { skill_id: 40044, kind: 3, slot: null },
        { skill_id: 50020, kind: 3, slot: 0 },
      ])
      expect(
        await sql`select count(*)::int as n from character_pet_skills where skill_id <= 0`,
      ).toEqual([{ n: 0 }])
    })
  })

  describe('on a database before outfit items', () => {
    const sql = scratch()

    beforeAll(async () => {
      await recreateScratch()
      const journal = JSON.parse(
        readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
      ) as { entries: { tag: string }[] }
      await migrateTo(journal.entries.findIndex((entry) => entry.tag.endsWith('_outfit_items')))
      const users = await sql<{ id: string }[]>`
        insert into users (username, email, password_hash) values
          ('Gin', 'gin@example.com', 'x'), ('Kiba', 'kiba@example.com', 'x'),
          ('Ino', 'ino@example.com', 'x')
        returning id`
      const [gin, kiba, ino] = users.map((user) => user.id)
      const characters = await sql<{ id: string; name: string }[]>`
        insert into characters (user_id, name, gender, nation, clothing, avatar_id, hp, mp, scene_id)
        values (${gin!}, 'Gin', 0, 0, 3, 3, 200, 200, 2101),
               (${kiba!}, 'Kiba', 0, 0, 118, 118, 200, 200, 2101),
               (${ino!}, 'Ino', 1, 0, 17, 117, 200, 200, 2101)
        returning id, name`
      const inoCharacter = characters.find((row) => row.name === 'Ino')!.id
      await sql`
        insert into inventory_items (character_id, item_id, equipped_slot)
        values (${inoCharacter}, 'i290117', 'Outfit')`
      await migrateTo()
    }, SLOW)

    afterAll(() => sql.end())

    it("wears each ninja's clothing as its lowest-level outfit item in set I, once", async () => {
      const outfits = await sql`
        select c.name, i.item_id, i.bound, i.equipped_set, i.location, i.wardrobe_slot
        from inventory_items i join characters c on c.id = i.character_id
        where i.equipped_slot = 'Outfit' order by c.name`
      const worn = { equipped_set: 1, location: 'bag', wardrobe_slot: null }
      expect(outfits).toEqual([
        { name: 'Gin', item_id: 'i290003', bound: true, ...worn },
        // Already wearing an outfit in set I: left alone.
        { name: 'Ino', item_id: 'i290117', bound: false, ...worn },
        { name: 'Kiba', item_id: 'i2940180', bound: true, ...worn },
      ])
      expect(
        await sql`select count(*)::int as n from characters where visual_clothing is not null`,
      ).toEqual([{ n: 0 }])
    })
  })
})
