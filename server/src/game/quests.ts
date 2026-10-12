// Quest progress rules ported from TaskModule (KillMonsterRule, CollectRule); see
// docs/original-data/quests-items.md. Progress is one count per sub-task, indexed by SetpSeq.
import type { Random } from '@pockie/game-core'
import type { QuestRewards, RewardItem } from '@pockie/shared'
import { itemNameKey, npcOfferedTaskIds, subTasks, task, taskMonsterDrops } from './data.js'

export interface QuestProgress {
  taskId: number
  state: number
  progress: number[]
}

const KILL = 2
const COMPLETED = 2
const COLLECT = 1
const ACTIVE = 0
const READY = 1

const isComplete = (taskId: number, progress: number[]) =>
  subTasks(taskId).every(
    (step) => (progress[Number(step.SetpSeq)] ?? 0) >= Number(step.TargetRequireNum),
  )

function advance(
  quests: QuestProgress[],
  matches: (step: ReturnType<typeof subTasks>[number]) => boolean,
): QuestProgress[] {
  const changed: QuestProgress[] = []
  for (const quest of quests) {
    if (quest.state !== ACTIVE) continue
    const progress = [...quest.progress]
    let touched = false
    for (const step of subTasks(quest.taskId)) {
      const index = Number(step.SetpSeq)
      const target = Number(step.TargetRequireNum)
      if (matches(step) && (progress[index] ?? 0) < target) {
        progress[index] = (progress[index] ?? 0) + 1
        touched = true
      }
    }
    if (touched) {
      changed.push({
        taskId: quest.taskId,
        progress,
        state: isComplete(quest.taskId, progress) ? READY : ACTIVE,
      })
    }
  }
  return changed
}

const inScene = (step: ReturnType<typeof subTasks>[number], sceneId: number) =>
  Number(step.SubmitSceneID) === sceneId || Number(step.SubmitSceneID) === -1

/** A monster kill counts for active kill steps targeting it in this scene. */
export function recordKill(quests: QuestProgress[], monsterId: string, sceneId: number) {
  return advance(
    quests,
    (step) =>
      Number(step.SubTaskType) === KILL &&
      step.TargetConfiger === monsterId &&
      inScene(step, sceneId),
  )
}

/** Quest items (TaskMonsterDrop.ini) only drop while a matching collect step is unfinished. */
export function questItemDrops(
  quests: QuestProgress[],
  monsterId: string,
  sceneId: number,
  random: Random,
) {
  const items: string[] = []
  for (const quest of quests) {
    if (quest.state !== ACTIVE) continue
    const open = subTasks(quest.taskId).filter(
      (step) =>
        Number(step.SubTaskType) === COLLECT &&
        (quest.progress[Number(step.SetpSeq)] ?? 0) < Number(step.TargetRequireNum),
    )
    for (const drop of taskMonsterDrops(quest.taskId)) {
      const wanted = open.some((step) => step.TargetItem === drop.TaskItemConfig)
      if (
        wanted &&
        drop.MonsterConfig === monsterId &&
        Number(drop.SceneID) === sceneId &&
        random.int(100) < Number(drop.DropProbability)
      ) {
        items.push(String(drop.TaskItemConfig))
      }
    }
  }
  return items
}

/** A collected quest item counts for active collect steps that want it. */
export function recordCollect(quests: QuestProgress[], itemId: string) {
  return advance(
    quests,
    (step) => Number(step.SubTaskType) === COLLECT && step.TargetItem === itemId,
  )
}

const TALK = 3
const COMMAND = 8

/** Talking to an NPC counts for active talk steps that target it in this scene. */
export function recordTalk(quests: QuestProgress[], npcId: string, sceneId: number) {
  return advance(
    quests,
    (step) =>
      Number(step.SubTaskType) === TALK && step.TargetConfiger === npcId && inScene(step, sceneId),
  )
}

/** Items an NPC hands out in a talk step (TargetCondition 1 with a TargetItem). */
export function talkItems(quests: QuestProgress[], npcId: string) {
  return quests
    .filter((quest) => quest.state === ACTIVE)
    .flatMap((quest) => subTasks(quest.taskId))
    .filter(
      (step) =>
        Number(step.SubTaskType) === TALK &&
        step.TargetConfiger === npcId &&
        Number(step.TargetCondition) === 1 &&
        String(step.TargetItem).startsWith('i'),
    )
    .map((step) => String(step.TargetItem))
}

/** Rookie commands (CommandRule.java): 8888 use item, 8887 equip weapon, ... */
export const USE_ITEM_COMMAND = 8888
export const EQUIP_WEAPON_COMMAND = 8887
/** Sent by RoleUseSystem.OnCustomBuy after a pouch refill purchase. */
export const BUY_POUCH_COMMAND = 2118

