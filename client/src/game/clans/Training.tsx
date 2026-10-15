// Reborn's Training (`Mh`, reborn-windows-M-Z-hud.md "Training"; 470x360) from the Clan Events
// tile: the hero picture (changes with the hovered course), the three course buttons, the three
// medallions with the countdown to midnight UTC once donated, "All daily training done", and
// "Confirm your donation?" (Confirm / Cancel; "Each course can be donated once per day").
import { useEffect, useState } from 'react'
import {
  TRAINING_COURSES,
  TRAINING_RULES,
  type TrainingCourse,
} from '../../../../shared/src/schemas/clan-activities'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useTraining, useTrainingDonate } from './activities-api'
import { MessageDialog } from './NinjaGarden'

const ASSETS = '/assets/reborn/clan'
const HERO: Record<TrainingCourse | 'none', string> = {
  none: 'ninjutsu',
  primary: 'training-1',
  advanced: 'training-3',
  final: 'training-2',
}
const MEDAL: Record<TrainingCourse, string> = { primary: 'basic', advanced: 'mid', final: 'adv' }

/** HH:MM:SS until `iso`. */
export function countdown(iso: string, now: number) {
  const left = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`
}

/** Re-renders every second. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function TrainingWindow({ onClose }: { onClose: () => void }) {
  const training = useTraining()
  const donate = useTrainingDonate()
  const now = useNow()
  const [hover, setHover] = useState<TrainingCourse | 'none'>('none')
  const [confirm, setConfirm] = useState<TrainingCourse | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const view = training.data
  const done = (course: TrainingCourse) => view?.donated[course] ?? false
  const pick = (course: TrainingCourse) => {
    if (!donate.isPending && view && !done(course)) setConfirm(course)
  }
  return (
    <Dialog title="Training" onClose={onClose} className="w-[470px]">
      {training.isError && <Notice tone="error">{errorMessage(training.error)}</Notice>}
      <div className="game-panel-1 relative h-[348px] p-[10px]">
        <div className="h-[220px] overflow-hidden border border-[#3a2a12] bg-black shadow">
          <img src={`${ASSETS}/${HERO[hover]}.webp`} alt="" className="size-full object-cover" />
        </div>
        <div className="mt-[18px] flex justify-center gap-2">
          {TRAINING_COURSES.map((course) => (
            <button
              key={course}
              type="button"
              disabled={!view || done(course) || donate.isPending}
              onMouseEnter={() => setHover(course)}
              onFocus={() => setHover(course)}
              onClick={() => pick(course)}
              className="game-value-box h-[26px] w-[140px] text-[9px] font-bold text-[#3a2310] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {TRAINING_RULES[course].label}
            </button>
          ))}
        </div>
        <ul aria-label="Courses" className="mt-[6px] flex justify-center gap-[90px]">
          {TRAINING_COURSES.map((course) => (
            <li key={course}>
              <button
                type="button"
                title={`${TRAINING_RULES[course].medal} Course`}
                aria-label={`${TRAINING_RULES[course].medal} medal${done(course) ? ', donated' : ''}`}
                disabled={!view || done(course) || donate.isPending}
                onMouseEnter={() => setHover(course)}
                onClick={() => pick(course)}
                className="relative size-[54px] transition-transform hover:scale-[1.07] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <img
                  src={`${ASSETS}/${MEDAL[course]}.webp`}
                  alt=""
                  className="size-full object-cover [image-rendering:pixelated]"
                />
                {donate.isPending && donate.variables === course && (
                  <span className="absolute inset-0 grid place-items-center text-[10px] font-bold">
                    ...
                  </span>
                )}
                {view && done(course) && (
                  <span className="absolute inset-x-0 bottom-0 bg-[rgba(42,26,10,.85)] text-[8px] font-bold text-[#ffcc00] [font-family:monospace]">
                    {countdown(view.resetsAt, now)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {view && TRAINING_COURSES.every(done) && (
          <p className="absolute inset-x-0 bottom-[10px] text-center text-[11px] font-bold text-[#2d1a0a]">
            All daily training done
          </p>
        )}
      </div>
      {confirm && (
        <Dialog
          title="Confirm your donation?"
          onClose={() => setConfirm(null)}
          className="w-[300px]"
        >
          <p className="mb-1 text-center text-[12px] font-bold">{TRAINING_RULES[confirm].label}</p>
          <p className="mb-2 text-center text-[11px]">
            {TRAINING_RULES[confirm].confirm}
            <br />
            (Each course can be donated once per day)
          </p>
          <div className="flex justify-center gap-5">
            <GameButton
              disabled={donate.isPending}
              onClick={() =>
                donate.mutate(confirm, {
                  onSuccess: () => setConfirm(null),
                  onError: (error) => {
                    setConfirm(null)
                    setMessage(errorMessage(error) || 'Unknown response')
                  },
                })
              }
            >
              {donate.isPending ? 'Processing' : 'Confirm'}
            </GameButton>
            <GameButton disabled={donate.isPending} onClick={() => setConfirm(null)}>
              Cancel
            </GameButton>
          </div>
        </Dialog>
      )}
      {message && <MessageDialog onClose={() => setMessage(null)}>{message}</MessageDialog>}
    </Dialog>
  )
}
