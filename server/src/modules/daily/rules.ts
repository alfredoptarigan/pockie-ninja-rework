import { readFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { subTasks, task } from '../../game/data.js'

export const dailyData = JSON.parse(
  readFileSync(new URL('../../../data/game/daily-tasks.json', import.meta.url), 'utf8'),
) as {
  config: {
    CanPerFlushDayTaskNum: number
    AcceptedDayTaskMaxNum: number
    PerShowDayTaskMaxNum: number
    PerDayCompleteTaskMax: number
    FlushDayTaskTime: number
    CanAcceptDayMinLevel: number
  }
  levels: Record<string, { RequireMinLevel: number; RequireMaxLevel: number }>
}
const tasks = JSON.parse(
  readFileSync(new URL('../../../data/game/tasks.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, string | number>>
export const neutralField = (id: number) =>
  [2601, 2602, 2603, 2604, 2605, 2701, 2702, 2703, 2704, 2801, 2802, 2803, 2804].includes(id)
const band = (level: number) =>
  Object.entries(dailyData.levels).find(
    ([, row]) => level >= row.RequireMinLevel && level <= row.RequireMaxLevel,
  )?.[0]

/** DayTaskSystem.AppendTask / GetFitSelfDayTask / CheckGetDayRule: neutral-field slice. */
export function eligibleTasks(character: { level: number; nation: number }) {
  return Object.entries(tasks)
    .filter(
      ([id, row]) =>
        Number(row.TaskBaseType) === 2 &&
        Number(row.IsRecycle) === 0 &&
        band(Number(row.RequireLevel)) === band(character.level) &&
        Number(row.RequireLevel) <= character.level &&
        (Number(row.RequireCountry) === -1 || Number(row.RequireCountry) === character.nation) &&
        subTasks(Number(id)).some((step) => neutralField(Number(step.SubmitSceneID))),
    )
    .map(([id]) => Number(id))
}

/** DayTaskSystem.RandomDayTask / GetRandomLogicDayTaskType / QuantSelectDayTask. */
export function pickTasks(
  character: { level: number; nation: number },
  held: { taskId: number; state: number }[],
  int = randomInt,
) {
  const rows = [...held]
  const selected: number[] = []
  for (let i = 0; i < dailyData.config.CanPerFlushDayTaskNum; i++) {
    if (rows.length > dailyData.config.PerShowDayTaskMaxNum) break
    const types = [2, 1, 3, 4, 5].filter(
      (type) =>
        !rows.some((row) => row.state === 0 && Number(task(row.taskId)?.TaskLogicType) === type),
    )
    if (!types.length) break
    const type = types[int(types.length)]!
    const candidates = eligibleTasks(character).filter(
      (id) => Number(task(id)!.TaskLogicType) === type && !rows.some((row) => row.taskId === id),
    )
    const total = candidates.reduce((sum, id) => sum + Number(task(id)!.Probability), 0)
    if (total <= 0) continue
    let roll = int(total)
    const id = candidates.find((id) => {
      roll -= Number(task(id)!.Probability)
      return roll < 0
    })!
    selected.push(id)
    rows.push({ taskId: id, state: 0 })
  }
  return selected
}
