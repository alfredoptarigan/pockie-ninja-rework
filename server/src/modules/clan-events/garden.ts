// Ninja Garden (Reborn's `Gh` / Ninjutsu Garden, reborn-windows-M-Z-hud.md): each clan member's
// nine plots. Plot 1 is open, the others cost 250 Gift Certificates. Two plantings a day (reset at
// midnight UTC; scrolls cannot skip it); a tree grows 2-6 hours by level, then its harvest gives
// Clan Points (contribution and clan EXP) plus Bankai Coins (Money) or Bankai EXP (Zenpakuto), and
// the plot rests (1 scroll skips the rest). Random Level (25 GC / 25,000 Stones) and Level Up Tree
// (250 GC / 5 Gold) set the level the next tree is planted at. The caller holds the clan lock
// (lockClanOf: character, then clan), then this takes the garden row.
import { createRandom } from '@pockie/game-core'
import { eq } from 'drizzle-orm'
import {
  GARDEN_RULES,
  HOME_PLACEHOLDERS,
  treeLevel,
  type GardenHarvest,
  type GardenView,
  type TreeType,
} from '../../../../shared/src/schemas/home.js'
import type { Db } from '../../db/client.js'
import { clanGardens } from '../../db/schema.js'
import { weightedIndex } from '../../game/explore.js'
import type { Tx } from '../../game/progress.js'
import { HttpError } from '../../http.js'
import type { ClanContext } from '../clans/clans.js'
import { nextDay } from '../events/view.js'
import { bad, newSeed, utcDay } from '../gates/common.js'
import { weekStart } from '../rankings/toll-gate-weekly.js'
import { addBankai, addClanPoints, clanLevelView, pay, readProgress } from './level.js'

type GardenRow = typeof clanGardens.$inferSelect
type Plot = GardenRow['plots'][number]

const HOUR_MS = 3_600_000
const COOLDOWN_MS = HOME_PLACEHOLDERS.gardenCooldownMinutes * 60_000
const { plots: PLOTS, dailyPlants, maxScrolls, maxLevel } = GARDEN_RULES

/** Nine plots whatever the stored array holds; plot 1 starts unlocked. */
const plotsOf = (row: Pick<GardenRow, 'plots'> | undefined): Plot[] =>
  Array.from(
    { length: PLOTS },
    (_, i) => row?.plots[i] ?? { unlocked: i === 0, tree: null, cooldownUntil: 0 },
  )

/** Scrolls refill every Monday (HOME_PLACEHOLDERS.gardenScrollsRefillWeekly). */
const scrollsOf = (row: GardenRow | undefined, now: Date) =>
  row && row.scrollsWeek === weekStart(now) ? row.scrolls : maxScrolls

const plantsOf = (row: GardenRow | undefined, now: Date) =>
  row && row.plantDay === utcDay(now) ? row.plants : 0

export async function gardenView(
  db: Tx | Db,
  ctx: { characterId: string; clanId: string; clanLevel: number },
  now = new Date(),
): Promise<GardenView> {
  const [row] = await db
    .select()
    .from(clanGardens)
    .where(eq(clanGardens.characterId, ctx.characterId))
  const progress = await readProgress(db, ctx.clanId)
  return {
    serverNow: now.getTime(),
    plots: plotsOf(row).map((plot) => ({
      locked: !plot.unlocked,
      tree: plot.tree,
      cooldownUntil: plot.cooldownUntil > now.getTime() ? plot.cooldownUntil : 0,
    })),
    scrolls: scrollsOf(row, now),
    plantsToday: plantsOf(row, now),
    resetAt: Date.parse(nextDay(now)),
    pendingLevel: row?.pendingLevel ?? 1,
    clan: clanLevelView(ctx.clanLevel, progress?.exp ?? 0),
  }
}

async function lockGarden(tx: Tx, characterId: string) {
  await tx.insert(clanGardens).values({ characterId }).onConflictDoNothing()
  const [row] = await tx
    .select()
    .from(clanGardens)
    .where(eq(clanGardens.characterId, characterId))
    .for('update')
  return row!
}

const save = (ctx: ClanContext, values: Partial<GardenRow>) =>
  ctx.tx.update(clanGardens).set(values).where(eq(clanGardens.characterId, ctx.me.id))

const withPlot = (plots: Plot[], index: number, plot: Plot) =>
  plots.map((p, i) => (i === index ? plot : p))

const stale = () => new HttpError(409, 'stale_level', 'The tree level changed. Please try again.')

