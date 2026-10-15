import type { Character, DailyView } from '@pockie/shared'
import { useId, useState, type ReactNode } from 'react'
import { errorMessage, useAvailableQuests, useQuests, useTravel } from './api'
import { useDaily } from './daily/api'
import { stepText } from './daily/TaskBoard'
import {
  bagStep,
  DetailsButton,
  OfferHint,
  QuestHint,
  questName,
  QuestRow,
  questStatus,
  ROW_BUTTON,
} from './QuestLog'
import { GameButton, Notice, Tabs } from './skin'
import { plainText } from './text'
import type { BagHighlight, Quest, QuestOffer, SceneNpc, SceneView } from './types'
import { useOpenWindow } from './windows'
import { DEFEATED_REASON, destinations, isDefeated, questTarget } from './world'

type Tab = 'accepted' | 'available' | 'daily'
const TABS: { id: Tab; title: string }[] = [
  { id: 'accepted', title: 'Accepted' },
  { id: 'available', title: 'Available' },
  { id: 'daily', title: 'Daily' },
]
const EMPTY: Record<Tab, string> = {
  accepted: 'No quests yet. Look in Available.',
  available: 'Nothing new right now.',
  daily: 'Accept quests on the Taskboard in Ninja Diary',
}
const LIST_NAME: Record<Tab, string> = {
  accepted: 'Accepted quests',
  available: 'Available quests',
  daily: 'Daily quests',
}

type DailyQuest = DailyView['quests'][number]
/** Daily quest states: 1 held, 2 every step done (turn in at the Task Board). */
const DAILY_HELD = 1
const DAILY_DONE = 2

interface Entry {
  key: number
  name: string
  /** "[Main]" or "[Daily]" before the name, as Reborn titles the rows. */
  tag: 'Main' | 'Daily'
  status: string
  hint: ReactNode
  /** Main quests open the quest window; daily ones the Task Board. */
  quest?: Quest | QuestOffer
  sceneId?: number
  npcId?: string
  /** Tutorial steps done in the bag (open the newbie pack, equip the weapon). */
  bag?: BagHighlight
  /** Go opens the Task Board (a finished daily quest). */
  taskBoard?: boolean
}

/** HUD anchor and size of Reborn's quest navigation panel (classic theme, bottom 80, right 4). */
const PANEL = 'pointer-events-auto absolute right-[4px] bottom-[80px]'

function dailyEntry(quest: DailyQuest): Entry {
  const index = quest.steps.findIndex((s, i) => (quest.progress[i] ?? 0) < s.target)
  const step = quest.steps[index]
  const done = quest.state === DAILY_DONE || !step
  return {
    key: quest.taskId,
    name: plainText(quest.nameKey, `Quest ${quest.taskId}`),
    tag: 'Daily',
    status: done ? 'Completed' : 'Accepted',
    hint: done
      ? 'Turn in at Task Board'
      : `${stepText(step)} ${quest.progress[index] ?? 0}/${step.target}`,
    sceneId: done ? undefined : step.sceneId,
    taskBoard: done,
  }
}

/**
 * Reborn's Quest Navigation panel (reborn-windows-M-Z-hud.md "Quest Navigation"), bottom right
 * over the menu bar: Accepted, Available and Daily tabs of 55px rows "[Main]Name|State" with
 * Details (the quest window, or the Task Board for daily quests) and Go (travels to the quest's
 * area, or opens its NPC when already there; a finished daily quest goes to the Task Board).
 * It opens on Accepted when quests are held, else Available, else Daily.
 * ponytail: no "Lv.N" / "Level Required" on Available rows; the server only offers quests the
 * ninja can take.
 */
