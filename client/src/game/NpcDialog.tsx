import type { Character } from '@pockie/shared'
import { useState, type ReactNode } from 'react'
import { errorMessage, useAcceptQuest, useAvailableQuests, type useTalk } from './api'
import { useNpcPhoto } from './art'
import { completedNotice } from './QuestLog'
import { QuestRewardList } from './Rewards'
import { Dialog, GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import type { SceneNpc } from './types'

/** NPC conversation like the original: photo on the left, words and options on the right. */
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
    <Dialog title={plainText(npc.nameKey, 'Villager')} onClose={onClose} className="w-[40rem]">
      <div className="flex min-h-56 gap-3">
        <div className="game-card grid w-40 shrink-0 place-items-center overflow-hidden">
          {photo && <img src={photo} alt="" className="max-h-56 w-full object-contain" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="game-card min-h-16 p-2">
            {talk.isPending && <p>...</p>}
            {talk.isError && <Notice tone="error">{errorMessage(talk.error)}</Notice>}
            {talk.data && (
              <p>
                <GameText k={talk.data.dialogKey} fallback="Good day, ninja." />
              </p>
            )}
          </div>
          {talk.data && talk.data.completed.length > 0 && (
            <Notice>{completedNotice(talk.data.completed).trim()}</Notice>
          )}
          {talk.data?.rewards?.map((handIn) => (
            <div key={handIn.taskId} className="game-card px-2 pb-1">
              <QuestRewardList
                rewards={handIn}
                title={`Received for ${plainText(`lg_Task_${handIn.taskId}`, `Quest ${handIn.taskId}`)}`}
              />
            </div>
          ))}
          {accepted !== null && (
            <Notice>
              Quest accepted: {plainText(`lg_Task_${accepted}`, `Quest ${accepted}`)}.
            </Notice>
          )}
          {accept.isError && <Notice tone="error">{errorMessage(accept.error)}</Notice>}
          {showQuests ? (
            <section aria-label="Quests offered" className="flex flex-col gap-2">
              {offers.length === 0 && <p className="text-xs">No quests for you right now.</p>}
              {offers.map((offer) => (
                <article key={offer.taskId} className="game-card p-2">
                  <h3 className="font-bold">
                    <GameText k={`lg_Task_${offer.taskId}`} fallback={`Quest ${offer.taskId}`} />
                  </h3>
                  {offer.talkKey && (
                    <p className="mt-1 text-xs">
                      <GameText k={offer.talkKey} />
                    </p>
                  )}
                  <QuestRewardList rewards={offer.rewards} />
                  <GameButton
                    small
                    className="mt-2"
                    disabled={accept.isPending}
                    onClick={() => onAccept(offer.taskId)}
                  >
                    Accept quest
                  </GameButton>
                </article>
              ))}
              <DialogOption onClick={() => setShowQuests(false)}>Back</DialogOption>
            </section>
          ) : (
            <ul aria-label="Options" className="game-card flex flex-col p-1">
              {talk.isSuccess && (
                <li>
                  <DialogOption onClick={() => setShowQuests(true)}>
                    Quests{offers.length > 0 ? ` (${offers.length})` : ''}
                  </DialogOption>
                </li>
              )}
              <li>
                <DialogOption onClick={onClose}>End Conversation</DialogOption>
              </li>
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function DialogOption({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-sm border-b border-[#e3d39a] px-3 py-1 text-left hover:bg-[#f7e9a8]"
    >
      {children}
    </button>
  )
}
