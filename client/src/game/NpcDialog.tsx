import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage, useAcceptQuest, useQuests, type useTalk } from './api'
import { completedNotice } from './QuestLog'
import { Dialog, GameButton, Notice } from './skin'
import { GameText, plainText } from './text'
import type { SceneNpc } from './types'
import { questOffers } from './world'

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
  const quests = useQuests()
  const accept = useAcceptQuest()
  const [accepted, setAccepted] = useState<number | null>(null)
  const offers = talk.isSuccess
    ? questOffers(npc.id, character.sceneId, character, quests.data ?? [])
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
    <Dialog title={plainText(npc.nameKey, 'Villager')} onClose={onClose}>
      {talk.isPending && <p>...</p>}
      {talk.isError && <Notice tone="error">{errorMessage(talk.error)}</Notice>}
      {talk.data && (
        <div className="flex flex-col gap-3">
          <p>
            <GameText k={talk.data.dialogKey} fallback="Good day, ninja." />
          </p>
          {talk.data.completed.length > 0 && (
            <Notice>{completedNotice(talk.data.completed).trim()}</Notice>
          )}
          {accepted !== null && (
            <Notice>
              Quest accepted: {plainText(`lg_Task_${accepted}`, `Quest ${accepted}`)}.
            </Notice>
          )}
          {accept.isError && <Notice tone="error">{errorMessage(accept.error)}</Notice>}
          {offers.length > 0 && (
            <section aria-label="Quests offered" className="flex flex-col gap-2">
              {offers.map((offer) => (
                <article
                  key={offer.taskId}
                  className="rounded border border-wood-light/60 bg-white/50 p-2"
                >
                  <h3 className="font-bold">
                    <GameText k={`lg_Task_${offer.taskId}`} fallback={`Quest ${offer.taskId}`} />
                  </h3>
                  {offer.talkKey && (
                    <p className="mt-1 text-xs">
                      <GameText k={offer.talkKey} />
                    </p>
                  )}
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
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
