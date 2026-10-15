// React side of the Phaser stage (./phaser, loaded on demand so Phaser stays out of the first
// chunks). Each mount owns one Phaser game and destroys it on unmount (StrictMode safe).
//
// ScenePictureMount: the scene picture with hoverable, clickable buildings, NPCs and monsters; it
// calls `onNpc` like SceneView's action list, which stays as the keyboard fallback. The monster
// cards are HUD elements (MonsterRow), not part of the picture.
//
// BattleReplayMount: plays a fight replay on the field's fight background with Skip, Replay and
// speed controls, and reports when it is over (or could not play) through `onFinished`.
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import scenesJson from '../generated/game-scenes.json'
import type { CompanionLook } from './phaser/companions'
import type { FighterLook } from './phaser/motion'
import type { PictureActions } from './phaser/picture-scene'
import { GameButton } from './skin'
import type { Replay, SceneNpc, SceneView } from './types'

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
  onExplore,
  onBuilding,
  exploreClip,
}: {
  scene: SceneView
  onNpc: (npc: SceneNpc) => void
  /** The field's explore tree was clicked. */
  onExplore?: () => void
  /** A village building without its own NPC menu was clicked (the Pet Kennel, the Card Room). */
  onBuilding?: PictureActions['onBuilding']
  /** Scene element of the explore tree (GET /explore `clipName`). */
  exploreClip?: string
}) {
  const latest = useLatest({ onNpc, onExplore, onBuilding })
  const key = useMemo(() => ({ scene, exploreClip }), [scene, exploreClip])
  const { ref, failed } = useStage(key, (stage, parent) =>
    stage.mountPicture(
      parent,
      scene,
      {
        onNpc: (npc) => latest.current.onNpc(npc),
        onExplore: () => latest.current.onExplore?.(),
        onBuilding: (clip) => latest.current.onBuilding?.(clip),
      },
      exploreClip,
    ),
  )
  if (!hasPicture(scene.sceneId) || failed) return null
  // The canvas has no keyboard access; SceneView's action list offers the same actions.
  // It fills the stage (same 16:9 ratio as the 1920x1080 pictures).
  return (
    <div
      ref={ref}
      data-testid="scene-picture"
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-black"
    />
  )
}

const SPEEDS = [1, 2] as const

export function BattleReplayMount({
  replay,
  clothing,
  monsterIds,
  defenderLooks,
  sceneId,
  weaponItemId,
  look,
  onFinished,
}: {
  replay: Replay
  clothing: number
  monsterIds: string[]
  /** How each defender is drawn (arena and duels); replaces `monsterIds`. */
  defenderLooks?: FighterLook[]
  sceneId: number
  /** The player's equipped weapon, drawn over the body. */
  weaponItemId?: string
  /** The player's wing, aura and pet when the replay fighters do not carry them (snapshots). */
  look?: CompanionLook
  onFinished: () => void
}) {
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const latest = useLatest(onFinished)
  const { ref, handle, failed } = useStage(replay, (stage, parent) =>
    stage.mountBattle(parent, {
      replay,
      clothing,
      monsterIds,
      defenderLooks,
      sceneId,
      weaponItemId,
      look,
      onFinished: () => latest.current(),
    }),
  )
  useEffect(() => handle?.setSpeed(speed), [handle, speed])
  useEffect(() => {
    if (failed) latest.current()
  }, [failed, latest])

  if (failed) return null
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-black/20 p-4 backdrop-blur-sm">
      <section
        aria-label="Battle replay"
        className="relative w-[min(1000px,100%,calc((100dvh-32px)*5/3))]"
      >
        <div
          ref={ref}
          data-testid="battle-stage"
          className="aspect-[5/3] w-full overflow-hidden bg-black"
        />
        <div className="absolute inset-x-2 bottom-2 flex justify-between gap-2">
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
