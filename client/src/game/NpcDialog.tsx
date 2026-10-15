import type { Character } from '@pockie/shared'
import { useState, type ComponentProps } from 'react'
import { errorMessage, useAcceptQuest, useAvailableQuests, useRest, type useTalk } from './api'
import { useNpcPhoto } from './art'
import { completedNotice, questName } from './QuestLog'
import { QuestRewardList } from './Rewards'
import { Dialog, Notice } from './skin'
import { showToast } from './toast'
import { GameText, plainText } from './text'
import type { NpcMenu, SceneNpc } from './types'
import { useOpenWindow, type WindowName } from './windows'
import { restCost } from './world'
import { ChangeVillageOption } from './ChangeVillage'
import { useBeginHunt, useCompleteHunt } from './hunt'

/**
 * The menu row that opens an NPC's window, in Reborn's words: shops "Browse Wares" (Dungeon
 * Shop NPC), the Blacksmith "Enter Armory", daily quests the Task Board.
 */
const WINDOW_OPTIONS: Record<Exclude<NpcMenu, 'rest'>, { window: WindowName; label: string }> = {
  shop: { window: 'shop', label: 'Browse Wares' },
  merchant: { window: 'merchant', label: 'Browse Wares' },
  forge: { window: 'forge', label: 'Enter Armory' },
  gates: { window: 'gates', label: 'Enter' },
  daily: { window: 'daily', label: 'Task Board' },
  arena: { window: 'arena', label: 'Enter Arena' },
}

type Page = 'main' | 'quests' | 'recovery' | 'confirm' | 'healed' | 'hunt'
const stones = (amount: number) => amount.toLocaleString('en-US')

/**
 * NPC menu laid out like Reborn's (reborn-windows-M-Z-hud.md "Village Elder", 475x204): the
 * portrait card on the left (TottomBG1, EstopCircle), the NPC's words top right (309x65) and the
 * clickable option lines under them (309x134), End Conversation always last. Quests lists one row
 * per quest. The Stone Organization's rest follows the Elder's Recover HP & MP steps: Healing
 * Service, Yes, Heal Me, Healing complete! (Free Healing heals at once while it costs nothing).
 */
