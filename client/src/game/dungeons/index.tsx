// Scroll Dungeons ("Dungeons", Reborn chunk 54 `ScrollDungeons`, reborn-lazy-features.md): a
// 1245x642 board with the rotation and attempt timers top left, Info top right and today's
// bosses spaced evenly (pose, name, shadow, hover tooltip with build and drops). Clicking a boss
// fights it; the replay plays, then the result window lists the drops.
// ponytail: Reborn's Auto fight (a 3 s countdown in its fight result window) is left out.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  DUNGEON_RULES,
  type DungeonBoss,
  type DungeonFightResult,
  type DungeonsView,
} from '../../../../shared/src/schemas/dungeons'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { AreaLoading } from '../AreaLoading'
import { useNow } from '../events/timer'
import { ResultWindow } from '../FightSummary'
import { Dialog, GameButton, Notice } from '../skin'
import { BattleReplayMount } from '../stage'
import type { Replay } from '../types'

type Fight = DungeonFightResult<Replay>

export const dungeonsKey = ['game', 'dungeons'] as const
const PATH = '/api/game/dungeons'
const WIDTH = 1245
const HEIGHT = 642
const BACKGROUND = '/assets/reborn/features/dungeons-bg.webp'
export const poseUrl = (pose: number) => `/assets/reborn/poses/${pose}.webp`
const SHADOW = { top: 528, width: 210, height: 30 }
const NAME_TOP = 312
const POSE = { top: 340, height: 200 }
const TEXT_SHADOW = '1px 1px 2px #000'

const pad = (n: number) => String(n).padStart(2, '0')
/** Reborn's `j`: milliseconds as HH:MM:SS, 00:00:00 when due. */
export function hms(ms: number) {
  if (ms <= 0) return '00:00:00'
  const s = Math.floor(ms / 1000)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function DungeonsWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = useQuery({ queryKey: dungeonsKey, queryFn: () => api<DungeonsView>(PATH) })
  const [loadedImages, setLoadedImages] = useState<Set<string>>(() => new Set())
  const imageReady = (url: string) => setLoadedImages((loaded) => new Set(loaded).add(url))
  const loading =
    view.isPending ||
    (!!view.data &&
      [
        BACKGROUND,
        ...view.data.activeBosses.map((index) => poseUrl(view.data!.bosses[index]!.pose)),
      ].some((url) => !loadedImages.has(url)))
  const [info, setInfo] = useState(false)
  const [playing, setPlaying] = useState<Fight | null>(null)
  const [result, setResult] = useState<Fight | null>(null)
  const fight = useMutation({
    mutationFn: (index: number) => api<Fight>(`${PATH}/fight`, { method: 'POST', body: { index } }),
    onSuccess: setPlaying,
  })

  if (playing) {
    return (
      <BattleReplayMount
        replay={playing.replay}
        clothing={character.clothing}
        monsterIds={[]}
        defenderLooks={[playing.look]}
        sceneId={character.sceneId}
        onFinished={() => {
          queryClient.setQueryData(dungeonsKey, playing.dungeons)
          apply(playing)
          setResult(playing)
          setPlaying(null)
        }}
      />
    )
  }
  const data = view.data
  // The result is a sibling after the board's dialog: its showModal runs last, so it is on top.
  return (
    <>
      <Dialog title="Dungeons" onClose={onClose} className="game-window-bare w-[1255px]">
        <div
          className="relative overflow-hidden font-game text-white"
          style={{
            width: WIDTH,
            height: HEIGHT,
            textShadow: TEXT_SHADOW,
          }}
        >
          <img
            src={BACKGROUND}
            alt=""
            className="absolute inset-0 size-full object-cover"
            onLoad={() => imageReady(BACKGROUND)}
            onError={() => imageReady(BACKGROUND)}
          />
          <div inert={loading} className="relative size-full">
            {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
            {data && (
              <>
                <Timers view={data} />
                <GameButton
                  className="!absolute top-[8px] right-[16px] h-[22px] w-[50px] !min-w-0 !px-0"
                  onClick={() => setInfo(true)}
                >
                  Info
                </GameButton>
                <Bosses
                  view={data}
                  busy={fight.isPending}
                  onFight={(index) => fight.mutate(index)}
                  onImageReady={imageReady}
                />
                {fight.error && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                    <Notice tone="error">{errorMessage(fight.error)}</Notice>
                  </div>
                )}
                {info && (
                  <InfoOverlay maxAttempts={data.maxAttempts} onClose={() => setInfo(false)} />
                )}
              </>
            )}
          </div>
          {loading && <AreaLoading />}
        </div>
      </Dialog>
      {result && <FightResult result={result} onClose={() => setResult(null)} />}
    </>
  )
}

