// Reborn's Clan Missions (`Qh` @2927000): the mission map (clan_missions_bg) with 15 bosses on a
// dotted path (locked ones greyed with a lock), the summoned boss glowing red with its shared HP
// bar, timer and + (20 s for 150 Gold), "Starts in" and Cancel for a scheduled boss, Start Battle /
// Free Battle for the leader (cost, "Start in" Now / 1-12 hours), the Info rules and the footer
// "Missions started today: N/3 | Free entries: N". Clicking the active boss fights it.
import type { Character } from '@pockie/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import {
  CLAN_MISSION_BOSSES,
  CLAN_MISSION_RULES,
  type ClanMissionAttackResult,
  type ClanMissionsResult,
  type ClanMissionsView,
} from '../../../../shared/src/schemas/clan-activities'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult, useCharacter } from '../api'
import { ResultWindow } from '../FightSummary'
import { Dialog, GameButton, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import type { Replay } from '../types'
import { activityKeys, CLAN_EVENTS, useClanMissions } from './activities-api'
import { MessageDialog } from './NinjaGarden'
import { useNow } from './Training'

type Attack = ClanMissionAttackResult<Replay>
const DOTS_BETWEEN = 6

/** Dots between consecutive bosses (Reborn's `Xh`). */
const DOTS = CLAN_MISSION_BOSSES.slice(1).flatMap((to, i) => {
  const from = CLAN_MISSION_BOSSES[i]!
  return Array.from({ length: DOTS_BETWEEN }, (_, k) => {
    const t = (k + 1) / (DOTS_BETWEEN + 1)
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  })
})

const fmt = (n: number) => n.toLocaleString('en-US')

function costText(cost: { stones: number; giftCertificates: number }) {
  const parts = []
  if (cost.stones > 0) parts.push(`${(cost.stones / 1e6).toFixed(0)}M Stones`)
  if (cost.giftCertificates > 0) parts.push(`${(cost.giftCertificates / 1e3).toFixed(0)}k GC`)
  return parts.join(' + ') || 'Free'
}

const minSec = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const startsIn = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

function AttackResult({
  attack,
  character,
  onDone,
}: {
  attack: Attack
  character: Character
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [watched, setWatched] = useState(false)
  if (!watched)
    return (
      <BattleReplayMount
        replay={attack.replay}
        clothing={character.clothing}
        monsterIds={[attack.npcId]}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(activityKeys.missions, attack.missions)
          apply(attack)
          setWatched(true)
        }}
      />
    )
  return (
    <ResultWindow
      title={attack.defeated ? 'Boss Defeated' : 'Attack Over'}
      story={
        attack.defeated
          ? 'The boss falls! Its spoils go to clan storage and the next boss is unlocked.'
          : `You dealt ${fmt(attack.damage)} damage to the boss.`
      }
      columns={[{ label: 'Damage', value: attack.damage, color: '#b3122a' }]}
      findTitle="Clan Missions"
      finds={[]}
      emptyFind="Every clan member can keep attacking until the timer runs out."
      onClose={onDone}
    />
  )
}

const INFO: [string, string[]][] = [
  [
    'Starting a Fight:',
    [
      'The Clan Leader can start or schedule a boss mission.',
      'Starting a fight costs Stones and/or Gift Certificates from the clan storage.',
      `Your clan can start up to ${CLAN_MISSION_RULES.maxDailyBattles} regular boss missions per day. This is not a limit on member attacks.`,
      'A Clan Boss Free Entry (earned in the Clan Wars weekly Top 3) starts a cost-free extra fight and does not use the daily limit.',
    ],
  ],
  [
    'Fighting the Boss:',
    [
      'Once summoned, all clan members can attack by clicking the boss.',
      'Each attack deals damage. The boss HP is shared.',
      'Attack as many times as needed; there is no per-member attack-count limit.',
    ],
  ],
  [
    'Extending Time:',
    [
      `Press the + button to add ${CLAN_MISSION_RULES.extendSeconds} seconds for ${CLAN_MISSION_RULES.extendGold} Gold.`,
    ],
  ],
  [
    'Rewards:',
    [
      'A defeated boss pays Stones, Gift Certificates and Clan EXP into clan storage.',
      'Higher bosses pay more.',
    ],
  ],
  [
    'Progression:',
    ['Defeating a boss unlocks the next one.', 'Previous bosses can be fought again for rewards.'],
  ],
]

