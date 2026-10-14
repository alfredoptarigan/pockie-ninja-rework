// Quest progress rules ported from TaskModule (KillMonsterRule, CollectRule); see
// docs/original-data/quests-items.md. Progress is one count per sub-task, indexed by SetpSeq.
import type { Random } from '@pockie/game-core'
import type { QuestRewards, RewardItem } from '@pockie/shared'
import {
  itemNameKey,
  npcOfferedTaskIds,
  scene,
  sceneSpawns,
  subTasks,
  task,
  taskMonsterDrops,
} from './data.js'

export interface QuestProgress {
  taskId: number
  state: number
  progress: number[]
}

const COMMAND = 8
const KILL = 2
const COMPLETED = 2
const COLLECT = 1
const ACTIVE = 0
const READY = 1

/** Reborn rows use Fire-village coordinates as their canonical low-level band. */
export const isRebornQuest = (id: number) =>
  (id >= 820001 && id <= 820022) || (id >= 830001 && id <= 830118)

export function rebornLocation(taskId: number, sceneId: number, npcId: string, nation: number) {
  if (!isRebornQuest(taskId)) return { sceneId, npcId }
  const villages = [111, 121, 151, 141, 131]
  const fields = [2100, 2200, 2500, 2400, 2300]
  const village = villages[nation]
  const field = fields[nation]
  if (village === undefined || field === undefined) return { sceneId, npcId }
  if (sceneId === 111) {
    return { sceneId: village, npcId: npcId.replace(/^n110/, `n${Math.floor(village / 10)}0`) }
  }
  if (sceneId >= 2101 && sceneId <= 2103) {
    const localScene = field + sceneId - 2100
    const localSpawns = sceneSpawns(localScene)
    let localNpc = npcId.replace(/^n210/, `n${field / 100}0`)
    // Each village has a few different creatures in matching field-roster slots.
    if (!localSpawns.some((spawn) => spawn.id === localNpc)) {
      const slot = sceneSpawns(sceneId).findIndex((spawn) => spawn.id === npcId)
      localNpc = localSpawns[slot]?.id ?? localNpc
    }
    return { sceneId: localScene, npcId: localNpc }
  }
  return { sceneId, npcId }
}

/** Character-local quest giver for acceptance or hand-in; original rows are unchanged. */
export function questLocation(taskId: number, nation: number, phase: 'accept' | 'submit') {
  const row = task(taskId)!
  return rebornLocation(
    taskId,
    Number(phase === 'accept' ? row.AcceptNpcSceneID : row.SubmitNpcSceneID),
    String(phase === 'accept' ? row.AcceptNpcConfig : row.SubmitNpcConfig),
    nation,
  )
}

/** Navigation sent with Reborn quests, independent of the original client's static step table. */
export function questNavigation(quest: QuestProgress, nation: number) {
  if (!isRebornQuest(quest.taskId)) return undefined
  if (quest.state === READY) return questLocation(quest.taskId, nation, 'submit')
  const step = subTasks(quest.taskId).find(
    (step) => (quest.progress[Number(step.SetpSeq)] ?? 0) < stepTarget(step),
  )
  if (!step || Number(step.SubTaskType) === COMMAND) return {}
  return rebornLocation(
    quest.taskId,
    Number(step.SubmitSceneID),
    String(step.TargetConfiger),
    nation,
  )
}

/** CommandRule zero-count rows are completion flags: one matching command completes them. */
export const stepTarget = (step: ReturnType<typeof subTasks>[number]) =>
  Number(step.SubTaskType) === COMMAND
    ? Math.max(1, Number(step.TargetRequireNum))
    : Number(step.TargetRequireNum)

const isComplete = (taskId: number, progress: number[]) =>
  subTasks(taskId).every((step) => (progress[Number(step.SetpSeq)] ?? 0) >= stepTarget(step))

function advance(
  quests: QuestProgress[],
  matches: (step: ReturnType<typeof subTasks>[number], taskId: number) => boolean,
): QuestProgress[] {
  const changed: QuestProgress[] = []
  for (const quest of quests) {
    if (quest.state !== ACTIVE) continue
    const progress = [...quest.progress]
    let touched = false
    for (const step of subTasks(quest.taskId)) {
      const index = Number(step.SetpSeq)
      const target = stepTarget(step)
      if (matches(step, quest.taskId) && (progress[index] ?? 0) < target) {
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

const localLocation = (taskId: number, sceneId: number, npcId: string, actualScene: number) =>
  rebornLocation(taskId, sceneId, npcId, Number(scene(actualScene)?.Nation ?? -1))

const inScene = (step: ReturnType<typeof subTasks>[number], sceneId: number, taskId: number) =>
  Number(step.SubmitSceneID) === -1 ||
  localLocation(taskId, Number(step.SubmitSceneID), String(step.TargetConfiger), sceneId)
    .sceneId === sceneId

/** A monster kill counts for active kill steps targeting it in this scene. */
export function recordKill(quests: QuestProgress[], monsterId: string, sceneId: number) {
  return advance(
    quests,
    (step, taskId) =>
      Number(step.SubTaskType) === KILL &&
      localLocation(taskId, Number(step.SubmitSceneID), String(step.TargetConfiger), sceneId)
        .npcId === monsterId &&
      inScene(step, sceneId, taskId),
  )
}

/**
 * Quest items (TaskMonsterDrop.ini) only drop while a matching collect step is unfinished.
 * `chanceMul` is the VIP drop factor (vipDropMul).
 */
export function questItemDrops(
  quests: QuestProgress[],
  monsterId: string,
  sceneId: number,
  random: Random,
  chanceMul = 1,
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
        localLocation(quest.taskId, Number(drop.SceneID), String(drop.MonsterConfig), sceneId)
          .npcId === monsterId &&
        localLocation(quest.taskId, Number(drop.SceneID), String(drop.MonsterConfig), sceneId)
          .sceneId === sceneId &&
        random.int(100) < Number(drop.DropProbability) * chanceMul
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

/** Talking to an NPC counts for active talk steps that target it in this scene. */
export function recordTalk(quests: QuestProgress[], npcId: string, sceneId: number) {
  return advance(
    quests,
    (step, taskId) =>
      Number(step.SubTaskType) === TALK &&
      localLocation(taskId, Number(step.SubmitSceneID), String(step.TargetConfiger), sceneId)
        .npcId === npcId &&
      inScene(step, sceneId, taskId),
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

/** Reborn hooks: emit once after a successful action, inside its character transaction.
 * Arena counts a completed fight (win or loss); Las Noches counts a cleared floor;
 * bloodline counts the first unlock, not activation or subsequent gift turn-ins.
 */
export const REBORN_IDENTIFY_COMMAND = 82001
export const REBORN_ENHANCE_COMMAND = 82002
export const REBORN_INSCRIBE_COMMAND = 82003
export const REBORN_ARENA_FIGHT_COMMAND = 82004
export const REBORN_LAS_NOCHES_FLOOR_COMMAND = 82005
export const REBORN_BLOODLINE_UNLOCK_COMMAND = 82006

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
    (step, taskId) =>
      Number(step.SubTaskType) === COMMAND &&
      Number(step.TargetCondition) === command &&
      (!String(step.TargetItem).startsWith('i') || step.TargetItem === itemId) &&
      inScene(step, sceneId, taskId),
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
        ...questLocation(taskId, character.nation, 'accept'),
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
