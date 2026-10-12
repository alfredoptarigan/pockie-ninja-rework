import type { Character } from '@pockie/shared'
import { useId, useState, type ReactNode } from 'react'
import { errorMessage, useAvailableQuests, useQuests, useTravel } from './api'
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
import type { BagHighlight, Quest, QuestOffer, SceneNpc, SceneView } from './types'
import { DEFEATED_REASON, destinations, isDefeated, questTarget } from './world'

type Tab = 'accepted' | 'available'
const TABS: { id: Tab; title: string }[] = [
  { id: 'accepted', title: 'Accepted' },
  { id: 'available', title: 'Available' },
]

interface Entry {
  quest: Quest | QuestOffer
  status: string
  hint: ReactNode
  sceneId?: number
  npcId?: string
  /** Tutorial steps done in the bag (open the newbie pack, equip the weapon). */
  bag?: BagHighlight
}

/** HUD anchor and size of Reborn's quest navigation panel (above the menu, bottom right). */
const PANEL = 'pointer-events-auto absolute right-[6px] bottom-[33px]'

/**
 * Quest Navigation panel at the bottom right of the HUD (UI_TaskShort): held and available
 * quests with Details (opens the quest window) and Go (travels to the quest's area, or opens its
 * NPC when already there).
 */
export function QuestNavigation({
  character,
  scene,
  onNpc,
  onOpenBag,
}: {
  character: Character
  scene: SceneView | undefined
  onNpc: (npc: SceneNpc) => void
  /** Opens the bag pointing at the items a tutorial step needs. */
  onOpenBag: (highlight: BagHighlight) => void
}) {
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('accepted')
  const quests = useQuests()
  const available = useAvailableQuests()
  const travel = useTravel()
  const ids = useId()

  if (!open) {
    return (
      <GameButton small className={PANEL} onClick={() => setOpen(true)}>
        Quest Navigation
      </GameButton>
    )
  }

  const entries: Entry[] =
    tab === 'accepted'
      ? (quests.data ?? []).map((quest) => ({
          quest,
          status: questStatus(quest),
          hint: <QuestHint quest={quest} />,
          ...questTarget(quest),
          bag: bagStep(quest),
        }))
      : [...(available.data?.available ?? [])]
          .sort(
            (a, b) =>
              Number(b.sceneId === character.sceneId) - Number(a.sceneId === character.sceneId),
          )
          .map((offer) => ({
            quest: offer,
            status: 'Available',
            hint: <OfferHint offer={offer} />,
            sceneId: offer.sceneId,
            npcId: offer.npcId,
          }))

  /** What Go does for an entry, or undefined when it cannot help. */
  const defeated = isDefeated(character)
  const goFor = (entry: Entry) => {
    if (entry.bag) return () => onOpenBag(entry.bag!)
    if (entry.sceneId !== undefined && entry.sceneId !== character.sceneId) {
      const place = destinations(character).find((d) => d.sceneId === entry.sceneId)
      return place?.open && !defeated ? () => travel.mutate(entry.sceneId!) : undefined
    }
    const npc = scene?.npcs.find((n) => n.id === entry.npcId)
    return npc ? () => onNpc(npc) : undefined
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className={`game-frame ${PANEL} flex h-[198px] w-[350px] flex-col px-[5px] pb-[4px]`}
    >
      <div className="game-frame-title flex h-[31px] shrink-0 items-start justify-between">
        <h2 id={`${ids}-title`} className="game-title-tag font-game font-bold">
          Quest Navigation
        </h2>
        <button
          type="button"
          aria-label="Close Quest Navigation"
          className="game-close mt-[4px] shrink-0"
          onClick={() => setOpen(false)}
        />
      </div>
      <div className="mt-[5px] shrink-0 pl-[5px]">
        <Tabs
          label="Quest lists"
          tabs={TABS}
          active={tab}
          onChange={setTab}
          panelId={`${ids}-list`}
        />
      </div>
      <div
        id={`${ids}-list`}
        role="tabpanel"
        className="game-inset min-h-0 flex-1 overflow-auto px-[9px] py-[8px] font-game text-[12px] [scrollbar-gutter:stable]"
      >
        {travel.isError && <Notice tone="error">{errorMessage(travel.error)}</Notice>}
        {defeated && <Notice tone="error">{DEFEATED_REASON} Travel is closed until then.</Notice>}
        {entries.length === 0 && (
          <p className="p-1">
            {tab === 'accepted' ? 'No quests yet. Look in Available.' : 'Nothing new right now.'}
          </p>
        )}
        <ul
          aria-label={tab === 'accepted' ? 'Accepted quests' : 'Available quests'}
          className="flex flex-col gap-[4px]"
        >
          {entries.map((entry) => {
            const go = goFor(entry)
            const name = questName(entry.quest)
            return (
              <QuestRow
                key={entry.quest.taskId}
                name={name}
                status={entry.status}
                hint={entry.hint}
              >
                <DetailsButton quest={entry.quest} onNpc={onNpc} />
                <GameButton
                  small
                  className={ROW_BUTTON}
                  aria-label={`Go: ${name}`}
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