function InfoWindow({ view, onClose }: { view: ClanMissionsView; onClose: () => void }) {
  return (
    <Dialog title="Clan Missions" onClose={onClose} className="w-[520px]">
      <div className="max-h-[70vh] overflow-y-auto text-[13px] leading-[1.7]">
        <p className="mb-2">
          Clan Missions are a series of <b className="text-[#c96f00]">15 progressive bosses</b> that
          your entire clan works together to defeat. Each boss is stronger than the last!
        </p>
        {INFO.map(([title, lines]) => (
          <Fragment key={title}>
            <p className="font-bold text-[#c96f00]">{title}</p>
            <ul className="mb-2 list-disc pl-5">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {title === 'Fighting the Boss:' && (
                <>
                  <li>
                    Each fight removes at most {view.damagePercentPerAttack}% of the boss&apos;s
                    maximum HP per attack, even if you defeat it in one hit.
                  </li>
                  <li>
                    At least {Math.ceil(100 / view.damagePercentPerAttack)} attacks are needed for a
                    fresh boss, from the same or different members.
                  </li>
                  <li>You have {view.bossActiveMinutes} minutes to defeat it.</li>
                  <li>If the timer runs out, the boss escapes and becomes locked again.</li>
                  <li>
                    If nobody attacked before it escaped, the start cost (or Free Entry) and the
                    daily start are refunded and progress is kept.
                  </li>
                </>
              )}
            </ul>
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex justify-center">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}

export function ClanMissionsWindow({ onClose }: { onClose: () => void }) {
  const missions = useClanMissions()
  const character = useCharacter()
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const now = useNow()
  const [startFor, setStartFor] = useState<number | null>(null)
  const [delay, setDelay] = useState(0)
  const [info, setInfo] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useMutation({
    mutationFn: ({ path, body = {} }: { path: string; body?: object }) =>
      api<ClanMissionsResult>(`${CLAN_EVENTS}/missions/${path}`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(activityKeys.missions, result.missions)
      apply(result)
    },
    onError: (error) => setNotice(errorMessage(error)),
  })
  const attack = useMutation({
    mutationFn: () => api<Attack>(`${CLAN_EVENTS}/missions/attack`, { method: 'POST' }),
    onError: (error) => setNotice(errorMessage(error)),
  })
  const view = missions.data
  if (attack.data && character.data)
    return (
      <AttackResult attack={attack.data} character={character.data} onDone={() => attack.reset()} />
    )
  const active = view?.activeBoss ?? null
  const scheduled = view?.scheduledBoss ?? null
  const left = active ? Date.parse(active.endsAt) - now : 0
  const canAttack = Boolean(active && active.currentHp > 0 && left > 0 && !attack.isPending)
  const startsLeft = view ? view.battlesUsedToday < view.maxDailyBattles : false
  const canStartAny = view ? startsLeft || view.freeBattleEntries > 0 : false
  return (
    <Dialog title="Clan Missions" onClose={onClose} className="w-[720px]">
      {missions.isError && <Notice tone="error">{errorMessage(missions.error)}</Notice>}
      <div
        className="relative h-[410px] overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: 'url(/assets/reborn/clan/clan_missions_bg.webp)' }}
      >
        <GameButton small className="absolute top-2 right-4 z-10" onClick={() => setInfo(true)}>
          Info
        </GameButton>
        {active && (
          <p className="absolute top-[7px] left-3 z-10 rounded-[3px] bg-black/70 px-[6px] py-[2px] text-[10px] text-[#ffd700]">
            Unlimited attacks | Your attacks: {active.myAttacks}
          </p>
        )}
        {view && (
          <p className="absolute right-2 bottom-[2px] z-10 text-[10px] text-[#ffd700] [text-shadow:0_1px_3px_#000]">
            Missions started today: {view.battlesUsedToday}/{view.maxDailyBattles} | Free entries:{' '}
            {view.freeBattleEntries}
          </p>
        )}
        {DOTS.map((dot, i) => (
          <span
            key={i}
            className="absolute size-[6px] -translate-1/2 rounded-full bg-[rgba(210,180,120,.7)] shadow-[0_0_4px_rgba(180,150,80,.5)]"
            style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
          />
        ))}
        <ul aria-label="Bosses">
          {CLAN_MISSION_BOSSES.map((boss, index) => {
            const locked = !view || index > view.unlockedBoss
            const isActive = active?.bossIndex === index
            const hpPercent = isActive ? (active.currentHp / active.maxHp) * 100 : 0
            return (
              <li
                key={boss.name}
                aria-label={boss.name}
                className="absolute -translate-1/2"
                style={{ left: `${boss.x}%`, top: `${boss.y}%` }}
              >
                <span
                  className={`absolute top-1/2 left-1/2 size-[56px] -translate-1/2 rounded-full ${
                    isActive
                      ? 'bg-[radial-gradient(circle,rgba(255,50,50,.5),rgba(255,0,0,.25)_50%,transparent_70%)] shadow-[0_0_18px_8px_rgba(255,0,0,.4)]'
                      : 'bg-[radial-gradient(circle,rgba(0,0,0,.55),rgba(0,0,0,.3)_50%,transparent_70%)]'
                  }`}
                />
                {isActive ? (
                  <div className="absolute bottom-[42px] left-1/2 z-[15] w-[90px] -translate-x-1/2 text-center">
                    <div
                      role="meter"
                      aria-label="Boss HP"
                      aria-valuemin={0}
                      aria-valuemax={active.maxHp}
                      aria-valuenow={active.currentHp}
                      className="h-2 overflow-hidden rounded border border-[#555] bg-black/60"
                    >
                      <div
                        className={`h-full ${hpPercent > 50 ? 'bg-[#2a2]' : hpPercent > 20 ? 'bg-[#c90]' : 'bg-[#c00]'}`}
                        style={{ width: `${hpPercent}%` }}
                      />
                    </div>
                    <p className="text-[8px] text-white [text-shadow:0_1px_2px_#000]">
                      {fmt(active.currentHp)} / {fmt(active.maxHp)}
                    </p>
                  </div>
                ) : (
                  !locked && (
                    <p className="absolute bottom-[36px] left-1/2 z-[5] -translate-x-1/2 text-[9px] font-bold whitespace-nowrap text-[#ffd700] [text-shadow:0_1px_3px_#000]">
                      {boss.name}
                    </p>
                  )
                )}
                <button
                  type="button"
                  aria-label={isActive ? `Attack ${boss.name}` : boss.name}
                  disabled={!isActive || !canAttack}
                  onClick={() => isActive && canAttack && attack.mutate()}
                  className="relative z-[2] block size-[48px] disabled:cursor-default"
                >
                  <img
                    src={`/assets/reborn/icons/monsters/${boss.iconId}.webp`}
                    alt=""
                    className={`size-full ${locked ? 'opacity-50 brightness-[.4] grayscale' : 'drop-shadow-[0_2px_4px_rgba(0,0,0,.6)]'}`}
                  />
                  {locked && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="absolute top-1/2 left-1/2 size-5 -translate-1/2 drop-shadow-[0_0_6px_rgba(0,0,0,.8)]"
                    >
                      <path
                        d="M4 7V5a4 4 0 0 1 8 0v2"
                        fill="none"
                        stroke="#d9c38a"
                        strokeWidth="2"
                      />
                      <rect x="2.5" y="7" width="11" height="8" rx="1.5" fill="#d9c38a" />
                    </svg>
                  )}
                </button>
                <div className="absolute top-[30px] left-1/2 z-[15] flex -translate-x-1/2 flex-col items-center whitespace-nowrap">
                  {isActive ? (
                    <span className="flex items-center gap-[3px]">
                      <b
                        className={`text-[11px] [text-shadow:0_1px_3px_#000] ${left < 60_000 ? 'text-[#f44]' : 'text-[#ffd700]'}`}
                      >
                        {minSec(left)}
                      </b>
                      <button
                        type="button"
                        title={`Add ${CLAN_MISSION_RULES.extendSeconds} seconds (${CLAN_MISSION_RULES.extendGold} Gold)`}
                        aria-label={`Add ${CLAN_MISSION_RULES.extendSeconds} seconds`}
                        disabled={action.isPending}
                        onClick={() =>
                          window.confirm(
                            `Extend boss timer?\nCost: ${CLAN_MISSION_RULES.extendGold} Gold`,
                          ) && action.mutate({ path: 'extend' })
                        }
                        className="size-4 rounded-[3px] border border-[#fe8] bg-linear-to-b from-[#ffd700] to-[#c90] text-[10px] leading-[14px] font-bold text-black"
                      >
                        +
                      </button>
                    </span>
                  ) : locked || active ? null : scheduled ? (
                    scheduled.bossIndex === index && (
                      <>
                        <b className="text-[9px] text-[#ffd700] [text-shadow:0_1px_3px_#000]">
                          Starts in {startsIn(Date.parse(scheduled.startAt) - now)}
                        </b>
                        {view?.canStart && (
                          <GameButton
                            small
                            disabled={action.isPending}
                            onClick={() =>
                              window.confirm(
                                'Cancel the scheduled boss? The reserved cost will be refunded.',
                              ) && action.mutate({ path: 'cancel' })
                            }
                          >
                            Cancel
                          </GameButton>
                        )}
                      </>
                    )
                  ) : view?.canStart ? (
                    <GameButton
                      small
                      disabled={!canStartAny || action.isPending}
                      onClick={() => {
                        setDelay(0)
                        setStartFor(index)
                      }}
                    >
                      {!canStartAny
                        ? 'No battles'
                        : view.freeBattleEntries > 0
                          ? 'Free Battle'
                          : 'Start Battle'}
                    </GameButton>
                  ) : (
                    <span className="text-[9px] text-[#ddd] [text-shadow:0_1px_3px_#000]">
                      {index + 1}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      {startFor !== null && view && (
        <Dialog
          title={CLAN_MISSION_BOSSES[startFor]!.name}
          onClose={() => setStartFor(null)}
          className="w-[320px]"
        >
          <p className="mb-3 text-center text-[11px]">
            {view.freeBattleEntries > 0
              ? 'Cost: 1 Clan Boss Free Entry (does not use the daily limit)'
              : `Cost: ${costText(view.costs[startFor]!)} (from clan storage)`}
          </p>
          <label className="mb-4 flex items-center justify-center gap-2 text-[12px]">
            Start in
            <select
              value={delay}
              onChange={(event) => setDelay(Number(event.target.value))}
              className="border border-[#8b6914] bg-[#fff9e7] px-1 py-[2px]"
            >
              <option value={0}>Now</option>
              {Array.from({ length: view.maxScheduleHours }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h} hour{h > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-center gap-[10px]">
            <GameButton onClick={() => setStartFor(null)}>Cancel</GameButton>
            <GameButton
              disabled={action.isPending}
              onClick={() =>
                action.mutate(
                  { path: 'start', body: { bossIndex: startFor, delayHours: delay } },
                  { onSuccess: () => setStartFor(null) },
                )
              }
            >
              {delay === 0 ? 'Start Now' : 'Schedule'}
            </GameButton>
          </div>
        </Dialog>
      )}
      {info && view && <InfoWindow view={view} onClose={() => setInfo(false)} />}
      {notice && <MessageDialog onClose={() => setNotice(null)}>{notice}</MessageDialog>}
    </Dialog>
  )
}