/** Top left: next rotation, daily attempts, attempts reset. */
function Timers({ view }: { view: DungeonsView }) {
  const now = useNow()
  const left = view.attemptsRemaining
  return (
    <div className="absolute top-[12px] left-[16px] z-[2] flex flex-col gap-[6px]">
      <p className="text-[13px]">
        <span className="text-[#aaa]">Next rotation: </span>
        <span className="text-[14px] font-bold text-[#ffd700]">
          {hms(Date.parse(view.nextRotation) - now)}
        </span>
      </p>
      <p className="text-[13px] font-bold">
        Daily attempts:{' '}
        <span style={{ color: left > 0 ? '#7CFC00' : '#ff6666' }}>
          {left}/{view.maxAttempts}
        </span>
      </p>
      <p className="text-[12px] text-[#ddd]">
        Attempts reset in {hms(Date.parse(view.resetAt) - now)} (midnight UTC)
      </p>
    </div>
  )
}

/** Today's bosses spaced evenly: boss k of n is centred at 1245 / (n + 1) x (k + 1). */
function Bosses({
  view,
  busy,
  onFight,
  onImageReady,
}: {
  view: DungeonsView
  busy: boolean
  onFight: (index: number) => void
  onImageReady: (url: string) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const step = WIDTH / (view.activeBosses.length + 1)
  const out = view.attemptsRemaining <= 0
  return (
    <ul aria-label="Today's bosses">
      {view.activeBosses.map((index, k) => {
        const boss = view.bosses[index]!
        const x = step * (k + 1)
        const blocked = out || busy
        return (
          <li key={index}>
            <div
              aria-hidden
              className="absolute rounded-[50%]"
              style={{
                top: SHADOW.top,
                left: x - SHADOW.width / 2,
                width: SHADOW.width,
                height: SHADOW.height,
                background: 'radial-gradient(rgba(0,0,0,.6), transparent 70%)',
              }}
            />
            <span
              className="absolute -translate-x-1/2 text-[13px] font-bold whitespace-nowrap text-[#ff9900]"
              style={{ top: NAME_TOP, left: x }}
            >
              {boss.name}
            </span>
            <button
              type="button"
              aria-label={`Fight ${boss.name}`}
              aria-disabled={blocked}
              className="absolute -translate-x-1/2"
              style={{
                top: POSE.top,
                left: x,
                height: POSE.height,
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: out ? 0.55 : 1,
              }}
              onClick={() => !blocked && onFight(index)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
            >
              <img
                onLoad={() => onImageReady(poseUrl(boss.pose))}
                onError={() => onImageReady(poseUrl(boss.pose))}
                src={poseUrl(boss.pose)}
                alt=""
                className="h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.8)]"
              />
            </button>
            {hovered === index && <BossTooltip boss={boss} left={x + 110} />}
          </li>
        )
      })}
    </ul>
  )
}

const Divider = () => <hr className="my-1 border-[#d4a017]" />

/** Name, build and each drop's chances (7-day with the pity bonus, and permanent). */
function BossTooltip({ boss, left }: { boss: DungeonBoss; left: number }) {
  return (
    <div
      role="tooltip"
      className="game-frame absolute z-10 min-w-[180px] bg-black/90 p-2 text-[12px]"
      style={{ top: POSE.top, left }}
    >
      <p className="text-[14px] font-bold text-[#ff9900]">{boss.name}</p>
      <Divider />
      <p>
        Build: <span className="text-[#5df9ff]">{boss.build}</span>
      </p>
      <Divider />
      <p>Drops:</p>
      {boss.drops.length === 0 && <p>No scroll drops</p>}
      {boss.drops.map((drop) => {
        const chance = Math.min(drop.chance + boss.pity, DUNGEON_RULES.maxChance)
        return (
          <div key={drop.itemId} className="mt-1">
            <p className="text-[#a335ee]">{drop.name}</p>
            <p>
              7-day:{' '}
              <span style={{ color: chance > drop.chance ? '#ff9900' : '#22c55e' }}>{chance}%</span>{' '}
              (+{DUNGEON_RULES.pityStep}%/win, max {DUNGEON_RULES.maxChance}%)
            </p>
            <p>
              Permanent: <span className="text-[#ffd700]">{DUNGEON_RULES.permanentChance}%</span>
            </p>
          </div>
        )
      })}
    </div>
  )
}

/** Reborn's Info box, with our 7-day scrolls and UTC reset. */
function InfoOverlay({ maxAttempts, onClose }: { maxAttempts: number; onClose: () => void }) {
  const { bossCount, bossesPerDay, pityStep, maxChance, permanentChance, minLevel } = DUNGEON_RULES
  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center bg-black/70"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-label="Ninja Dungeons"
        className="game-frame max-h-[80%] w-[520px] overflow-auto bg-black/90 p-5 text-[13px] leading-[1.7]"
      >
        <h3 className="text-[18px] font-bold text-[#ff9900]">Ninja Dungeons</h3>
        <p>
          Every day, {bossesPerDay} random bosses are selected from a pool of {bossCount} powerful
          opponents. Each boss has a unique fighting style and drops exclusive Scroll Skills.
        </p>
        <p>
          You have {maxAttempts} attempts per day, shared across all three bosses. Attempts and
          bosses reset together at midnight UTC.
        </p>
        <h4 className="mt-2 font-bold text-[#ffd700]">How Drops Work</h4>
        <ul className="list-disc pl-5">
          <li>Each scroll has a base 2% chance to drop as a 7-day scroll.</li>
          <li>
            Every boss defeat without a scroll adds +{pityStep}% for that boss, up to {maxChance}%.
          </li>
          <li>The chance resets to 2% after you receive a scroll.</li>
          <li>Each scroll also has an independent {permanentChance}% chance to drop permanent.</li>
          <li>Using another 7-day copy extends the skill by 7 days.</li>
        </ul>
        <h4 className="mt-2 font-bold text-[#ffd700]">Scroll Skills</h4>
        <ul className="list-disc pl-5">
          <li>Scroll skills are equipped alongside your regular skills.</li>
          <li>
            7-day scrolls expire and are unequipped automatically; permanent ones never expire.
          </li>
        </ul>
        <h4 className="mt-2 font-bold text-[#ffd700]">Tips</h4>
        <ul className="list-disc pl-5">
          <li>Hover a boss to see its build, drops and your current chance.</li>
          <li>The rotation timer is at the top left.</li>
          <li>You must be level {minLevel} or higher to challenge dungeon bosses.</li>
        </ul>
        <div className="mt-3 flex justify-center">
          <GameButton className="h-[26px] w-[80px]" onClick={onClose}>
            Close
          </GameButton>
        </div>
      </section>
    </div>
  )
}

function FightResult({ result, onClose }: { result: Fight; onClose: () => void }) {
  const boss = result.replay.fighters.find((f) => f.side === 'defenders')?.name ?? 'the boss'
  const left = result.dungeons.attemptsRemaining
  return (
    <ResultWindow
      title={result.won ? 'Victory' : 'Defeat'}
      story={result.won ? `You defeated ${boss}.` : `${boss} defeated you.`}
      note={`Daily attempts left: ${left}/${result.dungeons.maxAttempts}.`}
      columns={[]}
      findTitle="Scrolls"
      finds={result.drops}
      emptyFind={result.won ? 'No scroll this time.' : 'Defeat a boss for a chance at a scroll.'}
      onClose={onClose}
    />
  )
}
