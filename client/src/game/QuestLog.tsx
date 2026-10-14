// Quest rows and the quest detail window (UI_TaskShort rows, UI_TaskInfo_Xml window), shared by
// the Quest Navigation panel and the Quest Log window.
import { useState, type ReactNode } from 'react'
import { useQuests, useScene } from './api'
import { QuestRewardFields } from './Rewards'
import { Dialog, GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import type { BagHighlight, Quest, QuestOffer, SceneNpc } from './types'
import { questStepArgs, questTarget, sceneNameKey } from './world'

/** Reborn objectives receive local target keys with their quest response. */
function objectiveArgs(quest: Quest, index: number, current: number, total: number) {
  const step = quest.steps[index] as Quest['steps'][number] & { descriptionArgs?: string[] }
  return (
    step.descriptionArgs?.map((key) => plainText(key, key)) ??
    questStepArgs(quest.taskId, index, current, total)
  )
}

/** " Quest complete: X." suffix for action messages. */
export function completedNotice(taskIds: number[]) {
  if (taskIds.length === 0) return ''
  const names = taskIds.map((id) => plainText(`lg_Task_${id}`, `Quest ${id}`))
  return ` Quest complete: ${names.join(', ')}.`
}

export const questName = (quest: { taskId: number; nameKey: string }) =>
  plainText(quest.nameKey, `Quest ${quest.taskId}`)

/** Every step done means the quest only waits for its hand-in, which Reborn calls Completed. */
export const questStatus = (quest: Quest) => (quest.state === 1 ? 'Completed' : 'In progress')

const STATUS_COLOR: Record<string, string> = {
  Completed: 'text-[#1b6e17]',
  'In progress': 'text-[#9a4a00]',
  Available: 'text-[#0a5f93]',
}

/** The bag item an unfinished rookie command step needs: the item to use, or a weapon. */
export function bagStep(quest: Quest): BagHighlight | undefined {
  const step = quest.steps.find((s, i) => (quest.progress[i] ?? 0) < s.target)
  if (step?.command === 'use' && step.itemId) return { itemId: step.itemId }
  if (step?.command === 'equip') return { equipment: true }
  return undefined
}

function NpcName({ npcId, fallback }: { npcId: string; fallback: string }) {
  return <span className="text-[#1b6e17]">{plainText(`lg_name_${npcId}`, fallback)}</span>
}

/** Where a held quest sends the player: the bag for tutorial steps, else the NPC to talk to. */
export function QuestHint({ quest }: { quest: Quest }) {
  const bag = bagStep(quest)
  if (bag) {
    return 'itemId' in bag
      ? 'Open your bag and use the item.'
      : 'Open your bag and equip your weapon.'
  }
  if (
    (quest.taskId >= 820001 && quest.taskId <= 820022) ||
    (quest.taskId >= 830001 && quest.taskId <= 830118)
  ) {
    if (quest.state === 1) return 'Return to the quest giver to submit your report.'
    const step = quest.steps.find((s, i) => (quest.progress[i] ?? 0) < s.target)
    return step ? (
      <GameText
        k={step.descriptionKey}
        fallback="Open Details for your objective."
        args={objectiveArgs(quest, quest.steps.indexOf(step), 0, step.target)}
      />
    ) : null
  }
  const { npcId } = questTarget(quest)
  if (!npcId) return null
  return (
    <>
      Talk to <NpcName npcId={npcId} fallback="them" />
    </>
  )
}

/** "Talk to <NPC> in <area>" for a quest on offer. */
export function OfferHint({ offer }: { offer: QuestOffer }) {
  return (
    <>
      Talk to <NpcName npcId={offer.npcId} fallback="a villager" /> in{' '}
      {plainText(sceneNameKey(offer.sceneId), 'another area')}
    </>
  )
}

/** A quest row like Reborn's navigation list: "Name|State", the target line, buttons on the right. */
export function QuestRow({
  name,
  status,
  hint,
  children,
}: {
  name: string
  status: string
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <li className="game-card flex items-start gap-[6px] py-[5px] pr-[5px] pl-[8px] font-game text-[12px] leading-[15px] text-black">
      <span aria-hidden="true" className="game-icon-notice mt-[3px] size-4 shrink-0" />
      <div className="min-w-0 flex-1 pt-[2px]">
        <p>
          <span>{name}</span>|<span className={STATUS_COLOR[status]}>{status}</span>
        </p>
        {hint && <p>{hint}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-[3px]">{children}</div>
    </li>
  )
}

export const ROW_BUTTON = 'h-5 w-[46px] min-w-0 px-0'

/** Details on a quest row: opens the quest window for that quest. */
export function DetailsButton({
  quest,
  onNpc,
}: {
  quest: Quest | QuestOffer
  onNpc?: (npc: SceneNpc) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <GameButton
        small
        className={ROW_BUTTON}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Details: ${questName(quest)}`}
        onClick={() => setOpen(true)}
      >
        Details
      </GameButton>
      {open && <QuestDetail quest={quest} onNpc={onNpc} onClose={() => setOpen(false)} />}
    </>
  )
}

function Steps({ quest }: { quest: Quest }) {
  return (
    <ul className="flex flex-col gap-[2px]">
      {quest.steps.map((step, i) => {
        const done = Math.min(quest.progress[i] ?? 0, step.target)
        return (
          <li key={step.descriptionKey + i} className="flex justify-between gap-2">
            <span>
              <GameText
                k={step.descriptionKey}
                fallback="Objective"
                args={objectiveArgs(quest, i, done, step.target)}
              />
            </span>
            <span className={`shrink-0 ${done >= step.target ? 'text-[#1b6e17]' : ''}`}>
              {done}/{step.target}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Heading bar of the quest window: the light field with the scroll or notice icon. */
function Section({
  icon,
  title,
  className = '',
  children,
}: {
  icon: 'scroll' | 'notice'
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title}>
      <h3 className="game-text-box relative flex h-5 items-center pl-[30px] font-[monospace] text-[12px] font-normal">
        <span
          aria-hidden="true"
          className={
            icon === 'scroll'
              ? 'game-icon-scroll absolute -top-[3px] left-0 h-[27px] w-[30px]'
              : 'game-icon-notice absolute top-[3px] left-[6px] size-4'
          }
        />
        {title}
      </h3>
      <div className={`mt-[5px] ${className}`}>{children}</div>
    </section>
  )
}

/**
 * The quest window: name and story, progress, rewards. Turn In shows when the quest only waits for
 * its hand-in and the NPC who takes it is in this scene (talking to them hands it in).
 */
export function QuestDetail({
  quest,
  onClose,
  onNpc,
}: {
  quest: Quest | QuestOffer
  onClose: () => void
  onNpc?: (npc: SceneNpc) => void
}) {
  const scene = useScene()
  const held = 'steps' in quest ? quest : undefined
  const handInNpc =
    held?.state === 1 && onNpc
      ? scene.data?.npcs.find((npc) => npc.id === questTarget(held).npcId)
      : undefined
  const name = questName(quest)
  return (
    <Dialog
      title={name}
      onClose={onClose}
      className="game-window-bare w-[350px] [&_.game-title-tag]:opacity-0"
    >
      <div className="game-inset h-[388px] overflow-auto px-[10px] pt-[20px] pb-[10px] font-[monospace] text-[12px] leading-[14px] text-black">
        <Section icon="scroll" title={name} className="mb-[5px] min-h-[75px] px-[10px]">
          {'steps' in quest ? (
            <GameText k={quest.descriptionKey} />
          ) : quest.talkKey ? (
            <GameText k={quest.talkKey} />
          ) : (
            <OfferHint offer={quest} />
          )}
        </Section>
        {held && (
          <Section icon="notice" title="Progress" className="mb-[10px] min-h-[45px] px-[10px]">
            <Steps quest={held} />
          </Section>
        )}
        <Section icon="notice" title="Rewards" className="pt-[5px]">
          <QuestRewardFields rewards={quest.rewards} />
        </Section>
      </div>
      <div className="mt-[10px] grid grid-cols-2 justify-items-center">
        {handInNpc && onNpc && (
          <GameButton
            className="h-[22px] w-[90px]"
            onClick={() => {
              onClose()
              onNpc(handInNpc)
            }}
          >
            Turn In
          </GameButton>
        )}
        <GameButton className="col-start-2 h-[22px] w-[90px]" onClick={onClose}>
          Close
        </GameButton>
      </div>
    </Dialog>
  )
}

/** The menu's Quest Log: the held quests as rows; Details opens the quest window. */
export function QuestLog({ onNpc }: { onNpc?: (npc: SceneNpc) => void }) {
  const quests = useQuests()
  if (quests.isPending) return <p>Reading your quest log...</p>
  if (quests.isError) return <Notice tone="error">We could not load your quests.</Notice>
  if (quests.data.length === 0) return <p>No quests right now. Talk to the villagers.</p>

  const groups = [
    {
      title: 'Quests',
      rows: quests.data.filter((quest) => quest.taskId < 830001 || quest.taskId > 830118),
    },
    {
      title: 'Reborn Story',
      rows: quests.data.filter((quest) => quest.taskId >= 830001 && quest.taskId <= 830118),
    },
  ]
  return (
    <div className="flex flex-col gap-3">
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <Section key={group.title} icon="scroll" title={group.title}>
            <ul
              className="flex flex-col gap-[4px]"
              aria-label={group.title === 'Quests' ? 'Quest log' : group.title}
            >
              {group.rows.map((quest) => (
                <QuestRow
                  key={quest.taskId}
                  name={questName(quest)}
                  status={questStatus(quest)}
                  hint={<QuestHint quest={quest} />}
                >
                  <DetailsButton quest={quest} onNpc={onNpc} />
                </QuestRow>
              ))}
            </ul>
          </Section>
        ))}
    </div>
  )
}
