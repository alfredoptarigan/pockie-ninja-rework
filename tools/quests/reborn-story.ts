/** Generate Task.ini/SubTask.ini overlays. Run: node tools/quests/reborn-story.ts.
 * Only titles/ids come from normalized Reborn data; missing mechanics and prose are authored here.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import names from './names.json' with { type: 'json' }
import { storyText } from './story-text.ts'

type Row = Record<string, string | number>
const root = new URL('../../', import.meta.url)
const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`server/data/game/${name}.json`, root), 'utf8')) as T
export const tutorialIds = [20001, 20002, 20003, 20004, 20005, 20009, 20016, 20017, 20018]
// Kept local to avoid loading the server at generation time; tests pin the exported hook ids.
export const commands = {
  identify: 82001,
  enhance: 82002,
  inscribe: 82003,
  arena: 82004,
  lasNoches: 82005,
  bloodline: 82006,
}
export function storyLevel(id: number) {
  const index = id - 30001
  return index <= 21 ? 1 + Math.floor((index * 20) / 21) : 21 + Math.ceil(((index - 21) * 49) / 96)
}

export function generate() {
  const baseTasks = read<Record<string, Row>>('tasks')
  const scenes = read<Record<string, Row>>('scenes')
  const sceneNpcs = read<Record<string, { r: string[] }>>('scene-npcs')
  const npcs = read<Record<string, Row>>('npcs')
  const oldDrops = read<Record<string, Row[]>>('task-monster-drops')
  const items = read<Record<string, Row>>('items')
  const tasks: Record<string, Row> = {}
  const steps: Record<string, Row[]> = {}
  const drops: Record<string, Row[]> = {}
  const text: Record<string, string> = {}
  const collectionIds = new Set([
    30005, 30015, 30017, 30026, 30029, 30033, 30036, 30051, 30057, 30076, 30092, 30106,
  ])
  const fightIds = new Set([
    30004, 30006, 30009, 30010, 30011, 30012, 30019, 30023, 30025, 30032, 30035, 30042, 30043,
    30044, 30047, 30048, 30050, 30053, 30061, 30063, 30064, 30069, 30071, 30074, 30077, 30079,
    30081, 30086, 30087, 30089, 30091, 30093, 30098, 30100, 30104, 30105, 30109, 30110, 30111,
    30112, 30117, 30118,
  ])
  const storyCommands: Record<number, number> = {
    30016: commands.arena,
    30080: commands.bloodline,
    30083: commands.enhance,
    30088: commands.lasNoches,
    30116: commands.arena,
  }
  const tutorial = [
    { level: 1, type: 3, text: 'Meet the village elder and learn where to find assignments.' },
    { level: 1, command: 8887, text: 'Open your bag and equip a weapon before setting out.' },
    { level: 1, type: 2, text: 'Patrol the outskirts and defeat two creatures along the road.' },
    {
      level: 5,
      command: commands.identify,
      text: 'Take equipment with hidden properties to the blacksmith and identify it.',
    },
    {
      level: 5,
      command: commands.enhance,
      text: 'Successfully enhance a piece of equipment at the blacksmith.',
    },
    {
      level: 10,
      command: commands.inscribe,
      text: 'Successfully inscribe a piece of equipment at the blacksmith.',
    },
    {
      level: 10,
      command: commands.arena,
      text: 'Take part in an arena fight. The result matters less than what you learn.',
    },
    {
      level: 20,
      command: commands.lasNoches,
      text: 'Enter Las Noches and clear a floor to test your endurance.',
    },
    {
      level: 20,
      command: commands.bloodline,
      text: 'Bring the required gifts to the Ninja House until you unlock a bloodline.',
    },
  ]
  const main = Object.values(baseTasks).filter((row) => Number(row.TaskBaseType) === 1)
  const ids = [...tutorialIds, ...Array.from({ length: 118 }, (_, i) => 30001 + i)]
  for (const sourceId of ids) {
    const isStory = sourceId >= 30001
    const index = isStory ? sourceId - 30001 : tutorialIds.indexOf(sourceId)
    const lesson = tutorial[index]
    const level = isStory ? storyLevel(sourceId) : lesson!.level
    // Low-level fields use the Fire village band; shared fields take over from level 26.
    const field = Object.keys(scenes)
      .filter(
        (id) =>
          Number(scenes[id]!.Type) === 1 &&
          Number(scenes[id]!.Level) > 0 &&
          Number(scenes[id]!.Level) <= level &&
          (Number(scenes[id]!.Nation) === 0 ||
            (level >= 26 && Number(scenes[id]!.Nation) === -1)) &&
          sceneNpcs[id]?.r.some((line) => line.startsWith('n3')) &&
          sceneNpcs[id]?.r.some((line) => !line.startsWith('n3')),
      )
      .sort((a, b) => Number(scenes[b]!.Level) - Number(scenes[a]!.Level))[0]!
    const inhabitants = sceneNpcs[field]!.r.map((line) => line.split(',')[0]!)
    const giver = isStory ? inhabitants.find((id) => !id.startsWith('n3'))! : 'n11001'
    const giverScene = isStory ? Number(field) : 111
    const monsters = inhabitants.filter(
      (id) =>
        id.startsWith('n3') &&
        Number(npcs[id]?.Level) <= Math.max(level, Number(scenes[field]!.Level) + 9),
    )
    const monster =
      monsters[index % monsters.length] ?? inhabitants.find((id) => id.startsWith('n3'))!
    const id = sourceId + 800000
    const chain = isStory ? ids.filter((n) => n >= 30001) : tutorialIds
    const title = names[String(sourceId) as keyof typeof names]
    const narrative = isStory ? storyText[index]! : lesson!.text
    text[`lg_Task_${id}`] = title
    text[`lg_TaskDes_${id}`] = narrative
    text[`lg_RebornQuest_${id}_start`] = narrative
    text[`lg_RebornQuest_${id}_submit`] =
      'Your report has been received. The next assignment is ready when you are.'
    const rewardRows = main.filter((row) => Number(row.RequireLevel) === level)
    const exp = rewardRows.length
      ? Math.floor(Math.min(...rewardRows.map((row) => Number(row.RewardExp))) / 2)
      : 0
    const stone = rewardRows.length
      ? Math.floor(
          Math.min(
            ...rewardRows.map((row) =>
              Number(
                String(row.RewardMoney)
                  .split(';')
                  .find((part) => part.startsWith('0,'))
                  ?.split(',')[1] ?? 0,
              ),
            ),
          ) / 2,
        )
      : 0
    const position = chain.indexOf(sourceId)
    tasks[id] = {
      ...baseTasks['10001'],
      AutoAcceptTask: 0,
      CanGiveup: 1,
      RequireCountry: -1,
      RequireLevel: level,
      Name: `Task_${id}`,
      TaskBaseType: 3,
      PreTaskID: position === 0 ? 0 : chain[position - 1]! + 800000,
      NextTaskID: position === chain.length - 1 ? 0 : chain[position + 1]! + 800000,
      AcceptNpcConfig: giver,
      AcceptNpcSceneID: giverScene,
      SubmitNpcConfig: giver,
      SubmitNpcSceneID: giverScene,
      StartNpcMessageID: `RebornQuest_${id}_start`,
      SubmitNpcMessageID: `RebornQuest_${id}_submit`,
      RewardExp: sourceId === 30022 ? 3060 : exp,
      RewardMoney: `0,${sourceId === 30022 ? 36000 : stone}`,
      RewardItem: 0,
    }
    const command = isStory ? storyCommands[sourceId] : lesson!.command
    const type = command
      ? 8
      : isStory
        ? collectionIds.has(sourceId)
          ? 1
          : fightIds.has(sourceId) || sourceId === 30022
            ? 2
            : 3
        : lesson!.type!
    const step: Row = {
      CanTransfer: command ? 0 : 1,
      NpcSayMessageID: `RebornQuest_${id}_start`,
      SetpSeq: 0,
      SubTaskDescription: `RebornQuest_${id}_step_0`,
      SubTaskType: type,
      SubmitSceneID: command ? -1 : type === 3 ? giverScene : Number(field),
      TargetCondition: command ?? 0,
      TargetConfiger: type === 3 ? giver : type === 8 ? 0 : monster,
      TargetItem: 0,
      TargetRequireNum: type === 2 ? (isStory ? 4 + (index % 5) : 2) : 1,
    }
    if (type === 1) {
      // Reuse an existing quest item's proven monster/scene source, with an independent drop row.
      const source = Object.values(oldDrops)
        .flat()
        .find(
          (row) =>
            Number(row.SceneID) === Number(field) &&
            inhabitants.includes(String(row.MonsterConfig)) &&
            items[String(row.TaskItemConfig)],
        )
      if (!source) throw new Error(`No collect source in scene ${field}`)
      step.TargetConfiger = String(source.MonsterConfig)
      step.TargetItem = String(source.TaskItemConfig)
      step.TargetRequireNum = 3
      drops[id] = [{ ...source }]
    }
    steps[id] = [step]
    if (sourceId === 30022) {
      tasks[id]!.AcceptNpcConfig = tasks[id]!.SubmitNpcConfig = 'n21004'
      tasks[id]!.AcceptNpcSceneID = tasks[id]!.SubmitNpcSceneID = 2103
      steps[id] = [33010, 33020].map((target, i) => ({
        ...step,
        SetpSeq: i,
        SubmitSceneID: 2103,
        TargetConfiger: `n${target}`,
        TargetRequireNum: i === 0 ? 8 : 6,
        SubTaskDescription: `RebornQuest_${id}_step_${i}`,
      }))
    }
    for (const [i, objective] of steps[id]!.entries()) {
      // The API supplies the character-local target name key for this authored template.
      const descriptions: Record<number, string> = {
        1: `Recover ${objective.TargetRequireNum} supplies from {@0:target}.`,
        2: `Defeat ${objective.TargetRequireNum} {@0:target}.`,
        3: 'Speak with {@0:target}.',
        8: narrative,
      }
      text[`lg_RebornQuest_${id}_step_${i}`] = descriptions[Number(objective.SubTaskType)]!
    }
  }
  return { tasks, steps, drops, text }
}

function writeIfChanged(path: URL, contents: string) {
  let old = ''
  try {
    old = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (old !== contents) writeFileSync(path, contents)
}

export function writeGenerated() {
  const generated = generate()
  for (const [name, data] of [
    ['tasks', generated.tasks],
    ['sub-tasks', generated.steps],
    ['task-monster-drops', generated.drops],
  ] as const) {
    writeIfChanged(
      new URL(`server/data/game/reborn/${name}.json`, root),
      JSON.stringify(data, null, 2) + '\n',
    )
  }
  const path = new URL('client/src/i18n/reborn.json', root)
  const old = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  for (const key of Object.keys(old))
    if (/^lg_(Task(?:Des)?_8[23]\d{4}|RebornQuest_8[23]\d{4}_)/.test(key)) delete old[key]
  writeIfChanged(path, JSON.stringify({ ...old, ...generated.text }, null, 2) + '\n')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) writeGenerated()
