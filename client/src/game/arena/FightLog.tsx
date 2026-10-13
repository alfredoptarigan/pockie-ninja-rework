// Fight log (CompeteFight, last 15) and duel history: replays and revenge.
import { useMutation } from '@tanstack/react-query'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { fetchLogReplay, useArenaLogs } from './api'
import { LOG_KIND, RESULT, signedScore } from './labels'
import type { Playing } from './ArenaReplay'
import { useArenaFight } from './useArenaFight'
import type { ArenaLogView } from '../../../../shared/src/schemas/arena'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function FightLogTab({ play }: { play: (playing: Playing) => void }) {
  const logs = useArenaLogs()
  const fight = useArenaFight(play)
  if (logs.isPending) return <p>Loading...</p>
  if (logs.isError) return <Notice tone="error">{errorMessage(logs.error)}</Notice>
  return (
    <div className="flex flex-col gap-2">
      <LogTable
        logs={logs.data}
        play={play}
        onRevenge={
          fight.outOfTries || fight.busy
            ? undefined
            : (log) =>
                fight.start({
                  path: 'revenge',
                  body: { logId: log.id },
                  label: `Take revenge on ${log.opponentName}`,
                })
        }
      />
      {fight.prompt}
    </div>
  )
}

export function LogTable({
  logs,
  play,
  onRevenge,
}: {
  logs: ArenaLogView[]
  play: (playing: Playing) => void
  /** Absent while no revenge can start (no tries left, a fight running). */
  onRevenge?: (log: ArenaLogView) => void
}) {
  const watch = useMutation({
    mutationFn: fetchLogReplay,
    onSuccess: (replay) => play({ replay }),
  })
  if (logs.length === 0) return <p>No fights yet.</p>
  return (
    <>
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            {['Time', 'Type', 'Opponent', 'Result', 'Score', 'Honor', 'Streak', ''].map((h) => (
              <th key={h} className="border-b border-wood-light px-1 py-0.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="px-1">{when(log.createdAt)}</td>
              <td className="px-1">{LOG_KIND[log.kind]}</td>
              <td className="px-1">{log.opponentName}</td>
              <td className="px-1">{RESULT[log.result] ?? 'Draw'}</td>
              <td className="px-1">{log.scoreDelta ? signedScore(log.scoreDelta) : '-'}</td>
              <td className="px-1">{log.honor ? `+${log.honor}` : '-'}</td>
              <td className="px-1">{log.streak}</td>
              <td className="flex gap-1 px-1">
                <GameButton
                  small
                  aria-label={`Watch the fight with ${log.opponentName}`}
                  disabled={watch.isPending}
                  onClick={() => watch.mutate(log.id)}
                >
                  Watch
                </GameButton>
                {log.canRevenge && (
                  <GameButton
                    small
                    aria-label={`Revenge on ${log.opponentName}`}
                    disabled={!onRevenge}
                    onClick={() => onRevenge?.(log)}
                  >
                    Revenge
                  </GameButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {watch.isError && <Notice tone="error">{errorMessage(watch.error)}</Notice>}
    </>
  )
}
