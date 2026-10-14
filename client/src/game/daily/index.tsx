// Daily quests (DayTaskSystem) shown as Reborn's Task Board: its own window from the daily quest
// NPC, and the Task Board tab of the Ninja Diary.
import { useState } from 'react'
import { Dialog } from '../skin'
import { TaskBoard } from './TaskBoard'

export { TaskBoard }

export function useOpenDaily() {
  const [isOpen, setOpen] = useState(false)
  return { isOpen, open: () => setOpen(true), close: () => setOpen(false) }
}

export function DailyQuestWindow({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Task Board" onClose={onClose} className="game-window-bare w-[670px]">
      <TaskBoard />
    </Dialog>
  )
}
