// Reborn level-one scroll states. Timeline units are 100 per second.
import type { BuffDef } from '../buffs.js'
import type { ActiveBuff, Fighter } from '../types.js'

export const SCROLL_BUFF = {
  izanagi: 15001,
  izanami: 15002,
  kirin: 15003,
  sprenger: 15004,
  sand: 15005,
  earth: 15006,
  cremation: 15008,
  hollowUses: 15009,
  fireVulnerability: 15010,
  burn: 15011,
} as const

const state = (hooks: Partial<BuffDef> = {}): BuffDef => ({
  type: 1,
  replace: 0,
  clearType: 0,
  lifeTime: -1,
  validity: 1,
  ...hooks,
})
const restore = (self: Fighter, buff: ActiveBuff) => {
  const gained = Math.min(self.maxHp - self.hp, Math.trunc(buff.saveData * 0.7))
  self.hp += gained
  return gained
}

export const SCROLL_BUFFS: Record<number, BuffDef> = {
  [SCROLL_BUFF.izanagi]: state({
    replace: SCROLL_BUFF.izanagi,
    incomingDamage: () => 0.5,
    outgoingDamage: (_buff, element) => (element === 8 ? 1.13 : 1),
  }),
  [SCROLL_BUFF.izanami]: state({
    lifeTime: 2000,
    onDamage: (_self, buff, amount) => {
      buff.saveData += amount
    },
    pendingRevive: (buff) => buff.saveData > 0,
    onRemove: (_ctx, self, buff, fv, timer) => {
      // Duel cleanup uses timer zero and must never heal or resurrect.
      if (timer <= buff.startTime + 2000) return
      fv.incHp = (fv.incHp ?? 0) + restore(self, buff)
    },
  }),
  [SCROLL_BUFF.kirin]: state({
    replace: SCROLL_BUFF.kirin,
    outgoingDamage: (_buff, element) => (element === 3 ? 1.5 : 1),
  }),
  [SCROLL_BUFF.sprenger]: state({
    negative: true,
    preventsRevive: true,
    outgoingDamage: (buff) => 1 - 0.17 * buff.saveData,
    healingMultiplier: (buff) => 1 - 0.17 * buff.saveData,
  }),
  [SCROLL_BUFF.sand]: state({
    negative: true,
    replace: SCROLL_BUFF.sand,
    onAdd: (ctx, self) => ctx.changeAtkTime(self, self.atkTimeMul - 60, self.atkTimeAdd),
    onRemove: (ctx, self) => ctx.changeAtkTime(self, self.atkTimeMul + 60, self.atkTimeAdd),
  }),
  [SCROLL_BUFF.earth]: state({
    replace: SCROLL_BUFF.earth,
    outgoingDamage: (_buff, element) => (element === 2 ? 1.15 : 1),
  }),
  [SCROLL_BUFF.cremation]: state({
    replace: SCROLL_BUFF.cremation,
    onAdd: (_ctx, self, buff) => {
      self.neglectDefense += buff.saveData
    },
    onRemove: (_ctx, self, buff) => {
      self.neglectDefense -= buff.saveData
    },
  }),
  [SCROLL_BUFF.hollowUses]: state(),
  [SCROLL_BUFF.fireVulnerability]: state({
    negative: true,
    incomingDamage: (buff, element) => (element === 0 ? 1 + 0.05 * buff.saveData : 1),
  }),
  [SCROLL_BUFF.burn]: state({
    type: 2,
    negative: true,
    undispellable: true,
    replace: SCROLL_BUFF.burn,
    onActivation: (ctx, self, buff, fv, timer) => {
      ctx.damageWithValue(self, buff.saveData, fv, timer)
      fv.selfDamage = buff.saveData
      buff.saveData1 = (buff.saveData1 ?? 0) - 1
      if (buff.saveData1 <= 0) ctx.removeBuff(self, buff.id, timer, fv)
    },
  }),
}