export function QuestNavigation({
  character,
  scene,
  onNpc,
  onOpenBag,
  open,
  onClose,
}: {
  /** Reborn's bottom-bar Tasks button shows and hides the panel (shown by default). */
  open: boolean
  onClose: () => void
  character: Character
  scene: SceneView | undefined
  onNpc: (npc: SceneNpc) => void
  /** Opens the bag pointing at the items a tutorial step needs. */
  onOpenBag: (highlight: BagHighlight) => void
}) {
  const [chosen, setChosen] = useState<Tab | null>(null)
  const quests = useQuests()
  const available = useAvailableQuests()
  const daily = useDaily()
  const travel = useTravel()
  const openWindow = useOpenWindow()
  const ids = useId()

  if (!open) return null

  const heldDaily = (daily.data?.quests ?? []).filter(
    (quest) => quest.state === DAILY_HELD || quest.state === DAILY_DONE,
  )
  const offers = available.data?.available ?? []
  const tab: Tab =
    chosen ??
    (quests.data?.length
      ? 'accepted'
      : offers.length
        ? 'available'
        : heldDaily.length
          ? 'daily'
          : 'accepted')

  const entries: Entry[] =
    tab === 'accepted'
      ? (quests.data ?? []).map((quest) => ({
          key: quest.taskId,
          name: questName(quest),
          tag: 'Main',
          quest,
          status: questStatus(quest),
          hint: <QuestHint quest={quest} />,
          ...questTarget(quest),
          bag: bagStep(quest),
        }))
      : tab === 'available'
        ? [...offers]
            .sort(
              (a, b) =>
                Number(b.sceneId === character.sceneId) - Number(a.sceneId === character.sceneId),
            )
            .map((offer) => ({
              key: offer.taskId,
              name: questName(offer),
              tag: 'Main',
              quest: offer,
              status: 'Available',
              hint: <OfferHint offer={offer} />,
              sceneId: offer.sceneId,
              npcId: offer.npcId,
            }))
        : heldDaily.map(dailyEntry)

  /** What Go does for an entry, or undefined when it cannot help. */
  const defeated = isDefeated(character)
  const goFor = (entry: Entry) => {
    if (entry.taskBoard) return () => openWindow('daily')
    if (entry.bag) return () => onOpenBag(entry.bag!)
    if (entry.sceneId !== undefined && entry.sceneId > 0 && entry.sceneId !== character.sceneId) {
      const place = destinations(character).find((d) => d.sceneId === entry.sceneId)
      return place?.open && !defeated ? () => travel.mutate(entry.sceneId!) : undefined
    }
    const npc = scene?.npcs.find((n) => n.id === entry.npcId)
    return npc ? () => onNpc(npc) : undefined
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className={`game-frame ${PANEL} flex h-[160px] w-[340px] flex-col px-[5px] pb-[4px]`}
    >
      <div className="game-frame-title flex h-[24px] shrink-0 items-start justify-between">
        <h2 id={`${ids}-title`} className="game-title-tag font-game font-bold">
          Quest Navigation
        </h2>
        <button
          type="button"
          aria-label="Close Quest Navigation"
          className="game-close mt-[2px] shrink-0"
          onClick={() => onClose()}
        />
      </div>
      <div className="mt-[2px] shrink-0 pl-[5px]">
        <Tabs
          label="Quest lists"
          tabs={TABS}
          active={tab}
          onChange={setChosen}
          panelId={`${ids}-list`}
        />
      </div>
      <div
        id={`${ids}-list`}
        role="tabpanel"
        className="game-inset min-h-0 flex-1 overflow-auto px-[6px] py-[5px] font-game text-[12px] [scrollbar-gutter:stable]"
      >
        {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
        {defeated && <Notice tone="error">{DEFEATED_REASON} Travel is closed until then.</Notice>}
        {entries.length === 0 && <p className="p-1">{EMPTY[tab]}</p>}
        <ul aria-label={LIST_NAME[tab]} className="flex flex-col gap-[3px]">
          {entries.map((entry) => {
            const go = goFor(entry)
            return (
              <QuestRow
                key={entry.key}
                name={`[${entry.tag}]${entry.name}`}
                status={entry.status}
                hint={entry.hint}
              >
                {entry.quest ? (
                  <DetailsButton quest={entry.quest} onNpc={onNpc} />
                ) : (
                  <GameButton
                    small
                    className={ROW_BUTTON}
                    aria-label={`Details: ${entry.name}`}
                    onClick={() => openWindow('daily')}
                  >
                    Details
                  </GameButton>
                )}
                <GameButton
                  small
                  className={ROW_BUTTON}
                  aria-label={`Go: ${entry.name}`}
                  disabled={!go || travel.isPending}
                  onClick={go}
                >
                  Go
                </GameButton>
              </QuestRow>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
