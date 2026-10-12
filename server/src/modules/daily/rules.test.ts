import { describe, expect, it } from 'vitest'
import { task } from '../../game/data.js'
import { eligibleTasks, pickTasks } from './rules.js'

describe('DayTaskSystem weighted pick', () => {
  it('picks one offer per logic type and skips missing types instead of inventing tasks', () => {
    const picked = pickTasks({ level: 20, nation: 0 }, [], () => 0)
    expect(picked).toEqual([2260102, 2160102, 2365102])
    expect(picked.map((id) => Number(task(id)!.TaskLogicType))).toEqual([2, 1, 3])
  })
  it('excludes recyclable tasks and higher levels, and changes bands at 21', () => {
    const low = eligibleTasks({ level: 20, nation: 0 })
    const high = eligibleTasks({ level: 21, nation: 0 })
    expect(low).toContain(2160102)
    expect(low).not.toContain(26001)
    expect(low).not.toContain(2160103)
    expect(high).toContain(2160103)
    expect(high).not.toContain(2160102)
  })
  it('does not repeat a held task or a currently offered logic type', () => {
    expect(pickTasks({ level: 20, nation: 0 }, [{ taskId: 2260102, state: 0 }], () => 0)).toEqual([
      2160102, 2365102,
    ])
    expect(
      pickTasks({ level: 20, nation: 0 }, [{ taskId: 2160102, state: 1 }], () => 0),
    ).not.toContain(2160102)
  })
})
