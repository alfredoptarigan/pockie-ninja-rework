import type { Character } from '@pockie/shared'
import { useId, useState, type ReactNode } from 'react'
import { errorMessage, useQuests, useTravel } from './api'
import { Steps } from './QuestLog'
import { GameButton, Notice, Tabs } from './skin'
import { GameText, plainText } from './text'
import type { SceneNpc, SceneView } from './types'
import { availableQuests, destinations, questTarget, sceneNameKey } from './world'

type Tab = 'accepted' | 'available'
const TABS: { id: Tab; title: string }[] = [
  { id: 'accepted', title: 'Accepted' },
  { id: 'available', title: 'Available' },
]

interface Entry {
  taskId: number
  nameKey: string
  status: string
  /** One-line hint under the name ("Talk to ..."). */
  hint: string
  details: ReactNode
  sceneId?: number
  npcId?: string
}

/**
 * Quest Navigation window on the right of the stage: held and available quests with Details
 * (expands the entry) and Go (travels to the quest's area, or opens its NPC when already there).
 */
export function QuestNavigation({
  character,
  scene,
  onNpc,
}: {
  character: Character
  scene: SceneView | undefined
  onNpc: (npc: SceneNpc) => void
}) {
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('accepted')
  const [expanded, setExpanded] = useState<number | null>(null)
  const quests = useQuests()
  const travel = useTravel()
  const ids = useId()

  if (!open) {
    return (
      <GameButton
        small
        className="pointer-events-auto absolute right-1 bottom-[44px]"
        onClick={() => setOpen(true)}
      >
        Quest Navigation
      </GameButton>
    )
  }

  const held = quests.data ?? []
  const entries: Entry[] =
    tab === 'accepted'
      ? held.map((quest) => {
          const target = questTarget(quest)
          return {
            taskId: quest.taskId,
            nameKey: quest.nameKey,
            status: quest.state === 1 ? 'Completed' : 'In progress',
            hint: target.npcId ? `Find ${plainText(`lg_name_${target.npcId}`, 'them')}` : '',
            details: (
              <>
                <GameText k={quest.descriptionKey} />
                <Steps quest={quest} />
              </>
            ),
            ...target,
          }
        })
      : availableQuests(character, held)
          .sort(
            (a, b) => Number(b.scene === character.sceneId) - Number(a.scene === character.sceneId),
          )
          .map((offer) => ({
            taskId: offer.taskId,
            nameKey: `lg_Task_${offer.taskId}`,
            status: 'Available',
            hint: `Talk to ${plainText(`lg_name_${offer.npc}`, 'a villager')} in ${plainText(sceneNameKey(offer.scene), 'another area')}`,
            details: offer.talkKey ? <GameText k={offer.talkKey} /> : 'No details.',
            sceneId: offer.scene,
            npcId: offer.npc,
          }))

  /** What Go does for an entry, or undefined when it cannot help. */
  const goFor = (entry: Entry) => {
    if (entry.sceneId !== undefined && entry.sceneId !== character.sceneId) {
      const place = destinations(character).find((d) => d.sceneId === entry.sceneId)
      return place?.open ? () => travel.mutate(entry.sceneId!) : undefined
    }
    const npc = scene?.npcs.find((n) => n.id === entry.npcId)
    return npc ? () => onNpc(npc) : undefined
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="game-frame pointer-events-auto absolute right-1 bottom-[44px] flex h-[190px] w-[360px] flex-col px-2 pt-0 pb-2"
    >
      <div className="game-frame-title mb-1 flex items-center justify-between gap-2">
        <h2 id={`${ids}-title`} className="game-title-tag font-game text-sm font-bold">
          Quest Navigation
        </h2>
        <button
          type="button"
          aria-label="Close Quest Navigation"
          className="game-close shrink-0"
          onClick={() => setOpen(false)}
        />
      </div>
      <Tabs
        label="Quest lists"
        tabs={TABS}
        active={tab}
        onChange={setTab}
        panelId={`${ids}-list`}
      />
      <div
        id={`${ids}-list`}
        role="tabpanel"
        className="game-inset mt-0.5 min-h-0 flex-1 overflow-auto p-1.5 font-game text-xs"
      >
        {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
        {entries.length === 0 && (
          <p className="p-1">
            {tab === 'accepted' ? 'No quests yet. Look in Available.' : 'Nothing new right now.'}
          </p>
        )}
        <ul
          aria-label={tab === 'accepted' ? 'Accepted quests' : 'Available quests'}
          className="flex flex-col gap-1"
        >
          {entries.map((entry) => {
            const go = goFor(entry)
            const name = plainText(entry.nameKey, `Quest ${entry.taskId}`)
            const isOpen = expanded === entry.taskId
            return (
              <li key={entry.taskId} className="game-card flex gap-2 p-1.5">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {name}{' '}
                    <span className={entry.status === 'Completed' ? 'text-leaf' : 'font-normal'}>
                      | {entry.status}
                    </span>
                  </p>
                  {entry.hint && <p>{entry.hint}</p>}
                  {isOpen && (
                    <div className="mt-1 border-t border-[#d8c78a] pt-1">{entry.details}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <GameButton
                    small
                    aria-expanded={isOpen}
                    aria-label={`Details: ${name}`}
                    onClick={() => setExpanded(isOpen ? null : entry.taskId)}
                  >
                    Details
                  </GameButton>
                  <GameButton
                    small
                    aria-label={`Go: ${name}`}
                    disabled={!go || travel.isPending}
                    onClick={go}
                  >
                    Go
                  </GameButton>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
