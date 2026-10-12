import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DailyView } from '@pockie/shared'
import { api } from '../../lib/api'
import { errorMessage, gameKeys } from '../api'
import { QuestRewardFields } from '../Rewards'
import { Dialog, GameButton, Notice } from '../skin'
import { plainText } from '../text'
import { sceneNameKey } from '../world'

export function useOpenDaily() {
  const [isOpen, setOpen] = useState(false)
  return { isOpen, open: () => setOpen(true), close: () => setOpen(false) }
}
const dailyKey = ['game', 'daily'] as const
function countdown(resetAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(resetAt) - now) / 1000))
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
/** DayTaskSystem.OnCustomOpenTaskDialog: board, objectives and ordinary reward hand-in. */
export function DailyQuestWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectType, setSelectType] = useState<0 | 1 | 2 | 3>(0)
  const [now, setNow] = useState(Date.now)
  const daily = useQuery({
    queryKey: dailyKey,
    queryFn: () => api<DailyView>('/api/game/daily'),
    refetchInterval: 30000,
  })
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const action = useMutation({
    mutationFn: ({ taskId, operation }: { taskId: number; operation: 'accept' | 'hand-in' }) =>
      api<DailyView>(`/api/game/daily/${taskId}/${operation}`, {
        method: 'POST',
        body: operation === 'hand-in' ? { selectType } : undefined,
      }),
    onSuccess: (data) => {
      setSelectType(0)
      queryClient.setQueryData(dailyKey, data)
      void queryClient.invalidateQueries({ queryKey: gameKeys.all })
    },
  })
  return (
    <Dialog title="Daily Quests" onClose={onClose} className="game-window-bare w-[350px]">
      <div className="game-inset max-h-[388px] overflow-auto p-[10px] font-game text-[12px] text-black">
        {daily.isPending && <p>Reading daily quests...</p>}
        {daily.isError && <Notice tone="error">{errorMessage(daily.error)}</Notice>}
        {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
        {daily.data && (
          <>
            <p>
              Completed: {daily.data.completed}/{daily.data.limit}
            </p>
            <p>Reset in {countdown(daily.data.resetAt, now)} (00:00 UTC)</p>
            <p>Offers refresh in {countdown(daily.data.refreshAt, now)}</p>
            <ul aria-label="Daily quests" className="mt-2 flex flex-col gap-2">
              {daily.data.quests.map((quest) => (
                <li key={quest.taskId} className="game-card p-2">
                  <p>{plainText(quest.nameKey, `Quest ${quest.taskId}`)}</p>
                  <p>{['Available', 'In progress', 'Completed', 'Reward claimed'][quest.state]}</p>
                  {quest.steps.map((step, index) => (
                    <p key={index}>
                      {step.kind && step.targetNameKey
                        ? `${step.kind === 'kill' ? 'Defeat' : step.kind === 'talk' ? 'Talk to' : 'Collect'} ${plainText(step.targetNameKey, step.targetId)}${step.sceneId && step.sceneId > 0 ? ` in ${plainText(sceneNameKey(step.sceneId), `Field ${step.sceneId}`)}` : ''}`
                        : plainText(step.descriptionKey, 'Objective')}{' '}
                      <span>
                        {Math.min(quest.progress[index] ?? 0, step.target)}/{step.target}
                      </span>
                    </p>
                  ))}
                  <QuestRewardFields rewards={quest.rewards} />
                  {quest.state === 2 && (quest.grade ?? 0) >= 2 && (
                    <label>
                      EXP reward{' '}
                      <select
                        aria-label={`EXP reward for ${quest.taskId}`}
                        value={selectType}
                        onChange={(event) =>
                          setSelectType(Number(event.target.value) as 0 | 1 | 2 | 3)
                        }
                      >
                        <option value={0}>Normal reward</option>
                        <option value={1}>+25% EXP for 1 Gold</option>
                        <option value={2}>+20% EXP for 1 Gift Coupon</option>
                        <option value={3}>+10% EXP for 1,000 Stone</option>
                      </select>
                    </label>
                  )}
                  {(quest.state === 0 || quest.state === 2) && (
                    <GameButton
                      small
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({
                          taskId: quest.taskId,
                          operation: quest.state === 0 ? 'accept' : 'hand-in',
                        })
                      }
                    >
                      {quest.state === 0 ? 'Accept' : 'Turn In'}
                    </GameButton>
                  )}
                </li>
              ))}
            </ul>
            {!daily.data.quests.length && <p>No daily quests are available right now.</p>}
          </>
        )}
      </div>
      <div className="mt-[10px] flex justify-end">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}
