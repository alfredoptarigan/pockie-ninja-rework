// Reborn's Talent window (reborn-windows-M-Z-hud.md, "Talent"; WM key `talent`, the Inventory's
// Talent button): 580x430. Left BigBG2 panel: the talent board art with the 8 talents in a 2x4
// grid (brightness by state, level under each, an On/Off pill on learned ones). Right BigBG2
// panel: header art, the talent's name and text, "Current level", the EXP bar, "Can level up",
// "Attempts", Normal Upgrade (Stone) / Gold Upgrade with a cost prompt, and Use / Remove Talent.
// Our rules (M5 decisions 6-8) stay: the unlock level, the daily attempts and up to 3 active.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type CSSProperties } from 'react'
import type {
  TalentEntry,
  TalentsView,
  TalentUpgradeResult,
} from '../../../../shared/src/schemas/talents'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { bigBg } from '../bloodlines/panels'
import { ConfirmDialog } from '../inventory/dialogs'
import { Dialog, GameButton, Notice } from '../skin'
import { showToast } from '../toast'

export const talentsKey = ['game', 'talents'] as const
const TALENT_DIR = '/assets/reborn/ui/UIResource/Talent'
/** Reborn art (client/src/generated/reborn-assets.json, category "talent"). */
export const talentIcon = (id: number) => `${TALENT_DIR}/talent${id}.webp`
export const TALENT_ART = { board: `${TALENT_DIR}/bg.webp`, header: `${TALENT_DIR}/802.webp` }
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
const COLUMNS = 2
const GOLD_TITLE: CSSProperties = {
  color: '#FFD700',
  textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
}

const brightness = (talent: TalentEntry, selected: boolean) =>
  selected
    ? 'brightness-150 drop-shadow-[0_0_6px_#ffd700]'
    : talent.active
      ? 'brightness-[1.3]'
      : talent.level > 0
        ? 'brightness-90'
        : 'brightness-[0.6]'

