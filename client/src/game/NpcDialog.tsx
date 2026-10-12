import type { Character } from '@pockie/shared'
import { useState, type ComponentProps } from 'react'
import { errorMessage, useAcceptQuest, useAvailableQuests, type useTalk } from './api'
import { useNpcPhoto } from './art'
import { completedNotice, questName } from './QuestLog'
import { QuestRewardList } from './Rewards'
import { Dialog, Notice } from './skin'
import { GameText, plainText } from './text'
import type { SceneNpc } from './types'

/**
 * NPC conversation laid out like the original UI_NpcMenu_Xml (485x242): the photo card on the
 * left, the NPC's words on the right and the options under them. The first page offers Quests
 * (when the NPC has some) and End Conversation; Quests lists one row per quest, Back and End
 * Conversation.
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
  const [showQuests, setShowQuests] = useState(false)
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
      title={plainText(npc.nameKey, 'Villager')}
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
            ) : (
              <ul aria-label="Options" className="flex flex-col gap-px">
                {offers.length > 0 && (
                  <li>
                    <Option onClick={() => setShowQuests(true)}>Quests</Option>
                  </li>
                )}
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
