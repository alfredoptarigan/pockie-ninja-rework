// Usage (from server/): tsx --env-file-if-exists=../.env scripts/grant-zanpakuto.ts <ninja> <iid> [count]
// Grants Zanpakuto crystals (iid 480001-480086, one rolled stat each) to the named ninja's spirit
// inventory with grantZanpakutoCrystal: the stand-in for Impel Down drops in local play and e2e.
// Refuses to run in production.
import { createRandom } from '@pockie/game-core'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { crystalInfo } from '../../game-core/src/zanpakuto/zanpakuto.js'
import { createDb } from '../src/db/client.js'
import { characters } from '../src/db/schema.js'
import { loadEnv } from '../src/env.js'
import { grantZanpakutoCrystal } from '../src/modules/zanpakuto/view.js'

const env = loadEnv()
const [name, iidText, countText = '1'] = process.argv.slice(2)
const iid = Number(iidText)
const count = Number(countText)
if (env.NODE_ENV === 'production') {
  console.error('grant-zanpakuto refuses to run with NODE_ENV=production.')
  process.exit(1)
}
if (!name || !crystalInfo(iid) || !Number.isInteger(count) || count < 1 || count > 16) {
  console.error('Usage: grant-zanpakuto.ts <ninja> <iid 480001-480086> [count 1-16]')
  process.exit(1)
}

const { db, close } = createDb(env.DATABASE_URL)
try {
  const granted = await db.transaction(async (tx) => {
    const [character] = await tx
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.name, name))
      .for('update')
    if (!character) throw new Error(`No ninja named ${name}.`)
    const random = createRandom(randomInt(2 ** 31))
    let total = 0
    for (let i = 0; i < count; i++)
      if (await grantZanpakutoCrystal(tx, character.id, iid, random)) total++
    return total
  })
  console.log(`Granted ${granted} x ${crystalInfo(iid)!.name} to ${name}.`)
} finally {
  await close()
}
