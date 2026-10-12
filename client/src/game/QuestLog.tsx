import { useQuests } from './api'
import { QuestRewardList } from './Rewards'
import { Notice } from './skin'
import { GameText, plainText } from './text'
import type { Quest } from './types'
import { questStepArgs } from './world'

/** " Quest complete: X." suffix for action messages. */
export function completedNotice(taskIds: number[]) {
  if (taskIds.length === 0) return ''
  const names = taskIds.map((id) => plainText(`lg_Task_${id}`, `Quest ${id}`))
  return ` Quest complete: ${names.join(', ')}.`
}

const stateLabel = (quest: Quest) => (quest.state === 1 ? 'Ready to hand in' : 'In progress')

export function Steps({ quest }: { quest: Quest }) {
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {quest.steps.map((step, i) => {
        const done = Math.min(quest.progress[i] ?? 0, step.target)
        return (
          <li key={step.descriptionKey + i} className="flex justify-between gap-2 text-xs">
            <span>
              <GameText
                k={step.descriptionKey}
                fallback="Objective"
                args={questStepArgs(quest.taskId, i, done, step.target)}
              />
            </span>
            <span className={`shrink-0 font-bold ${done >= step.target ? 'text-leaf' : ''}`}>
              {done}/{step.target}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function QuestLog() {
  const quests = useQuests()
  if (quests.isPending) return <p>Reading your quest log...</p>
  if (quests.isError) return <Notice tone="error">We could not load your quests.</Notice>
  if (quests.data.length === 0) return <p>No quests right now. Talk to the villagers.</p>

  return (
    <ul className="flex flex-col gap-3" aria-label="Quest log">
      {quests.data.map((quest) => (
        <li key={quest.taskId} className="game-card p-2">
          <h3 className="flex justify-between gap-2 font-bold">
            <GameText k={quest.nameKey} fallback={`Quest ${quest.taskId}`} />
            <span className="shrink-0 text-xs font-normal">{stateLabel(quest)}</span>
          </h3>
          <p className="mt-1 text-xs">
            <GameText k={quest.descriptionKey} />
          </p>
          <Steps quest={quest} />
          <QuestRewardList rewards={quest.rewards} />
        </li>
      ))}
    </ul>
  )
}