export async function unlockPlot(ctx: ClanContext, index: number) {
  const row = await lockGarden(ctx.tx, ctx.me.id)
  const plots = plotsOf(row)
  if (plots[index]!.unlocked) throw bad('unlocked', 'This plot is already unlocked.')
  await pay(ctx, 'giftCoupon', GARDEN_RULES.unlockCost)
  await save(ctx, { plots: withPlot(plots, index, { ...plots[index]!, unlocked: true }) })
}

export async function plantTree(
  ctx: ClanContext,
  index: number,
  level: number,
  type: TreeType,
  now: Date,
) {
  const row = await lockGarden(ctx.tx, ctx.me.id)
  const plots = plotsOf(row)
  const plot = plots[index]!
  if (!plot.unlocked) throw bad('locked', 'Unlock this plot first.')
  if (plot.tree) throw bad('plot_busy', 'A tree already grows here.')
  if (plot.cooldownUntil > now.getTime()) throw bad('cooldown', 'Plot is on Cooldown.')
  const plants = plantsOf(row, now)
  if (plants >= dailyPlants)
    throw bad('daily_limit', `Plant limit reached (${plants}/${dailyPlants} today).`)
  if (level !== row.pendingLevel) throw stale()
  const tree = { type, level, readyAt: now.getTime() + treeLevel(type, level).hours * HOUR_MS }
  await save(ctx, {
    plots: withPlot(plots, index, { ...plot, tree, cooldownUntil: 0 }),
    plantDay: utcDay(now),
    plants: plants + 1,
    pendingLevel: 1,
  })
}

export async function harvestTree(ctx: ClanContext, index: number, now: Date) {
  const row = await lockGarden(ctx.tx, ctx.me.id)
  const plots = plotsOf(row)
  const { tree } = plots[index]!
  if (!tree) throw bad('plot_empty', 'Nothing grows on this plot.')
  if (tree.readyAt > now.getTime()) throw bad('not_ready', 'The tree is still growing.')
  const reward = treeLevel(tree.type, tree.level)
  await save(ctx, {
    plots: withPlot(plots, index, {
      ...plots[index]!,
      tree: null,
      cooldownUntil: now.getTime() + COOLDOWN_MS,
    }),
  })
  await addBankai(ctx.tx, ctx.me.id, reward.coins, reward.bankaiExp)
  await addClanPoints(ctx, reward.clanPoints, now)
  const harvest: GardenHarvest = {
    type: tree.type,
    level: tree.level,
    clanHonor: reward.clanPoints,
    coins: reward.coins,
    bankaiExp: reward.bankaiExp,
  }
  return harvest
}

/** "Plot is on Cooldown": 1 scroll ends the rest. */
export async function skipCooldown(ctx: ClanContext, index: number, now: Date) {
  const row = await lockGarden(ctx.tx, ctx.me.id)
  const plots = plotsOf(row)
  const plot = plots[index]!
  if (plot.tree || plot.cooldownUntil <= now.getTime())
    throw bad('no_cooldown', 'This plot is not on cooldown.')
  const scrolls = scrollsOf(row, now)
  if (scrolls < 1) throw bad('no_scrolls', 'You have no Garden Scrolls left.')
  await save(ctx, {
    plots: withPlot(plots, index, { ...plot, cooldownUntil: 0 }),
    scrolls: scrolls - 1,
    scrollsWeek: weekStart(now),
  })
}

/** Random Level: a new level 1-5 for the next tree (HOME_PLACEHOLDERS.gardenRerollWeights). */
export async function rerollTree(ctx: ClanContext, payWith: 'gc' | 'stones') {
  await lockGarden(ctx.tx, ctx.me.id)
  if (payWith === 'gc') await pay(ctx, 'giftCoupon', GARDEN_RULES.reroll.gc)
  else await pay(ctx, 'stone', GARDEN_RULES.reroll.stones)
  const weights = [...HOME_PLACEHOLDERS.gardenRerollWeights]
  const level = weightedIndex(weights, createRandom(newSeed())) + 1
  await save(ctx, { pendingLevel: level })
}

/** Level Up Tree: one level up for the next tree; `currentLevel` must be the one shown. */
export async function levelUpTree(ctx: ClanContext, currentLevel: number, payWith: 'gc' | 'gold') {
  const row = await lockGarden(ctx.tx, ctx.me.id)
  if (row.pendingLevel !== currentLevel) throw stale()
  if (currentLevel >= maxLevel) throw bad('max_level', `Already at maximum level ${maxLevel}!`)
  if (payWith === 'gc') await pay(ctx, 'giftCoupon', GARDEN_RULES.levelUp.gc)
  else await pay(ctx, 'gold', GARDEN_RULES.levelUp.gold)
  await save(ctx, { pendingLevel: currentLevel + 1 })
}
