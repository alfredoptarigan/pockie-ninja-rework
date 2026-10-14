// Reborn's Task Board (data/reborn-raw/audit-2026-10-14, "Task Board") over our daily quests
// (DayTaskSystem): a 660x450 panel, the left column with the offer refresh countdown, Available
// Tasks and In Progress (n/limit); the right pane with the selected task's grade, steps, rewards and
// Accept Task / Turn In. Turn In keeps the original EXP reward choice for graded tasks.
// ponytail: no Refresh Tasks, Go, Give Up, Deliver or instant Done buttons; our daily quests have
// no such actions on the server yet.
import type { DailyView } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { rewardCountdown, useNow } from '../events/timer'
import { QuestRewardFields } from '../Rewards'
import { GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { sceneNameKey } from '../world'
import { useDaily, useDailyAction } from './api'

type Quest = DailyView['quests'][number]
type Step = Quest['steps'][number]
type SelectType = 0 | 1 | 2 | 3

/** Reborn's grade letters and colours (2 D ... 5 A). */
const GRADES: Record<number, { letter: string; color: string }> = {
  2: { letter: 'D', color: '#6b7280' },
  3: { letter: 'C', color: '#2563eb' },
  4: { letter: 'B', color: '#7c3aed' },
  5: { letter: 'A', color: '#d97706' },
}

const questName = (quest: Quest) => plainText(quest.nameKey, `Quest ${quest.taskId}`)

function stepText(step: Step) {
  if (!step.kind || !step.targetNameKey) return plainText(step.descriptionKey, 'Objective')
  const verb = step.kind === 'kill' ? 'Defeat' : step.kind === 'talk' ? 'Talk to' : 'Collect'
  const where =
    step.sceneId && step.sceneId > 0
      ? ` in ${plainText(sceneNameKey(step.sceneId), `Field ${step.sceneId}`)}`
      : ''
  return `${verb} ${plainText(step.targetNameKey, step.targetId)}${where}`
}

const done = (quest: Quest, index: number) =>
  (quest.progress[index] ?? 0) >= quest.steps[index]!.target

export function TaskBoard() {
  const daily = useDaily()
  const action = useDailyAction()
  const now = useNow()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const quests = daily.data?.quests ?? []
  const available = quests.filter((quest) => quest.state === 0)
  const inProgress = quests.filter((quest) => quest.state === 1 || quest.state === 2)
  const selected = [...available, ...inProgress].find((quest) => quest.taskId === selectedId)
  const refresh = daily.data ? rewardCountdown(daily.data.refreshAt, now) : ''
  return (
    <div className="game-panel-1 flex h-[450px] w-[660px] gap-[5px] p-[8px] font-game text-xs text-black">
      <div className="game-card flex h-[434px] w-[200px] shrink-0 flex-col gap-[4px] p-[5px]">
        <div className="game-text-box flex h-[70px] flex-col items-center justify-center gap-px">
          <span>Offers refresh in</span>
          <span className="text-sm font-bold">{refresh === '0:00' ? 'READY' : refresh}</span>
          {daily.data && (
            <span>{`Completed today: ${daily.data.completed}/${daily.data.limit}`}</span>
          )}
        </div>
        <ListHeader icon="game-icon-scroll" title="Available Tasks" />
        <TaskList
          label="Available Tasks"
          empty="No tasks available"
          quests={available}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="h-[115px]"
        />
        <ListHeader
          icon="game-icon-notice"
          title={`In Progress (${inProgress.length}/${daily.data?.inProgressLimit ?? '-'})`}
        />
        <TaskList
          label="In Progress"
          empty="No tasks in progress"
          quests={inProgress}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="flex-1"
        />
      </div>
      <div className="game-card flex h-[434px] w-[445px] flex-col gap-[5px] p-[10px]">
        {daily.isPending && <p>Loading tasks...</p>}
        {daily.isError && <Notice tone="error">{errorMessage(daily.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {selected ? (
          <TaskDetails
            key={selected.taskId}
            quest={selected}
            busy={action.isPending}
            onAccept={() => action.mutate({ taskId: selected.taskId, operation: 'accept' })}
            onTurnIn={(selectType) =>
              action.mutate({ taskId: selected.taskId, operation: 'hand-in', selectType })
            }
          />
        ) : (
          daily.data && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <span aria-hidden="true" className="game-icon-scroll size-8" />
              <p>Select a task to view details</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function ListHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="game-value-box flex h-[22px] shrink-0 items-center gap-1 px-2 font-bold">
      <span aria-hidden="true" className={`${icon} size-4`} />
      {title}
    </h3>
  )
}

function TaskList({
  label,
  empty,
  quests,
  selectedId,
  onSelect,
  className,
}: {
  label: string
  empty: string
  quests: Quest[]
  selectedId: number | null
  onSelect: (taskId: number) => void
  className: string
}) {
  return (
    <div className={`overflow-auto rounded-sm bg-white/40 p-[2px] ${className}`}>
      {quests.length === 0 ? (
        <p className="p-1 text-center">{empty}</p>
      ) : (
        <ul aria-label={label} className="flex flex-col gap-px">
          {quests.map((quest) => {
            const grade = GRADES[quest.grade ?? 0]
            return (
              <li key={quest.taskId}>
                <button
                  type="button"
                  aria-current={quest.taskId === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(quest.taskId)}
                  className="flex w-full items-center gap-1 rounded-sm px-1 py-px text-left hover:bg-black/10 aria-[current=true]:bg-black/15"
                >
                  {quest.state === 2 && <span className="text-[#2f7d1c]">✓</span>}
                  <span className="min-w-0 flex-1 truncate">{questName(quest)}</span>
                  {grade && (
                    <span className="font-bold" style={{ color: grade.color }}>
                      {grade.letter}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <h4 className="game-text-box flex h-[20px] items-center px-3 font-bold">{title}</h4>
}

function StepList({ quest, className }: { quest: Quest; className: string }) {
  const current = quest.steps.findIndex((_, index) => !done(quest, index))
  return (
    <ol className={`overflow-auto rounded-sm bg-white/40 p-[6px] ${className}`}>
      {quest.steps.map((step, index) => (
        <li key={index} className="flex gap-1">
          <span aria-hidden="true" className="w-3 shrink-0">
            {done(quest, index) ? '✓' : index === current ? '►' : '○'}
          </span>
          <span className="flex-1">{stepText(step)}</span>
          <span>{`${Math.min(quest.progress[index] ?? 0, step.target)}/${step.target}`}</span>
        </li>
      ))}
    </ol>
  )
}

function TaskDetails({
  quest,
  busy,
  onAccept,
  onTurnIn,
}: {
  quest: Quest
  busy: boolean
  onAccept: () => void
  onTurnIn: (selectType: SelectType) => void
}) {
  const [selectType, setSelectType] = useState<SelectType>(0)
  const name = questName(quest)
  const grade = GRADES[quest.grade ?? 0]
  const current = quest.steps.findIndex((_, index) => !done(quest, index))
  const completed = quest.state === 2
  return (
    <section aria-label={name} className="flex flex-1 flex-col gap-[5px]">
      <div className="game-value-box flex h-[35px] shrink-0 items-center justify-between px-3">
        <h3 className="truncate text-sm font-bold">{name}</h3>
        {grade && (
          <span
            className="rounded-full px-2 py-px font-bold text-white"
            style={{ backgroundColor: grade.color }}
          >
            {`Grade ${grade.letter}`}
          </span>
        )}
      </div>
      {quest.state === 0 ? (
        <>
          <SectionHeader title="Steps" />
          <StepList quest={quest} className="h-[140px]" />
          <SectionHeader title="Rewards" />
          <div className="h-[110px] overflow-auto">
            <QuestRewardFields rewards={quest.rewards} />
          </div>
          <GameButton
            className="mt-auto h-[28px] w-[120px] self-center"
            disabled={busy}
            onClick={onAccept}
          >
            Accept Task
          </GameButton>
        </>
      ) : (
        <>
          <SectionHeader title="Current Progress" />
          <p className="flex h-[50px] items-center rounded-sm bg-white/40 px-[6px]">
            {completed || current < 0
              ? 'Task Completed! Click Turn In to claim rewards.'
              : `${stepText(quest.steps[current]!)} ${Math.min(quest.progress[current] ?? 0, quest.steps[current]!.target)}/${quest.steps[current]!.target}`}
          </p>
          <SectionHeader title="All Steps" />
          <StepList quest={quest} className="h-[80px]" />
          <SectionHeader title="Rewards" />
          <div className="h-[90px] overflow-auto">
            <QuestRewardFields rewards={quest.rewards} />
          </div>
          {completed && (
            <div className="mt-auto flex items-center justify-center gap-2">
              {(quest.grade ?? 0) >= 2 && (
                <select
                  aria-label={`EXP reward for ${quest.taskId}`}
                  value={selectType}
                  onChange={(event) => setSelectType(Number(event.target.value) as SelectType)}
                  className="h-[24px] border border-wood-light bg-parchment"
                >
                  <option value={0}>Normal reward</option>
                  <option value={1}>+25% EXP for 1 Gold</option>
                  <option value={2}>+20% EXP for 1 Gift Coupon</option>
                  <option value={3}>+10% EXP for 1,000 Stone</option>
                </select>
              )}
              <GameButton
                className="h-[28px] w-[120px]"
                disabled={busy}
                onClick={() => onTurnIn(selectType)}
              >
                Turn In
              </GameButton>
            </div>
          )}
        </>
      )}
    </section>
  )
}