export function TalentsWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [selected, select] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ text: string; useGold: boolean } | null>(null)
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
      showToast(
        gained.crit ? 'Critical Upgrade! 3x EXP!' : `+${gained.exp} EXP.`,
        gained.crit ? 'success' : 'info',
      )
      queryClient.setQueryData(talentsKey, result)
      apply(result)
    },
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api<TalentsView>(`/api/game/talents/${id}/active`, { method: 'POST', body: { active } }),
    onSuccess: (view) => queryClient.setQueryData(talentsKey, view),
  })
  const data = talents.data
  const talent = data?.talents.find((t) => t.talentId === selected)
  const busy = upgrade.isPending || toggle.isPending
  const locked = data ? character.level < data.unlockLevel : true
  const activeCount = data?.talents.filter((t) => t.active).length ?? 0
  const error = talents.error ?? upgrade.error ?? toggle.error
  const canUpgrade = Boolean(data?.nextCost && talent && !locked && talent.level < data.cap)
  const canUse = (entry: TalentEntry) =>
    entry.active || (entry.level > 0 && activeCount < (data?.maxActive ?? 0))
  const percent = talent?.expNeeded ? Math.min(100, (talent.exp / talent.expNeeded) * 100) : 100
  return (
    <Dialog title="Talent" onClose={onClose} className="game-window-bare w-[590px]">
      <div className="relative flex h-[430px] w-[580px] gap-[5px] text-[12px] text-black">
        <section
          aria-label="Talent board"
          className="relative h-[430px] w-[215px] shrink-0 p-[10px]"
          style={bigBg(2)}
        >
          <img
            src={TALENT_ART.board}
            alt=""
            className="absolute top-[30px] left-[2px] w-[196.5px]"
          />
          {talents.isPending && <p className="relative">Loading talents...</p>}
          {data && (
            <ul aria-label="Talents">
              {data.talents.map((entry, index) => {
                const name = nameOf(entry)
                const left = 20 + 100 * (index % COLUMNS)
                const top = 50 + 92 * Math.floor(index / COLUMNS)
                return (
                  <li key={entry.talentId} className="absolute w-[60px]" style={{ left, top }}>
                    <button
                      type="button"
                      aria-label={name}
                      aria-pressed={entry.talentId === selected}
                      title={name}
                      onClick={() => select(entry.talentId)}
                      className="block"
                    >
                      <img
                        src={talentIcon(entry.talentId)}
                        alt=""
                        className={`size-[45.5px] ${brightness(entry, entry.talentId === selected)}`}
                      />
                    </button>
                    <span className="block w-[45.5px] text-center text-[12px] font-bold text-white [text-shadow:var(--shadow-game-text)]">
                      {entry.level}
                    </span>
                    {entry.level > 0 && (
                      <button
                        type="button"
                        aria-label={`Turn ${name} ${entry.active ? 'off' : 'on'}`}
                        aria-pressed={entry.active}
                        disabled={busy || !canUse(entry)}
                        onClick={() => toggle.mutate({ id: entry.talentId, active: !entry.active })}
                        className={`absolute -top-[8px] -left-[10px] rounded-full border border-black/40 px-[4px] text-[9px] leading-[12px] font-bold text-white disabled:cursor-not-allowed ${
                          entry.active ? 'bg-[#2e9e3e]' : 'bg-[#6b6f72]'
                        }`}
                      >
                        {entry.active ? 'On' : 'Off'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {data && (
            <p className="absolute right-0 bottom-[10px] left-0 text-center font-bold text-white [text-shadow:var(--shadow-game-text)]">
              Active: {activeCount}/{data.maxActive}
            </p>
          )}
        </section>
        <section
          aria-label="Selected talent"
          className="relative h-[430px] w-[360px] p-[15px]"
          style={bigBg(2)}
        >
          <img src={TALENT_ART.header} alt="" className="mx-auto w-[285px]" />
          <h3 className="mt-1 text-center text-[16px] font-bold italic" style={GOLD_TITLE}>
            {talent ? nameOf(talent) : 'Select a talent'}
          </h3>
          <p className="h-[60px] w-[315px] overflow-auto text-[13px]">
            {talent && TALENT_DESCRIPTIONS[talent.talentId]}
          </p>
          <div
            className="absolute top-[160px] left-[15px] flex h-[100px] w-[315px] flex-col gap-1 p-[10px]"
            style={bigBg(1)}
          >
            {talent && data && (
              <>
                <p>Current level {talent.level}</p>
                <div
                  role="meter"
                  aria-label="Talent EXP"
                  aria-valuemin={0}
                  aria-valuemax={talent.expNeeded ?? talent.exp}
                  aria-valuenow={talent.exp}
                  aria-valuetext={`${talent.exp} / ${talent.expNeeded ?? talent.exp}`}
                  className="relative h-[22px] w-[295px] overflow-hidden rounded border border-[#80591c] bg-[#3a2a10]"
                >
                  <div
                    className="h-full bg-linear-to-b from-[#ffe27a] via-[#e2a72a] to-[#a8740e]"
                    style={{ width: `${percent}%` }}
                  />
                  <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-white [text-shadow:var(--shadow-game-text)]">
                    {talent.exp} / {talent.expNeeded ?? talent.exp}
                  </span>
                </div>
                <p>Can level up {Math.max(0, data.cap - talent.level)}</p>
              </>
            )}
          </div>
          {data && (
            <p className="absolute top-[270px] left-[15px] w-[330px]">
              Attempts: {data.attemptsPerDay - data.attemptsUsed} (Reset everyday at 00:00 server
              time)
            </p>
          )}
          <div className="absolute top-[288px] left-[15px] w-[330px]">
            {error ? (
              <Notice tone="error">{errorMessage(error)}</Notice>
            ) : (
              locked && data && <Notice>Talents unlock at level {data.unlockLevel}.</Notice>
            )}
          </div>
          <GameButton
            className="absolute! top-[320px] left-[10px] h-[30px] w-[145px] text-[12px] font-bold"
            disabled={busy || !canUpgrade}
            onClick={() =>
              setConfirm({
                text: `This will cost ${data!.nextCost!.stones.toLocaleString('en-US')} stones, continue?`,
                useGold: false,
              })
            }
          >
            Normal Upgrade
          </GameButton>
          <GameButton
            className="absolute! top-[320px] left-[165px] h-[30px] w-[145px] text-[12px] font-bold"
            disabled={busy || !canUpgrade}
            onClick={() =>
              setConfirm({
                text: `This will cost ${data!.nextCost!.gold.toLocaleString('en-US')} gold, continue?`,
                useGold: true,
              })
            }
          >
            Gold Upgrade
          </GameButton>
          <GameButton
            className="absolute! top-[355px] left-[80px] h-[28px] w-[160px]"
            disabled={busy || !talent || !canUse(talent)}
            onClick={() => toggle.mutate({ id: talent!.talentId, active: !talent!.active })}
          >
            {talent?.active ? 'Remove Talent' : 'Use Talent'}
          </GameButton>
        </section>
        {confirm && talent && (
          <ConfirmDialog
            text={confirm.text}
            onAccept={() => upgrade.mutate({ id: talent.talentId, useGold: confirm.useGold })}
            onClose={() => setConfirm(null)}
          />
        )}
      </div>
    </Dialog>
  )
}
