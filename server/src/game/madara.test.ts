import { OUTFIT_MAX_TIER, OUTFIT_STARS } from '@pockie/shared'
import {
  HASHIRAMA_AVATAR,
  HASHIRAMA_CLOTHING,
  madaraItemId,
  MADARA_AVATAR,
  rebornOnlyItemId,
} from './madara.js'
import { outfitOf, outfitIsv, outfitBonuses } from './outfit.js'
import { expect, it } from 'vitest'
import { avatarStats, outfitForClothing, itemNameKey, outfitOfAvatar } from './data.js'
import { playerFighterFrom } from './combat.js'
import { BOSSES } from '../modules/dungeons/bosses.js'
import { HASHIRAMA_PLACEHOLDERS } from '../modules/hashirama/config.js'

it('uses Madara’s own wearable outfit and appearance for the player and bosses', () => {
  const outfit = outfitForClothing(170)
  expect(outfit.itemId).toBe('i290170')
  expect(itemNameKey(outfit.itemId)).not.toBe('lg_avatar49')
  expect(avatarStats(outfit.avatarId)).toMatchObject({
    StrengthUp: 290,
    AgilityUp: 310,
    StaminaUp: 200,
  })
  expect(BOSSES.find((boss) => boss.name === 'Madara Uchiha')?.clothing).toBe(170)
  expect(HASHIRAMA_PLACEHOLDERS.leaders.madara.clothing).toBe(170)
})

it('keeps Madara’s internal avatar id separate from the outfit enhancement level', () => {
  const { avatarId } = outfitForClothing(170)
  expect(outfitOfAvatar(avatarId)).toMatchObject({ clothing: 170, tier: 0 })
  const fighter = playerFighterFrom(
    { name: 'Madara', avatarId, level: 90, gender: 0, nation: 0, hp: 100, mp: 100 },
    [],
  )
  expect(fighter.avatarLevel).toBe(0)
  expect(fighter.skills?.find((skill) => skill.id === 2270)?.javascript).toBe(
    'skill/skill_aoyi_2270.js',
  )
})

it('supports Madara at max tier and stars without changing his clothing or ultimate', () => {
  const id = madaraItemId(OUTFIT_MAX_TIER)
  expect(outfitOf(id)).toMatchObject({ clothing: 170, plus: 32, avatarId: MADARA_AVATAR + 32 })
  const stats = avatarStats(MADARA_AVATAR + 32)
  expect(stats.Strength).toBe((20 + 8 * 32) * 290)
  expect(outfitIsv(id)?.max).toEqual([319, 341, 220])
  const bonuses = outfitBonuses(
    { itemId: id, stars: OUTFIT_STARS.maxStars, isv: [319, 341, 220] },
    90,
  )
  expect(bonuses.strength).toBeGreaterThan(0)
  const fighter = playerFighterFrom(
    {
      name: 'Madara',
      avatarId: MADARA_AVATAR + 32,
      level: 90,
      gender: 0,
      nation: 0,
      hp: 100,
      mp: 100,
    },
    [{ itemId: id, stars: 5 }],
  )
  expect(fighter.avatarLevel).toBe(32)
  expect(fighter.secretThreshold).toBe(20)
  expect(fighter.skills?.some((skill) => skill.id === 2270)).toBe(true)
})

it('gives Hashirama his own Sharp outfit, apart from Madara’s avatar ids', () => {
  const outfit = outfitForClothing(HASHIRAMA_CLOTHING)
  expect(outfit).toEqual({ itemId: 'i290188', avatarId: HASHIRAMA_AVATAR })
  expect(outfitOfAvatar(MADARA_AVATAR + 18)?.clothing).toBe(170)
  const id = rebornOnlyItemId(HASHIRAMA_CLOTHING, OUTFIT_MAX_TIER)
  expect(outfitOf(id)).toMatchObject({ clothing: 188, plus: 32 })
  const stats = avatarStats(HASHIRAMA_AVATAR + 32)
  expect(stats).toMatchObject({ StrengthUp: 335, AgilityUp: 125, StaminaUp: 340, Popsinger: 2 })
  expect(HASHIRAMA_PLACEHOLDERS.leaders.hashirama.clothing).toBe(188)
  const fighter = playerFighterFrom(
    {
      name: 'Hashirama',
      avatarId: HASHIRAMA_AVATAR + 32,
      level: 90,
      gender: 0,
      nation: 0,
      hp: 100,
      mp: 100,
    },
    [{ itemId: id, stars: 5 }],
  )
  expect(fighter.avatarLevel).toBe(32)
  expect(fighter.skills?.find((skill) => skill.id === 2288)?.javascript).toBe(
    'skill/skill_aoyi_2288.js',
  )
})
