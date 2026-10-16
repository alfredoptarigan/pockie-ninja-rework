import { OUTFIT_MAX_TIER } from '@pockie/shared'

// Reborn-only outfits: clothing absent from the 2011 tables. Their internal AvatarIDs must not
// collide with 2011's (clothing + 100 * plus, so 170 is clothing 70 +1) or with each other.
interface RebornOnlyOutfit {
  clothing: number
  /** AvatarID of +0; +N is avatar + N. */
  avatar: number
  ultimate: number
  /** 2011 avatar-stats row lending the fields Reborn's ISV / BMV / Weapon Type do not set. */
  statsRow: number
}

export const MADARA_CLOTHING = 170
export const MADARA_AVATAR = 50170
export const MADARA_ULTIMATE = 2270
export const HASHIRAMA_CLOTHING = 188
export const HASHIRAMA_AVATAR = 51188
export const HASHIRAMA_ULTIMATE = 2288

export const REBORN_ONLY_OUTFITS: RebornOnlyOutfit[] = [
  // Itachi Uchiha's row.
  { clothing: MADARA_CLOTHING, avatar: MADARA_AVATAR, ultimate: MADARA_ULTIMATE, statsRow: 49 },
  // 2nd Hokage's row.
  {
    clothing: HASHIRAMA_CLOTHING,
    avatar: HASHIRAMA_AVATAR,
    ultimate: HASHIRAMA_ULTIMATE,
    statsRow: 50,
  },
]

export const rebornOnlyOfClothing = (clothing: number) =>
  REBORN_ONLY_OUTFITS.find((o) => o.clothing === clothing)
/** The Reborn-only outfit an AvatarID belongs to, if any. */
export const rebornOnlyOfAvatar = (avatarId: number) =>
  Number.isInteger(avatarId)
    ? REBORN_ONLY_OUTFITS.find(
        (o) => avatarId >= o.avatar && avatarId <= o.avatar + OUTFIT_MAX_TIER,
      )
    : undefined
export const rebornOnlyOfUltimate = (skillId: number) =>
  REBORN_ONLY_OUTFITS.find((o) => o.ultimate === skillId)

export const rebornOnlyItemId = (clothing: number, plus: number) =>
  plus === 0 ? `i290${clothing}` : `i29${rebornOnlyOfClothing(clothing)!.avatar + plus}0`
export const madaraItemId = (plus: number) => rebornOnlyItemId(MADARA_CLOTHING, plus)
export const MADARA_ITEM = madaraItemId(0)

const baseItem = {
  BindingType: 2,
  CanDrop: 1,
  // shortcut: tiers are wearable, but synthesis stays disabled until its recipes are imported.
  CanMelting: 0,
  CanTrade: 3,
  CanUse: 1,
  ItemColor: 2,
  ItemMaxFoldNum: 1,
  ItemShapeType: 4,
  ItemType: 2,
  JudgeValueScore: 42,
  Price: 1000,
  Sex: 0,
  UseLevel: 1,
  UsePopsinger: -1,
  class: 'AvatarItem',
}

export const rebornOnlyItems = Object.fromEntries(
  REBORN_ONLY_OUTFITS.flatMap(({ clothing, avatar }) =>
    Array.from({ length: OUTFIT_MAX_TIER + 1 }, (_, plus) => [
      rebornOnlyItemId(clothing, plus),
      {
        ...baseItem,
        AvatarID: avatar + plus,
        AvatarLevel: plus + 1,
        Clothing: clothing,
        Name: `avatar${clothing}`,
        ResourceID: `Icon_Avatar_Cloth${clothing}`,
      },
    ]),
  ),
)

export const rebornOnlyUltimate = (skillId: number) => ({
  type: 1,
  quomodo: 1,
  probability: 100,
  effect: 1,
  decmp: 0,
  canbecounter: 0,
  level: 1,
  secondid: skillId,
  skillvalue: 100,
  javascript: `skill/skill_aoyi_${skillId}.js`,
  skilladdtype: 0,
})