export function NpcDialog({
  npc,
  talk,
  character,
  onClose,
}: {
  npc: SceneNpc
  talk: ReturnType<typeof useTalk>
  character: Character
  onClose: () => void
}) {
  const available = useAvailableQuests()
  const accept = useAcceptQuest()
  const photo = useNpcPhoto(npc.id)
  const openWindow = useOpenWindow()
  const rest = useRest()
  const beginHunt = useBeginHunt()
  const completeHunt = useCompleteHunt()
  const onHuntError = (error: Error) => showToast(errorMessage(error), 'failure')
  const [page, setPage] = useState<Page>('main')
  const showQuests = page === 'quests'
  const setShowQuests = (show: boolean) => setPage(show ? 'quests' : 'main')
  const menu = npc.menu ?? null
  const windowOption = menu && menu !== 'rest' ? WINDOW_OPTIONS[menu] : undefined
  const cost = restCost(character.level)
  const heal = () =>
    rest.mutate(npc.id, {
      onSuccess: () => setPage('healed'),
      onError: (error) => showToast(errorMessage(error), 'failure'),
    })
  const [accepted, setAccepted] = useState<number | null>(null)
  const offers = talk.isSuccess
    ? (available.data?.available ?? []).filter(
        (offer) => offer.npcId === npc.id && offer.sceneId === character.sceneId,
      )
    : []

  const onAccept = async (taskId: number) => {
    setAccepted(null)
    try {
      await accept.mutateAsync(taskId)
      setAccepted(taskId)
    } catch {
      // shown from accept.error below
    }
  }

  return (
    <Dialog
      title={plainText(npc.nameKey, npc.menu === 'rest' ? 'Stone Organization' : 'Villager')}
      onClose={onClose}
      className="game-window-bare w-[485px]"
    >
      <div className="flex gap-[5px]">
        <div className="game-npc-card relative h-[204px] w-[161px] shrink-0">
          <div className="game-npc-frame absolute top-[13px] left-[13px] h-[182px] w-[137px] overflow-hidden">
            {photo && <img src={photo} alt="" className="size-full object-contain" />}
          </div>
        </div>
        <div className="flex w-[309px] flex-col gap-[5px]">
          <div className="game-inset flex min-h-[65px] flex-col gap-1 p-[5px] font-[monospace] text-[12px] leading-[14px] text-black">
            {talk.isPending && <p>...</p>}
            {talk.isError && <Notice tone="error">{errorMessage(talk.error)}</Notice>}
            {talk.data && (
              <p className="whitespace-pre-wrap">
                <GameText k={talk.data.dialogKey} fallback="Good day, ninja." />
              </p>
            )}
            {talk.data && talk.data.completed.length > 0 && (
              <Notice>{completedNotice(talk.data.completed).trim()}</Notice>
            )}
            {talk.data?.rewards?.map((handIn) => (
              <QuestRewardList
                key={handIn.taskId}
                rewards={handIn}
                title={`Received for ${questName({ taskId: handIn.taskId, nameKey: `lg_Task_${handIn.taskId}` })}`}
              />
            ))}
            {accepted !== null && (
              <Notice>
                Quest accepted: {questName({ taskId: accepted, nameKey: `lg_Task_${accepted}` })}.
              </Notice>
            )}
            {accept.isError && <Notice tone="error">{errorMessage(accept.error)}</Notice>}
          </div>
          <div className="game-inset h-[134px] overflow-auto px-[5px] py-[6px] font-game text-[13px]">
            {showQuests ? (
              <section aria-label="Quests offered" className="flex flex-col gap-px">
                {offers.length === 0 && (
                  <p className="px-[9px] py-[3px] text-[#3d2914]">No quests for you right now.</p>
                )}
                {offers.map((offer) => (
                  <article key={offer.taskId} aria-label={questName(offer)}>
                    <Option disabled={accept.isPending} onClick={() => onAccept(offer.taskId)}>
                      Accept quest
                      <span aria-hidden="true">: {questName(offer)}</span>
                    </Option>
                  </article>
                ))}
                <Option onClick={() => setShowQuests(false)}>Back</Option>
                <Option onClick={onClose}>End Conversation</Option>
              </section>
            ) : page !== 'main' ? (
              <ul aria-label="Options" className="flex flex-col gap-px">
                {page === 'recovery' && (
                  <>
                    <li>
                      {cost === 0 ? (
                        <Option disabled={rest.isPending} onClick={heal}>
                          Free Healing
                        </Option>
                      ) : (
                        <Option
                          disabled={character.stone < cost}
                          onClick={() => setPage('confirm')}
                        >
                          {character.stone < cost
                            ? `You need ${stones(cost)} stones`
                            : `Healing Service (${stones(cost)} Stones)`}
                        </Option>
                      )}
                    </li>
                    <li>
                      <Option onClick={() => setPage('main')}>Back</Option>
                    </li>
                  </>
                )}
                {page === 'confirm' && (
                  <>
                    <li>
                      <Option disabled={rest.isPending} onClick={heal}>
                        Yes, Heal Me ({stones(cost)} Stones)
                      </Option>
                    </li>
                    <li>
                      <Option onClick={() => setPage('recovery')}>Cancel</Option>
                    </li>
                  </>
                )}
                {page === 'hunt' && (
                  <>
                    <li>
                      <Option
                        disabled={beginHunt.isPending}
                        onClick={() => beginHunt.mutate(undefined, { onError: onHuntError })}
                      >
                        Begin Hunt
                      </Option>
                    </li>
                    <li>
                      <Option
                        disabled={completeHunt.isPending}
                        onClick={() =>
                          completeHunt.mutate(undefined, {
                            onError: onHuntError,
                            onSuccess: ({ arenaTriesRestored }) =>
                              showToast(
                                `Hunt complete! ${arenaTriesRestored} arena ${arenaTriesRestored === 1 ? 'challenge' : 'challenges'} restored.`,
                                'success',
                              ),
                          })
                        }
                      >
                        Finish Hunt
                      </Option>
                    </li>
                    <li>
                      <Option onClick={() => setPage('main')}>Back</Option>
                    </li>
                  </>
                )}
                {page === 'healed' && (
                  <>
                    <li className="px-[9px] py-[3px] text-[#3d2914]">Healing complete!</li>
                    <li>
                      <Option onClick={onClose}>Thank you!</Option>
                    </li>
                  </>
                )}
                <li>
                  <Option onClick={onClose}>End Conversation</Option>
                </li>
              </ul>
            ) : (
              <ul aria-label="Options" className="flex flex-col gap-px">
                {offers.length > 0 && (
                  <li>
                    <Option onClick={() => setShowQuests(true)}>Quests</Option>
                  </li>
                )}
                {windowOption && (
                  <li>
                    <Option onClick={() => openWindow(windowOption.window, { npcId: npc.id })}>
                      {windowOption.label}
                    </Option>
                  </li>
                )}
                {menu === 'arena' && (
                  <li>
                    <Option onClick={() => setPage('hunt')}>Hunt Monsters</Option>
                  </li>
                )}
                {menu === 'rest' && (
                  <li>
                    <Option onClick={() => setPage('recovery')}>Recover HP &amp; MP</Option>
                  </li>
                )}
                {menu === 'rest' && (
                  <li>
                    <Option onClick={() => openWindow('teamBoard', { npcId: npc.id })}>
                      Team Board
                    </Option>
                  </li>
                )}
                <ChangeVillageOption npc={npc} character={character} onEnd={onClose} />
                <li>
                  <Option onClick={onClose}>End Conversation</Option>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/** One option row of the NPC menu (299x23). */
function Option(props: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="game-npc-option block h-[23px] w-full truncate px-[9px] text-left"
      {...props}
    />
  )
}
