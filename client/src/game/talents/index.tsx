// Talents window (M5 task 6): 8 talents, daily upgrades in Stone or Gold, up to 3 active.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  TalentEntry,
  TalentsView,
  TalentUpgradeResult,
} from '../../../../shared/src/schemas/talents'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { Bar, Dialog, GameButton, Notice } from '../skin'

export const talentsKey = ['game', 'talents'] as const
/** Reborn art (client/src/generated/reborn-assets.json, category "talent"). */
export const talentIcon = (id: number) => `/assets/reborn/ui/UIResource/Talent/talent${id}.webp`
/** Our own text (decision 8): what each talent does once the enemy leads. */
export const TALENT_DESCRIPTIONS: Record<number, string> = {
  1: "When the enemy's Pierce beats your Block, you block more often.",
  2: "When the enemy's Block beats your Pierce, their Block is weakened.",
  3: "When the enemy's Armor Break beats your Defense, their Armor Break is weakened.",
  4: "When the enemy's Defense beats your Armor Break, their Defense is weakened.",
  5: "When the enemy's Critical beats your Constitution, their Critical is weakened.",
  6: "When the enemy's Constitution beats your Critical, you land critical hits more often.",
  7: "When the enemy's Hit beats your Dodge, you dodge more often.",
  8: "When the enemy's Dodge beats your Hit, their Dodge is weakened.",
}
const nameOf = (talent: TalentEntry) =>
  (names as Record<string, string>)[talent.nameKey] ?? `Talent ${talent.talentId}`

export function TalentsWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [selected, select] = useState(1)
  const [message, setMessage] = useState('')
  const talents = useQuery({
    queryKey: talentsKey,
    queryFn: () => api<TalentsView>('/api/game/talents'),
  })
  const upgrade = useMutation({
    mutationFn: ({ id, useGold }: { id: number; useGold: boolean }) =>
      api<TalentUpgradeResult>(`/api/game/talents/${id}/upgrade`, {
        method: 'POST',
        body: { useGold },
      }),
    onSuccess: (result) => {
      const { upgrade: gained } = result
      setMessage(
        `${gained.crit ? 'Critical upgrade! ' : ''}+${gained.exp} EXP.${gained.levelsGained ? ' Level up!' : ''}`,
      )
      queryClient.setQueryData(talentsKey, result)
      apply(result)
    },
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api<TalentsView>(`/api/game/talents/${id}/active`, { method: 'POST', body: { active } }),
    onSuccess: (view) => {
      setMessage('')
      queryClient.setQueryData(talentsKey, view)
    },
  })
  const data = talents.data
  const talent = data?.talents.find((t) => t.talentId === selected)
  const busy = upgrade.isPending || toggle.isPending
  const locked = data ? character.level < data.unlockLevel : false
  const activeCount = data?.talents.filter((t) => t.active).length ?? 0
  const error = talents.error ?? upgrade.error ?? toggle.error
  return (
    <Dialog title="Talents" onClose={onClose} className="game-window-bare w-[560px]">
      <div className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black">
        {talents.isPending && <p>Loading talents...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {data && (
          <>
            {locked && <Notice>Talents unlock at level {data.unlockLevel}.</Notice>}
            <p>
              Upgrades left today: {data.attemptsPerDay - data.attemptsUsed}/{data.attemptsPerDay}.
              Active: {activeCount}/{data.maxActive}. Highest talent level: {data.cap}.
            </p>
            <ul aria-label="Talents" className="grid grid-cols-4 gap-2">
              {data.talents.map((entry) => (
                <li key={entry.talentId}>
                  <button
                    type="button"
                    aria-pressed={entry.talentId === selected}
                    onClick={() => select(entry.talentId)}
                    className={`game-card flex w-full flex-col items-center gap-0.5 p-1 text-center text-[11px] ${
                      entry.talentId === selected ? 'outline-2 outline-[#c98a1a]' : ''
                    }`}
                  >
                    <img src={talentIcon(entry.talentId)} alt="" className="size-10" />
                    <span className="font-bold">{nameOf(entry)}</span>
                    <span>
                      Lv. {entry.level}
                      {entry.active ? ' (Active)' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {talent && (
              <section aria-label={nameOf(talent)} className="game-card flex flex-col gap-1 p-2">
                <h3 className="font-bold">
                  {nameOf(talent)} (Lv. {talent.level}/{data.cap})
                </h3>
                <p>{TALENT_DESCRIPTIONS[talent.talentId]}</p>
                <Bar
                  label="EXP"
                  kind="exp"
                  value={talent.exp}
                  max={talent.expNeeded ?? talent.exp}
                />
                {data.nextCost ? (
                  <div className="flex flex-wrap gap-2">
                    <GameButton
                      disabled={busy || locked || talent.level >= data.cap}
                      onClick={() => upgrade.mutate({ id: talent.talentId, useGold: false })}
                    >
                      Upgrade for {data.nextCost.stones.toLocaleString('en-US')} Stone
                    </GameButton>
                    <GameButton
                      disabled={busy || locked || talent.level >= data.cap}
                      onClick={() => upgrade.mutate({ id: talent.talentId, useGold: true })}
                    >
                      Upgrade for {data.nextCost.gold} Gold
                    </GameButton>
                  </div>
                ) : (
                  <p>No upgrades left today. They reset at 00:00 UTC.</p>
                )}
                <GameButton
                  disabled={
                    busy || (!talent.active && (talent.level < 1 || activeCount >= data.maxActive))
                  }
                  onClick={() => toggle.mutate({ id: talent.talentId, active: !talent.active })}
                >
                  {talent.active ? 'Deactivate' : 'Activate'}
                </GameButton>
              </section>
            )}
            {message && <Notice>{message}</Notice>}
          </>
        )}
      </div>
      <div className="mt-[10px] flex justify-end">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}
