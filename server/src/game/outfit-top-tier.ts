// Reborn's outfits go to +32 (serverConfig synthesisLevelUpRates[0] has 32 steps, its star rule
// needs +32); 2011's tables stop at +31 (AvatarLevel 32). Each +32 is its +31 one +N up, under the
// id 2011's own EquipCompose.ini already targets (i2931010 + High Purify -> i2932010). Its stats
// come from Reborn's formula (data.ts rebornOutfitStats), so the 2011 rows it copies only hold
// skills, recast bounds and the like. See docs/audit/reborn-outfit-pet-re.md.
import { OUTFIT_MAX_TIER } from '@pockie/shared'

type Value = number | string | (number | string)[]
type Row = Record<string, Value>

/** AvatarLevel is +N + 1: 2011's top (+31) is AvatarLevel 32, Reborn's +32 is 33. */
const avatarLevel = (plus: number) => plus + 1
/** 2011 numbers AvatarIDs by +N: clothing 1-100 in steps of 100, 101-120 from 4001 in steps of 20. */
const CLOTHING_101_FROM = 4001
const tierStep = (avatarId: number) => (avatarId >= CLOTHING_101_FROM ? 20 : 100)
/** 2011's item id from AvatarID 1901 up: i29<AvatarID>0 (i2931010 is AvatarID 3101). */
const highOutfitItemId = (avatarId: number) => `i29${avatarId}0`

/**
 * The +32 AvatarItem rows and the +31 rows they replace as the top (they now synthesize on), and
 * which +31 item each +32 copies.
 */
export function topTierOutfits(items: Record<string, Row>) {
  const rows: Record<string, Row> = {}
  const sources = new Map<string, string>()
  for (const [id, row] of Object.entries(items)) {
    if (row.class !== 'AvatarItem' || Number(row.AvatarLevel) !== avatarLevel(OUTFIT_MAX_TIER - 1))
      continue
    const avatarId = Number(row.AvatarID) + tierStep(Number(row.AvatarID))
    const top = highOutfitItemId(avatarId)
    if (top in items) throw new Error(`Outfit +32 id ${top} is taken`)
    rows[id] = { ...row, CanMelting: 1 }
    rows[top] = {
      ...row,
      AvatarID: avatarId,
      AvatarLevel: avatarLevel(OUTFIT_MAX_TIER),
      Name: `avatar${avatarId}`,
    }
    sources.set(top, id)
  }
  return { rows, sources }
}

/**
 * 2011's recipes from +31: two +0 copies made nothing (Target 0) at Reborn's 17%, so they now make
 * the +32; High Purify Stones made the +32, which Reborn's text limits to +21..+31, so they now
 * make nothing.
 */
export function topTierRecipes<T extends { Src1: string; Target: string | number }>(
  recipes: Record<string, T>,
  sources: Map<string, string>,
) {
  const topOf = new Map([...sources].map(([top, from]) => [from, top]))
  return Object.fromEntries(
    Object.entries(recipes).map(([id, recipe]) => {
      const top = topOf.get(recipe.Src1)
      if (!top) return [id, recipe]
      return [id, { ...recipe, Target: recipe.Target === 0 ? top : 0 }]
    }),
  )
}
