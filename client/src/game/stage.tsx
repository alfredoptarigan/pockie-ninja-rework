// React side of the Phaser stage (./phaser, loaded on demand so Phaser stays out of the first
// chunks). Each mount owns one Phaser game and destroys it on unmount (StrictMode safe).
//
// ScenePictureMount: the scene picture with hoverable, clickable buildings, NPCs and monsters; it
// calls `onNpc` / `onMonster` like SceneView's action list, which stays as the keyboard fallback.
//
// BattleReplayMount: plays a fight replay on the field's fight background with Skip, Replay and
// speed controls, and reports when it is over (or could not play) through `onFinished`.
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import scenesJson from '../generated/game-scenes.json'
import { DropsPanel } from './MonsterDrops'
import type { PicturePortrait } from './phaser/picture-layout'
import { GameButton } from './skin'
import type { Replay, SceneMonster, SceneNpc, SceneView } from './types'

type Stage = typeof import('./phaser')
const loadStage = () => import('./phaser')

const hasPicture = (sceneId: number) =>
  Boolean(
    (scenesJson.scenes as Record<string, { layers: { background?: string } }>)[sceneId]?.layers
      .background,
  )

/**
 * Runs `start` once the container exists and whenever `key` changes; destroys what it started.
 * Returns the started handle (null until ready) and whether starting failed.
 */
function useStage<H extends { destroy: () => void }>(
  key: unknown,
  start: (stage: Stage, parent: HTMLDivElement) => H | null | Promise<H | null>,
) {
  const ref = useRef<HTMLDivElement>(null)
  const [handle, setHandle] = useState<H | null>(null)
  const [failed, setFailed] = useState(false)
  const run = useEffectEvent(start)
  useEffect(() => {
    const parent = ref.current
    if (!parent) return
    let cancelled = false
    let started: H | null = null
    loadStage()
      .then((stage) => run(stage, parent))
      .then(
        (h) => {
          if (cancelled) return h?.destroy()
          started = h
          setHandle(h)
          setFailed(!h)
        },
        (error: unknown) => {
          console.error('The game stage could not start.', error)
          if (!cancelled) setFailed(true)
        },
      )
    return () => {
      cancelled = true
      started?.destroy()
      setHandle(null)
    }
  }, [key])
  return { ref, handle, failed }
}

/** Ref to the latest props, for callbacks Phaser keeps across renders. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

export function ScenePictureMount({
  scene,
  onNpc,
  onMonster,
  onExplore,
}: {
  scene: SceneView
  onNpc: (npc: SceneNpc) => void
  onMonster: (monster: SceneMonster) => void
  /** The field's explore tree was clicked. */
  onExplore?: () => void
}) {
  const latest = useLatest({ onNpc, onMonster, onExplore })
  const [hovered, setHovered] = useState<PicturePortrait | null>(null)
  const { ref, failed } = useStage(scene, (stage, parent) =>
    stage.mountPicture(parent, scene, {
      onNpc: (npc) => latest.current.onNpc(npc),
      onMonster: (monster) => {
        setHovered(null)
        latest.current.onMonster(monster)
      },
      onExplore: () => latest.current.onExplore?.(),
      onMonsterHover: setHovered,
    }),
  )
  if (!hasPicture(scene.sceneId) || failed) return null
  // The canvas has no keyboard access; SceneView's action list offers the same actions.
  // It fills the stage (same 16:9 ratio as the 1920x1080 pictures).
  return (
    <>
      <div
        ref={ref}
        data-testid="scene-picture"
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden bg-black"
      />
      {hovered && <DropsPanel monster={hovered.monster} at={hovered.dropsAt} />}
    </>
  )
}

const SPEEDS = [1, 2] as const

export function BattleReplayMount({
  replay,
  clothing,
  monsterIds,
  sceneId,
  weaponItemId,
  onFinished,
}: {
  replay: Replay
  clothing: number
  monsterIds: string[]
  sceneId: number
  /** The player's equipped weapon, drawn over the body. */
  weaponItemId?: string
  onFinished: () => void
}) {
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const latest = useLatest(onFinished)
  const { ref, handle, failed } = useStage(replay, (stage, parent) =>
    stage.mountBattle(parent, {
      replay,
      clothing,
      monsterIds,
      sceneId,
      weaponItemId,
      onFinished: () => latest.current(),
    }),
  )
  useEffect(() => handle?.setSpeed(speed), [handle, speed])
  useEffect(() => {
    if (failed) latest.current()
  }, [failed, latest])

  if (failed) return null
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
      <section aria-label="Battle replay" className="flex w-[min(1000px,100%)] flex-col gap-2">
        <div
          ref={ref}
          data-testid="battle-stage"
          className="aspect-[5/3] w-full overflow-hidden rounded bg-black"
        />
        <div className="flex justify-center gap-2">
          <GameButton small autoFocus disabled={!handle} onClick={() => handle?.skip()}>
            Skip
          </GameButton>
          <GameButton small disabled={!handle} onClick={() => handle?.replay()}>
            Replay
          </GameButton>
          {SPEEDS.map((s) => (
            <GameButton key={s} small aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              Speed x{s}
            </GameButton>
          ))}
        </div>
      </section>
    </div>
  )
}
