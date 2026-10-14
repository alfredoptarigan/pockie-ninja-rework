import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { commands, generate, storyLevel, tutorialIds } from './reborn-story.ts'
import { storyText } from './story-text.ts'
// Tools enforce erasable TS; load the server at runtime because game-core uses parameter properties.
interface QuestProgress {
  taskId: number
  state: number
  progress: number[]
}
type Advance = (quests: QuestProgress[], target: string, scene: number) => QuestProgress[]
interface Location {
  sceneId: number
  npcId: string
}
interface Engine {
  rebornLocation: (id: number, scene: number, npc: string, nation: number) => Location
  questLocation: (id: number, nation: number, phase: 'accept' | 'submit') => Location
  questNavigation: (quest: QuestProgress, nation: number) => Partial<Location> | undefined
  availableQuests: (
    character: { level: number; nation: number },
    quests: QuestProgress[],
  ) => ({ taskId: number } & Location)[]
  questLock: (
    id: number,
    character: { level: number; nation: number },
    quests: QuestProgress[],
  ) => { code: string } | undefined
  questRewards: (id: number) => {
    exp: number
    stone: number
    items: unknown[]
    gold: number
    honor: number
    giftCoupon: number
  }
  recordCollect: (quests: QuestProgress[], item: string) => QuestProgress[]
  recordCommand: (quests: QuestProgress[], command: number, scene: number) => QuestProgress[]
  recordKill: Advance
  recordTalk: Advance
  questItemDrops: (
    quests: QuestProgress[],
    monster: string,
    scene: number,
    rng: { next: () => number; int: () => number; between: (min: number) => number },
  ) => string[]
  REBORN_IDENTIFY_COMMAND: number
  REBORN_ENHANCE_COMMAND: number
  REBORN_INSCRIBE_COMMAND: number
  REBORN_ARENA_FIGHT_COMMAND: number
  REBORN_LAS_NOCHES_FLOOR_COMMAND: number
  REBORN_BLOODLINE_UNLOCK_COMMAND: number
}
const {
  rebornLocation,
  questLocation,
  questNavigation,
  availableQuests,
  questLock,
  questRewards,
  recordCollect,
  recordCommand,
  recordKill,
  recordTalk,
  questItemDrops,
  REBORN_IDENTIFY_COMMAND,
  REBORN_ENHANCE_COMMAND,
  REBORN_INSCRIBE_COMMAND,
  REBORN_ARENA_FIGHT_COMMAND,
  REBORN_LAS_NOCHES_FLOOR_COMMAND,
  REBORN_BLOODLINE_UNLOCK_COMMAND,
} = (await import(new URL('../../server/src/game/quests.ts', import.meta.url).href)) as Engine

