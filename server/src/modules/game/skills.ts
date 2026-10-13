import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client.js'
import { skillResetSchema, skillSlotSchema, skillTreeSchema } from '@pockie/shared'
import { eq } from 'drizzle-orm'
import { characters, characterSkillState } from '../../db/schema.js'
import { resetSkills, setSkillSlot, skillView } from '../../game/skill-bar.js'
import { learnThroughLevel } from '../../game/learning.js'
import { refreshArenaSnapshot } from '../arena/snapshot.js'
import { lockCharacter, requireUser } from './characters.js'
import { loadQuests, saveQuests } from '../../game/progress.js'
import { recordCommand } from '../../game/quests.js'
import { refreshBuffState } from './nonfight-buffs.js'
import { RATE_LIMITS } from './rate-limits.js'

export async function skillRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/skills', { config: { rateLimit: RATE_LIMITS.read } }, async (request) =>
    db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      if (await learnThroughLevel(tx, character)) await refreshArenaSnapshot(tx, character.id)
      return skillView(tx, character.id)
    }),
  )
  const changed = async (tx: Parameters<typeof setSkillSlot>[0], id: string) => {
    const [character] = await tx.select().from(characters).where(eq(characters.id, id))
    return { ...(await skillView(tx, id)), character: await refreshBuffState(tx, character!) }
  }
  app.post('/skills/slot', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const input = skillSlotSchema.parse(request.body)
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      await learnThroughLevel(tx, character)
      await setSkillSlot(tx, character.id, input)
      if (input.skillId !== null) {
        await saveQuests(
          tx,
          character.id,
          recordCommand(await loadQuests(tx, character.id), 2016, character.sceneId),
        )
        const bar = await skillView(tx, character.id)
        if (bar.trees[0]!.every((slot) => slot.skillId !== null))
          await saveQuests(
            tx,
            character.id,
            recordCommand(await loadQuests(tx, character.id), 2116, character.sceneId),
          )
      }
      return changed(tx, character.id)
    })
  })
  app.post('/skills/tree', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { tree } = skillTreeSchema.parse(request.body)
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      await learnThroughLevel(tx, character)
      await tx
        .update(characterSkillState)
        .set({ activeTree: tree })
        .where(eq(characterSkillState.characterId, character.id))
      return changed(tx, character.id)
    })
  })
  app.post('/skills/reset', { config: { rateLimit: RATE_LIMITS.item } }, async (request) => {
    const { currency } = skillResetSchema.parse(request.body ?? {})
    return db.transaction(async (tx) => {
      const character = await lockCharacter(tx, requireUser(request).id)
      await learnThroughLevel(tx, character)
      await resetSkills(tx, character, currency)
      return changed(tx, character.id)
    })
  })
}
