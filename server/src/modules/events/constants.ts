/** The captured client does not expose a replenish limit; allow one purchase per UTC day. */
export const DICE_BUY_LIMIT = 1
/**
 * Weekly task names as Reborn's Weekly Rewards tab shows them (ui__weekly_task_*). Our toll gate
 * and pub fight tasks take the slots of Reborn's Valhalla and Slot Machine, so they keep our names.
 */
export const ACTIVITY_LABELS: Record<string, string> = {
  arenaDuel: 'Duel in Arena',
  duelFriend: 'Duel a friend',
  tollGate: 'Toll Gate',
  pubFight: 'Pub Fight',
  lasNoches: 'Las Noches',
  twentyMinReward: '20 Min Reward',
  globalChat: 'Global Chat',
  mission: 'Complete Mission',
}