/** What the player does for a rookie command step, for the client to point at (bag, weapon). */
export function stepCommand(step: ReturnType<typeof subTasks>[number]) {
  if (Number(step.SubTaskType) !== COMMAND) return {}
  const condition = Number(step.TargetCondition)
  if (condition === EQUIP_WEAPON_COMMAND) return { command: 'equip' as const }
  if (condition === USE_ITEM_COMMAND && String(step.TargetItem).startsWith('i')) {
    return { command: 'use' as const, itemId: String(step.TargetItem) }
  }
  return {}
}

export function recordCommand(
  quests: QuestProgress[],
  command: number,
  sceneId: number,
  itemId?: string,
) {
  return advance(
    quests,
    (step) =>
      Number(step.SubTaskType) === COMMAND &&
      Number(step.TargetCondition) === command &&
      (!String(step.TargetItem).startsWith('i') || step.TargetItem === itemId) &&
      inScene(step, sceneId),
  )
}

/**
 * Why the character cannot take quest `taskId` yet (TaskSystem accept checks: held, previous quest,
 * level, village), or undefined when they can. Where the quest giver stands is checked on accept.
 */
export function questLock(
  taskId: number,
  character: { level: number; nation: number },
  quests: QuestProgress[],
  daily = false,
): { code: string; message: string } | undefined {
  const row = task(taskId)
  if (!row) return { code: 'unknown_quest', message: 'Unknown quest.' }
  // DayTaskSystem.OnCustomAcceptDayTask: daily quests must come from the daily board.
  if (Number(row.TaskBaseType) === 2 && !daily)
    return { code: 'daily_quest', message: 'Open Daily Quests to accept this quest.' }
  if (quests.some((q) => q.taskId === taskId)) {
    return { code: 'already_taken', message: 'You already have that quest.' }
  }
  const pre = Number(row.PreTaskID)
  if (pre > 0 && !quests.some((q) => q.taskId === pre && q.state === COMPLETED)) {
    return { code: 'locked', message: 'Finish the previous quest first.' }
  }
  const nation = Number(row.RequireCountry)
  if (
    character.level < Number(row.RequireLevel) ||
    (nation !== -1 && nation !== character.nation)
  ) {
    return { code: 'locked', message: 'You cannot take this quest yet.' }
  }
  return undefined
}

/** Quests the character can take from an NPC right now, with the NPC and the scene. */
export function availableQuests(
  character: { level: number; nation: number },
  quests: QuestProgress[],
) {
  return npcOfferedTaskIds()
    .filter((taskId) => !questLock(taskId, character, quests))
    .map((taskId) => {
      const row = task(taskId)!
      return {
        taskId,
        npcId: String(row.AcceptNpcConfig),
        sceneId: Number(row.AcceptNpcSceneID),
        nameKey: `lg_Task_${taskId}`,
        talkKey: row.StartNpcMessageID ? `lg_${String(row.StartNpcMessageID)}` : null,
        rewards: questRewards(taskId),
      }
    })
}

/** Capital types in Task.ini RewardMoney ("type,amount;..."): 0 Stone, 2 Gold, 3 Gift Coupon. */
const CURRENCY = { 0: 'stone', 2: 'gold', 3: 'giftCoupon' } as const

/** Item ids (one per unit) as item stacks with counts, in first-seen order. */
export function countItems(itemIds: string[]): RewardItem[] {
  const counts = new Map<string, number>()
  for (const id of itemIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts].map(([itemId, count]) => ({ itemId, count, nameKey: itemNameKey(itemId) }))
}

/**
 * What quest `taskId` pays (Task.ini RewardExp, RewardMoney, RewardHono, RewardItem), as the
 * original quest window (UI_Task) lists it. RewardDropID quests pay a random pick instead, which
 * the window does not show.
 */
export function questRewards(taskId: number): QuestRewards {
  const row = task(taskId)!
  const money = { stone: 0, gold: 0, giftCoupon: 0 }
  for (const part of String(row.RewardMoney).split(';')) {
    const [type = '', amount = '0'] = part.split(',')
    const column = CURRENCY[Number(type) as keyof typeof CURRENCY]
    if (column) money[column] += Number(amount)
  }
  const items = String(row.RewardItem).startsWith('i')
    ? String(row.RewardItem)
        .split(';')
        .map((part) => {
          const [itemId = '', count = '1'] = part.split(',')
          return { itemId, count: Number(count), nameKey: itemNameKey(itemId) }
        })
    : []
  return {
    exp: Number(row.RewardExp ?? 0),
    ...money,
    honor: Number(row.RewardHono ?? 0),
    items,
  }
}
