// The live ranking lists of decision 13 (pvp-rankings.md 8), read straight from the tables with
// their ranking indexes. Each query returns the top 100 in place order. Tie rules (stable, so a
// place never flips between two requests):
//   level      level desc, EXP desc, then the older ninja (created_at), then id
//   stone      Stone desc, then the older ninja, then id
//   lasNoches  best floor desc (floor 0 is not ranked), then character id (no time is stored)
//   arena      tier desc, score desc, then the earlier score time (decision 12), then id;
//              ninjas without an arena row are not ranked
import { RANKING_SIZE, type RankingKey, type RankingRow } from '@pockie/shared'
import { asc, desc, eq, gt } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { arenaPlayers, characters, singleGate } from '../../db/schema.js'

/** A ranked row before places are numbered. */
type Entry = Omit<RankingRow, 'place'> & { characterId: string }

const ninja = {
  characterId: characters.id,
  name: characters.name,
  level: characters.level,
  nation: characters.nation,
}

const QUERIES: Record<RankingKey, (db: Db) => Promise<Entry[]>> = {
  level: (db) =>
    db
      .select({ ...ninja, value: characters.exp })
      .from(characters)
      .orderBy(
        desc(characters.level),
        desc(characters.exp),
        asc(characters.createdAt),
        asc(characters.id),
      )
      .limit(RANKING_SIZE),
  stone: (db) =>
    db
      .select({ ...ninja, value: characters.stone })
      .from(characters)
      .orderBy(desc(characters.stone), asc(characters.createdAt), asc(characters.id))
      .limit(RANKING_SIZE),
  lasNoches: (db) =>
    db
      .select({ ...ninja, value: singleGate.bestFloor })
      .from(singleGate)
      .innerJoin(characters, eq(characters.id, singleGate.characterId))
      .where(gt(singleGate.bestFloor, 0))
      .orderBy(desc(singleGate.bestFloor), asc(singleGate.characterId))
      .limit(RANKING_SIZE),
  arena: async (db) => {
    const rows = await db
      .select({ ...ninja, score: arenaPlayers.score, tier: arenaPlayers.tier })
      .from(arenaPlayers)
      .innerJoin(characters, eq(characters.id, arenaPlayers.characterId))
      .orderBy(
        desc(arenaPlayers.tier),
        desc(arenaPlayers.score),
        asc(arenaPlayers.scoreAt),
        asc(arenaPlayers.characterId),
      )
      .limit(RANKING_SIZE)
    // CompeteScore is shown / 100.
    return rows.map(({ score, ...row }) => ({ ...row, value: Math.floor(score / 100) }))
  },
}

/** The top 100 of a list, numbered from place 1. */
export async function rankingList(db: Db, key: RankingKey) {
  const entries = await QUERIES[key](db)
  return entries.map((entry, index) => ({ ...entry, place: index + 1 }))
}
