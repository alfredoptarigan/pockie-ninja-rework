// Quest progress rules ported from TaskModule (KillMonsterRule, CollectRule); see
// docs/original-data/quests-items.md. Progress is one count per sub-task, indexed by SetpSeq.
import type { Random } from '@pockie/game-core'
import { subTasks, taskMonsterDrops } from './data.js'

export interface QuestProgress {
  taskId: number
  state: number
  progress: number[]
}

const KILL = 2
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