type Row = Record<string, string | number>
const read = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../server/data/game/${name}.json`, import.meta.url), 'utf8'),
  ) as T
const { travelRefusal } = (await import(
  new URL('../../server/src/modules/game/travel.ts', import.meta.url).href
)) as {
  travelRefusal: (
    character: { level: number; nation: number; sceneId: number },
    quests: QuestProgress[],
    scene: number,
    via: 'map',
  ) => unknown
}
const generated = generate()
const sceneNpcs = read<Record<string, { r: string[] }>>('scene-npcs')
const npcs = read<Record<string, Row>>('npcs')
const items = read<Record<string, Row>>('items')
const base = read<Record<string, Row>>('tasks')
const atScene = (id: string, scene: number) =>
  sceneNpcs[scene]?.r.some((line) => line.split(',')[0] === id)

describe('Reborn quests', () => {
  it('exports the same six hook ids used by the generated steps', () => {
    expect(Object.values(commands)).toEqual([
      REBORN_IDENTIFY_COMMAND,
      REBORN_ENHANCE_COMMAND,
      REBORN_INSCRIBE_COMMAND,
      REBORN_ARENA_FIGHT_COMMAND,
      REBORN_LAS_NOCHES_FLOOR_COMMAND,
      REBORN_BLOODLINE_UNLOCK_COMMAND,
    ])
  })
  it('contains exactly the tutorial subset and all 118 story ids, without collisions', () => {
    expect(storyText).toHaveLength(118)
    expect(Object.keys(generated.tasks).map(Number)).toEqual([
      ...tutorialIds.map((id) => id + 800000),
      ...Array.from({ length: 118 }, (_, i) => 830001 + i),
    ])
    for (const id of Object.keys(generated.tasks)) expect(base[id]).toBeUndefined()
  })
  it('only references existing NPCs, scenes, monsters and collect items with usable drop sources', () => {
    for (const [id, row] of Object.entries(generated.tasks)) {
      expect(atScene(String(row.AcceptNpcConfig), Number(row.AcceptNpcSceneID)), id).toBe(true)
      expect(atScene(String(row.SubmitNpcConfig), Number(row.SubmitNpcSceneID)), id).toBe(true)
      expect(Number(row.RequireLevel), id).toBeLessThanOrEqual(70)
      for (const step of generated.steps[id]!) {
        if (Number(step.SubTaskType) === 8) {
          expect(step.SubmitSceneID).toBe(-1)
          continue
        }
        expect(npcs[String(step.TargetConfiger)], id).toBeDefined()
        expect(atScene(String(step.TargetConfiger), Number(step.SubmitSceneID)), id).toBe(true)
        if (Number(step.SubTaskType) === 1) {
          expect(items[String(step.TargetItem)], id).toBeDefined()
          expect(
            generated.drops[id]!.some(
              (drop) =>
                drop.TaskItemConfig === step.TargetItem &&
                drop.MonsterConfig === step.TargetConfiger &&
                drop.SceneID === step.SubmitSceneID,
            ),
            id,
          ).toBe(true)
        }
      }
    }
  })
  it('pins the captured calibration and caps every other reward at half the level main line', () => {
    expect(storyLevel(30022)).toBe(21)
    expect(questRewards(830022)).toMatchObject({ exp: 3060, stone: 36000 })
    expect(
      generated.steps[830022]!.map((s) => [s.TargetConfiger, s.TargetRequireNum, s.SubmitSceneID]),
    ).toEqual([
      ['n33010', 8, 2103],
      ['n33020', 6, 2103],
    ])
    for (const [id, row] of Object.entries(generated.tasks)) {
      if (id === '830022') continue // Decision 22's explicitly approved calibration exception.
      const main = Object.values(base).filter(
        (r) => Number(r.TaskBaseType) === 1 && r.RequireLevel === row.RequireLevel,
      )
      const reward = questRewards(Number(id))
      if (!main.length) {
        expect(reward.exp).toBe(0)
        expect(reward.stone).toBe(0)
      }
      for (const original of main) {
        const stone = Number(
          String(original.RewardMoney)
            .split(';')
            .find((s) => s.startsWith('0,'))
            ?.split(',')[1] ?? 0,
        )
        expect(reward.exp).toBeLessThanOrEqual(Number(original.RewardExp) / 2)
        expect(reward.stone).toBeLessThanOrEqual(stone / 2)
      }
      expect(reward.items).toEqual([])
      expect(reward.gold + reward.honor + reward.giftCoupon).toBe(0)
    }
  })
  it('matches committed outputs and has text for every displayed key', () => {
    expect(read('reborn/tasks')).toEqual(generated.tasks)
    expect(read('reborn/sub-tasks')).toEqual(generated.steps)
    expect(read('reborn/task-monster-drops')).toEqual(generated.drops)
    const text = JSON.parse(
      readFileSync(new URL('../../client/src/i18n/reborn.json', import.meta.url), 'utf8'),
    ) as Record<string, string>
    for (const [key, value] of Object.entries(generated.text)) expect(text[key], key).toBe(value)
    expect(new Set(storyText).size).toBe(118)
  })
  it.each(
    [0, 1, 2, 3, 4].flatMap((nation) => [
      { chain: tutorialIds.map((id) => id + 800000), name: `tutorial, village ${nation}`, nation },
      {
        chain: Array.from({ length: 118 }, (_, i) => 830001 + i),
        name: `story, village ${nation}`,
        nation,
      },
    ]),
  )(
    'is acyclic and playable through the real progress rules by level 70 ($name)',
    ({ chain, nation }) => {
      const completed: QuestProgress[] = []
      let previousLevel = 0
      for (const [position, id] of chain.entries()) {
        const row = generated.tasks[id]!
        expect(row.PreTaskID).toBe(position === 0 ? 0 : chain[position - 1])
        expect(row.NextTaskID).toBe(position === chain.length - 1 ? 0 : chain[position + 1])
        expect(Number(row.RequireLevel)).toBeGreaterThanOrEqual(previousLevel)
        previousLevel = Number(row.RequireLevel)
        expect(
          questLock(id, { level: Number(row.RequireLevel), nation }, completed),
        ).toBeUndefined()
        if (position > 0)
          expect(questLock(id, { level: Number(row.RequireLevel), nation }, [])).toMatchObject({
            code: 'locked',
          })
        const offered = availableQuests(
          { level: Number(row.RequireLevel), nation },
          completed,
        ).find((offer) => offer.taskId === id)!
        expect(offered).toMatchObject(questLocation(id, nation, 'accept'))
        for (const phase of ['accept', 'submit'] as const) {
          const location = questLocation(id, nation, phase)
          expect(atScene(location.npcId, location.sceneId), `${id} ${phase} nation ${nation}`).toBe(
            true,
          )
          expect(
            travelRefusal(
              { level: Number(row.RequireLevel), nation, sceneId: 9999 },
              completed,
              location.sceneId,
              'map',
            ),
          ).toBeUndefined()
        }
        let active: QuestProgress[] = [{ taskId: id, state: 0, progress: [] }]
        for (const step of generated.steps[id]!) {
          for (let n = 0; n < Number(step.TargetRequireNum); n++) {
            const type = Number(step.SubTaskType)
            const { sceneId: scene, npcId: target } = rebornLocation(
              id,
              Number(step.SubmitSceneID),
              String(step.TargetConfiger),
              nation,
            )
            if (type !== 8) {
              expect(atScene(target, scene), `${id} objective nation ${nation}`).toBe(true)
              expect(
                travelRefusal(
                  { level: Number(row.RequireLevel), nation, sceneId: 9999 },
                  completed,
                  scene,
                  'map',
                ),
              ).toBeUndefined()
              expect(questNavigation(active[0]!, nation)).toEqual({ sceneId: scene, npcId: target })
            } else expect(questNavigation(active[0]!, nation)).toEqual({})
            const changed =
              type === 8
                ? recordCommand(active, Number(step.TargetCondition), 111)
                : type === 2
                  ? recordKill(active, target, scene)
                  : type === 3
                    ? recordTalk(active, target, scene)
                    : recordCollect(active, String(step.TargetItem))
            active = active.map((q) => changed.find((update) => update.taskId === q.taskId) ?? q)
          }
        }
        expect(active[0]!.state, id.toString()).toBe(1)
        expect(questNavigation(active[0]!, nation)).toEqual(questLocation(id, nation, 'submit'))
        completed.push({ ...active[0]!, state: 2 })
      }
    },
  )
  it('drops collection items only for active, unfinished objectives in the matching scene', () => {
    for (const id of Object.keys(generated.drops).map(Number)) {
      const step = generated.steps[id]![0]!
      const q = { taskId: id, state: 0, progress: [] }
      const rng = { next: () => 0, int: () => 0, between: (min: number) => min }
      expect(
        questItemDrops([q], String(step.TargetConfiger), Number(step.SubmitSceneID), rng),
      ).toEqual([step.TargetItem])
      expect(questItemDrops([q], String(step.TargetConfiger), -99, rng)).toEqual([])
      expect(
        questItemDrops(
          [{ ...q, progress: [Number(step.TargetRequireNum)] }],
          String(step.TargetConfiger),
          Number(step.SubmitSceneID),
          rng,
        ),
      ).toEqual([])
      expect(
        questItemDrops(
          [{ ...q, state: 2 }],
          String(step.TargetConfiger),
          Number(step.SubmitSceneID),
          rng,
        ),
      ).toEqual([])
    }
  })
  it('uses local collection monsters, and leaves original quest rules unchanged', () => {
    const rng = { next: () => 0, int: () => 0, between: (min: number) => min }
    for (const nation of [0, 1, 2, 3, 4]) {
      for (const id of Object.keys(generated.drops).map(Number)) {
        const step = generated.steps[id]![0]!
        const local = rebornLocation(
          id,
          Number(step.SubmitSceneID),
          String(step.TargetConfiger),
          nation,
        )
        expect(
          questItemDrops([{ taskId: id, state: 0, progress: [] }], local.npcId, local.sceneId, rng),
        ).toEqual([step.TargetItem])
      }
    }
    expect(recordKill([{ taskId: 10001, state: 0, progress: [] }], 'n33017', 2201)).toEqual([])
    expect(recordTalk([{ taskId: 90000, state: 0, progress: [] }], 'n12001', 121)).toEqual([])
    expect(
      questItemDrops([{ taskId: 10004, state: 0, progress: [] }], 'n33006', 2201, rng),
    ).toEqual([])
    expect(questNavigation({ taskId: 10001, state: 0, progress: [] }, 1)).toBeUndefined()
    expect(questLocation(10001, 1, 'accept')).toEqual({ sceneId: 111, npcId: 'n11001' })
  })
  it('ignores the wrong command and completed quests for every new hook', () => {
    for (const command of Object.values(commands)) {
      const id = Number(
        Object.keys(generated.steps).find((id) =>
          generated.steps[id]!.some((step) => step.TargetCondition === command),
        )!,
      )
      const active = [{ taskId: id, state: 0, progress: [] }]
      expect(recordCommand(active, command + 100, 111)).toEqual([])
      expect(recordCommand(active, command, 111)).toMatchObject([
        { taskId: id, state: 1, progress: [1] },
      ])
      expect(recordCommand([{ taskId: id, state: 2, progress: [1] }], command, 111)).toEqual([])
    }
  })
})
