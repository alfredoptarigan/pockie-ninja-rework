// Adventure with Jiraiya (reborn-windows-A-L.md "Adventure with Jiraiya", `Fh`, 420 wide): Jiraiya's
// pose, Ready / On Adventure, then either the pitch and Start Adventure, or a rotating travel line,
// the elapsed time and 24h bar (12h mark), the rewards so far and Return from Adventure. Returning
// opens "Adventure Complete!" (the shared result window).
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import {
  ADVENTURE_RULES,
  JIRAIYA_LINES,
  type AdventureReturnResult,
  type AdventureRewards,
} from '../../../../shared/src/schemas/hunt'
import { errorMessage } from '../api'
import { hms, poseUrl } from '../dungeons'
import { useNow } from '../events/timer'
import { ResultWindow } from '../FightSummary'
import { Dialog, GameButton, Notice } from '../skin'
import { useAdventure, useReturnFromAdventure, useStartAdventure } from './api'

const JIRAIYA_POSE = 57
const HOUR_MS = 3_600_000
const MAX_MS = ADVENTURE_RULES.maxHours * HOUR_MS
const SPECIAL_HOURS = 12

const REWARD_COLUMNS = [
  { key: 'charExp', label: 'Character EXP', color: '#2e7d32' },
  { key: 'bankaiExp', label: 'Bankai EXP', color: '#1565c0' },
  { key: 'clanExp', label: 'Clan EXP', color: '#c4940c' },
] as const

export const adventureColumns = (rewards: AdventureRewards) =>
  REWARD_COLUMNS.map(({ key, label, color }) => ({ label, value: rewards[key], color }))

export function AdventureWindow({ onClose }: { character?: Character; onClose: () => void }) {
  const view = useAdventure()
  const start = useStartAdventure()
  const back = useReturnFromAdventure()
  const [result, setResult] = useState<AdventureReturnResult | null>(null)
  const now = useNow()
  const adventure = view.data
  const startedAt = adventure?.startedAt ? Date.parse(adventure.startedAt) : null
  const elapsed = startedAt === null ? 0 : Math.min(Math.max(0, now - startedAt), MAX_MS)
  const hours = Math.floor(elapsed / HOUR_MS)
  const fill = elapsed / MAX_MS
  const error = start.error ?? back.error
  return (
    <>
      <Dialog
        title="Adventure with Jiraiya"
        onClose={onClose}
        className="game-window-bare w-[420px]"
      >
        <div className="game-panel-1 flex flex-col items-center gap-2 p-[12px] font-game text-[12px] text-[#3a2310]">
          <img
            src={poseUrl(JIRAIYA_POSE)}
            alt="Jiraiya"
            className="size-[120px] object-contain [image-rendering:pixelated]"
          />
          <p className="text-[13px] font-bold">
            {adventure?.active ? 'On Adventure...' : 'Ready for Adventure'}
          </p>
          {view.isError && <Notice tone="error">{errorMessage(view.error)}</Notice>}
          {error && <Notice tone="error">{errorMessage(error)}</Notice>}
          {adventure && !adventure.active && (
            <>
              <p className="text-center leading-[17px]">
                Join Jiraiya on an adventure! Send your character out to explore and earn rewards
                over time.
              </p>
              <p className="text-center text-[11px] leading-[15px] text-[#665530]">
                Adventures last up to 24 hours. You cannot battle while adventuring.
                <br />
                At 12h there&apos;s a 5% chance of finding a special item. At 24h: 10% chance!
              </p>
              <GameButton
                className="h-[28px] w-[160px] text-[13px]!"
                disabled={start.isPending}
                onClick={() => start.mutate(undefined)}
              >
                {start.isPending ? 'Starting...' : 'Start Adventure'}
              </GameButton>
            </>
          )}
          {adventure?.active && startedAt !== null && (
            <div className="flex w-full flex-col gap-2 px-[16px]">
              <p className="rounded border border-[#508c3c26] bg-[#508c3c14] px-2 py-1 text-center text-[11px] text-[#4a6a3a] italic">
                {JIRAIYA_LINES[Math.floor(startedAt / 1000 + hours) % JIRAIYA_LINES.length]}
              </p>
              <p className="flex justify-between text-[11px]">
                <span>
                  Elapsed: <b>{hms(elapsed)}</b>
                </span>
                <span>
                  Hours: <b>{hours}/24</b>
                </span>
              </p>
              <div
                role="progressbar"
                aria-label="Adventure progress"
                aria-valuenow={hours}
                aria-valuemax={ADVENTURE_RULES.maxHours}
                className="relative h-[18px] overflow-hidden rounded border-2 border-[#4a3a2a] bg-linear-to-b from-[#1a1a1a] to-[#2a2a2a]"
              >
                <div
                  className={`h-full ${fill >= 1 ? 'bg-linear-to-r from-[#e8c84a] to-[#ffd700]' : 'bg-linear-to-r from-[#3a8ae0] to-[#5aaaf0]'}`}
                  style={{ width: `${Math.min(fill, 1) * 100}%` }}
                />
                <span className="absolute inset-y-0 left-1/2 w-px bg-[#ffc83280]" />
                <span className="absolute -top-px left-1/2 -translate-x-1/2 text-[8px] font-bold text-[#ffd700]">
                  12h
                </span>
              </div>
              <dl className="flex justify-center gap-4 rounded bg-black/5 py-1.5">
                {adventureColumns(adventure.rewards).map((column) => (
                  <div key={column.label} className="text-center">
                    <dt className="text-[9px] text-[#666]">
                      {column.label.replace('Character', 'Char')}
                    </dt>
                    <dd className="text-[12px] font-bold" style={{ color: column.color }}>
                      +{column.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col items-center">
                <GameButton
                  className="h-[26px] w-[180px]"
                  disabled={back.isPending}
                  onClick={() => back.mutate(undefined, { onSuccess: setResult })}
                >
                  {back.isPending ? 'Returning...' : 'Return from Adventure'}
                </GameButton>
                <p className="mt-1 text-[10px] text-[#888]">
                  Battles are disabled while on adventure
                </p>
              </div>
            </div>
          )}
        </div>
      </Dialog>
      {result && (
        <ResultWindow
          title="Adventure Complete!"
          story={result.story}
          note={`Adventure Duration: ${result.totalHours} hour(s)`}
          columns={adventureColumns(result.rewards)}
          findTitle="Special Find!"
          finds={result.specialItem ? [result.specialItem] : []}
          emptyFind={
            result.totalHours < SPECIAL_HOURS
              ? 'Stay longer next time for a chance at special items! (12h+ required)'
              : 'No special item found this time. Better luck next adventure!'
          }
          onClose={() => setResult(null)}
        />
      )}
    </>
  )
}
