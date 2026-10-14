// Wing enhancement and collection numbers (M6 decisions 24 and 25). The rates are ours.

export const WING_MAX_LEVEL = 30

/** Success chance (%) by target level: up to `upTo`, inclusive. */
export const SUCCESS_BY_TARGET = [
  { upTo: 5, success: 100 },
  { upTo: 10, success: 80 },
  { upTo: 15, success: 60 },
  { upTo: 20, success: 40 },
  { upTo: 25, success: 25 },
  { upTo: 30, success: 15 },
] as const

/** How a failed attempt ends (% of failures) by current level: from `from`, inclusive. */
export const FAILURE_BY_LEVEL = [
  { from: 20, fail: 50, decrease: 30, reset: 15, destroy: 5 },
  { from: 10, fail: 70, decrease: 30, reset: 0, destroy: 0 },
  { from: 0, fail: 100, decrease: 0, reset: 0, destroy: 0 },
] as const

/** Plume Shards (218021) paid once per registered wing or aura. */
export const COLLECTION_REWARD_ITEM = 'i218021'
export const COLLECTION_REWARD_LOW = 5
export const COLLECTION_REWARD_HIGH = 10
/** Wings 218000-218008 pay the low reward; later wings and the auras pay the high one. */
export const collectionReward = (itemId: string) =>
  Number(itemId.slice(1)) <= 218008 ? COLLECTION_REWARD_LOW : COLLECTION_REWARD_HIGH
