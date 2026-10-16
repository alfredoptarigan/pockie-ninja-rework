import type { LasNochesView } from '@pockie/shared'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { errorMessage } from '../api'
import { useMonsterPortrait } from '../art'
import { AreaLoading } from '../AreaLoading'
import { plainText } from '../text'
import {
  Crown,
  Divider,
  Garganta,
  LifeMask,
  MaskFrame,
  Rift,
  seamPosition,
  Tick,
} from './las-noches-art'
import './las-noches.css'
import { artBox, LasNochesScene, useViewport } from './LasNochesScene'

// Reborn's tower layout (main.cfd1c9d9): a 1120 x 580 canvas fitted between the HUD bars, and the
// rift meter pinned to the sky of the background art.
const CANVAS = { width: 1120, height: 580, top: 38, bottom: 42, side: 8, gutter: 16 }
const MAX_SPREAD = 150
const RIFT_BOX = { left: 640, top: 248, width: 700, height: 145 }
const PRIMARY = { width: 204, height: 46 }
const SECONDARY = { width: 122, height: 34 }
/** Markers closer than this (percent of the meter) hide ticks or move aside. */
const MARKER_GAP = 7

const number = (value: number) => Math.round(value).toString()
const isNumeric = (value: string) => /^[\d\s.,/+-]+$/.test(value)

function canvasFit(width: number, height: number) {
  const room = Math.max(0, width - 2 * CANVAS.side)
  const tall = Math.max(0, height - CANVAS.top - CANVAS.bottom)
  const fit = Math.min(room / CANVAS.width, tall / CANVAS.height)
  const scale = Math.round(1000 * Math.max(0.5, Math.min(1, fit || 1))) / 1000
  const spread = (room / scale - CANVAS.width) / 2 - CANVAS.gutter
  return {
    scale,
    spread: Math.round(Math.max(0, Math.min(MAX_SPREAD, spread))),
    left: Math.round(CANVAS.side + (room - CANVAS.width * scale) / 2),
    top: Math.round(CANVAS.top + Math.max(0, (tall - CANVAS.height * scale) / 2)),
  }
}

/** Marker positions on the rift meter, in percent of its length. */
export function riftMarkers(cleared: number, next: number, best: number, started: boolean) {
  const max = Math.max(10, 10 * Math.ceil(Math.max(best, next) / 10))
  const at = (floor: number) =>
    Math.round(100 * Math.max(0, Math.min(100, (floor / max) * 100))) / 100
  const showCurrent = started && cleared > 0
  const current = showCurrent ? at(cleared) : 0
  const nextAt = at(next)
  const atRecord = showCurrent && best > 0 && cleared >= best
  const showBest = best > 0 && !atRecord
  let bestAt = at(best)
  if (showBest && Math.abs(bestAt - nextAt) < MARKER_GAP)
    bestAt = best >= next ? nextAt + MARKER_GAP : Math.max(0, nextAt - MARKER_GAP)
  const ticks = [...new Set([1, max / 4, max / 2, (3 * max) / 4, max])]
    .filter((floor) => Number.isInteger(floor))
    .filter((floor) => !showCurrent || Math.abs(at(floor) - current) >= MARKER_GAP)
    .map((floor) => ({ floor, at: at(floor) }))
    .filter(
      (tick) =>
        Math.abs(tick.at - nextAt) >= MARKER_GAP &&
        !(showBest && Math.abs(tick.at - bestAt) < MARKER_GAP),
    )
  return {
    current,
    showCurrent,
    next: nextAt,
    best: bestAt,
    showBest,
    atRecord,
    ticks,
    lit: showCurrent ? Math.floor(current / 10) : 0,
    bestBelow: showBest && showCurrent && Math.abs(bestAt - current) < 12,
  }
}

/** Reborn's JButton markup with the tower's own skin. */
function TowerButton({
  className,
  size,
  disabled = false,
  title,
  pressed,
  onClick,
  children,
}: {
  className: string
  size: { width: number; height: number }
  disabled?: boolean
  title?: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <div
      className={`button jbutton btn-variant-green ln-btn ${className}${disabled ? ' --disabled' : ''}`}
      style={size}
      title={title}
    >
      <div className="button__background button__background--green" />
      <button
        type="button"
        className="button__button text-shadow"
        style={size}
        disabled={disabled}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {children}
      </button>
    </div>
  )
}

function Stat({ label, value, vital = false }: { label: string; value: string; vital?: boolean }) {
  return (
    <div
      className={vital ? 'ln-vital ln-plate' : 'ln-stat'}
      data-stat={label}
      title={`${label}: ${value}`}
    >
      <span className="ln-stat__label">{label}</span>
      <span className="ln-stat__value">{value}</span>
    </div>
  )
}

const RULES = [
  'Climb the tower floor by floor. Every floor you clear adds EXP to your bank.',
  'You have 2 lives per run. Losing a fight costs 1 life and you stay on the same floor.',
  'Losing a fight halves your banked EXP. Losing your last life wipes it completely and ends the climb, so claim before you risk it.',
  'EXP is only given when you Claim. Claiming ends the run and uses 1 of your 3 daily tries, which reset at midnight.',
  'Your highest floor is saved as your record. Beat it to set a new one.',
]
const WARN_RULE = 2

function expWarning(started: boolean, lives: number, pot: number) {
  const from = pot.toLocaleString()
  if (started && lives <= 0)
    return {
      tone: 'danger',
      text: 'All lives lost: your banked EXP is gone. Claim to end the run.',
    }
  if (started && lives === 1)
    return {
      tone: 'danger',
      text: `Last life! Losing again wipes all your EXP (${from}). Claim now to keep it.`,
    }
  if (started && pot > 0)
    return {
      tone: 'info',
      text: `Losing this floor halves your EXP: ${from} → ${Math.floor(pot / 2).toLocaleString()}`,
    }
  return {
    tone: 'info',
    text: 'Lose a fight and your banked EXP is halved. Lose both lives and all of it is gone.',
  }
}

export function LasNochesTower({
  data,
  busy,
  auto,
  garganta,
  message,
  error,
  onChallenge,
  onGargantaDone,
  onAuto,
  onClaim,
  onLeave,
  onStopLegacy,
  onResumeLegacy,
}: {
  data: LasNochesView
  busy: boolean
  auto: boolean
  /** Bumped to replay the Garganta; 0 hides it. */
  garganta: number
  message: string | null
  error: unknown
  onChallenge: () => void
  onGargantaDone: () => void
  onAuto: () => void
  onClaim: () => void
  onLeave: () => void
  onStopLegacy: () => void
  onResumeLegacy: () => void
}) {
  const viewport = useViewport()
  const fit = canvasFit(viewport.width, viewport.height)
  const art = artBox(viewport.width, viewport.height)
  const portrait = useMonsterPortrait()(data.preview?.npcId ?? '')
  const [backgroundReady, setBackgroundReady] = useState(false)
  const [portraitReady, setPortraitReady] = useState<string | null>(null)
  const ready = backgroundReady && (!portrait || portraitReady === portrait)
  const [rules, setRules] = useState(false)
  useEffect(() => {
    if (!rules) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setRules(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rules])

  const run = data.run
  const enemy = data.preview
  const started = !!run
  const lives = run?.lives ?? 2
  const pot = run?.pot ?? 0
  const cleared = run ? Math.max(0, run.floor - 1) : 0
  const next = run?.floor ?? 1
  const best = Math.max(0, data.bestFloor)
  const bestText = best > 0 ? `${best}` : 'None'
  const noTries = data.runsLeft <= 0
  const legacy = data.mode === 1
  const complete = enemy === null

  const enemyTitle = [
    'Next Floor Enemy',
    `Floor ${next}`,
    ...(enemy?.level ? [`Lv.${enemy.level}`] : []),
  ].join(' - ')
  const heading = `Las Noches Tower - Floor ${next}`
  const record = started
    ? `Floor ${cleared} / Highest Floor ${bestText}`
    : `Not Started - Highest Floor ${bestText}`
  const status =
    lives === 0
      ? { text: 'No lives remaining', tone: 'danger' }
      : !started && noTries
        ? { text: 'No daily tries left. Resets at midnight.', tone: 'danger' }
        : started
          ? { text: 'Storming Las Noches', tone: 'storm' }
          : { text: 'Ready to Begin', tone: 'ready' }
  const warning = expWarning(started, lives, pot)
  const tiles = [
    { key: 'current', label: 'Current Floor', value: cleared > 0 ? `${cleared}` : 'Not Started' },
    { key: 'next', label: 'Next Floor', value: `${next}` },
    { key: 'exp', label: 'Current EXP', value: pot.toLocaleString() },
    { key: 'reward', label: 'Next Reward', value: (enemy?.exp ?? 0).toLocaleString() },
    {
      key: 'lives',
      label: 'Lives Remaining',
      value: `${lives}`,
      tone: lives === 0 ? 'danger' : undefined,
      masks: lives,
    },
    {
      key: 'tries',
      label: 'Daily Tries Left',
      value: `${Math.max(0, data.runsLeft)}/${data.maxRuns}`,
      tone: noTries ? 'danger' : undefined,
    },
    {
      key: 'best',
      label: 'Highest Floor',
      value: bestText,
      tone: started && cleared > 0 && cleared >= best ? 'record' : undefined,
    },
  ]
  const meter = riftMarkers(cleared, next, best, started)
  const progress =
    best > 0 ? Math.min(100, Math.round((cleared / best) * 100)) : cleared > 0 ? 100 : 0
  const primaryLabel = started ? 'Next Floor' : 'Begin Challenge'
  const primaryDisabled = lives === 0 || busy || auto || complete || legacy || (!started && noTries)

  return (
    <section
      className={`ln-stage${ready ? ' ln-stage--ready' : ''}`}
      data-status={ready ? status.tone : 'loading'}
      aria-label="Las Noches Tower Challenge"
      // Above the scene, below the HUD; it also keeps clicks off the scene behind it.
      style={{ inset: 0, zIndex: 5, pointerEvents: 'auto' }}
    >
      <LasNochesScene onLoad={() => setBackgroundReady(true)} />
      <div className="ln-stage__veil" aria-hidden="true" />
      {ready && (
        <div
          className="ln-tower ln-rift-meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={record}
          title={record}
          style={{
            left: art.left + RIFT_BOX.left * art.scale,
            top: art.top + RIFT_BOX.top * art.scale,
            width: RIFT_BOX.width * art.scale,
            height: RIFT_BOX.height * art.scale,
          }}
        >
          <Rift open={meter.current} lit={meter.lit} />
          {meter.ticks.map((tick) => (
            <span
              key={tick.floor}
              className="ln-rift__tick"
              data-floor={tick.floor}
              style={seamPosition(tick.at)}
            >
              {tick.floor}
            </span>
          ))}
          {meter.showCurrent && (
            <span
              className={`ln-rift__now${meter.atRecord ? ' ln-rift__now--record' : ''}`}
              data-marker="current"
              style={seamPosition(meter.current)}
            >
              {meter.atRecord && <Crown />}
              <Tick value={cleared} />
            </span>
          )}
          <span className="ln-rift__next" data-marker="next" style={seamPosition(meter.next)}>
            <span className="ln-tower__arrow" />
            <Tick value={next} />
          </span>
          {meter.showBest && (
            <span
              className={`ln-rift__best${meter.bestBelow ? ' ln-rift__best--below' : ''}`}
              data-marker="best"
              style={seamPosition(meter.best)}
            >
              <Crown />
              {best}
            </span>
          )}
        </div>
      )}
      <div
        className="ln-canvas"
        style={
          {
            left: fit.left,
            top: fit.top,
            transform: `scale(${fit.scale})`,
            '--ln-spread': `${fit.spread}px`,
          } as CSSProperties
        }
      >
        <div className="ln-enemy">
          {enemy ? (
            <>
              <div className="ln-presence">
                <span className="ln-presence__aura" aria-hidden="true" />
                <div className="ln-portrait">
                  <div className="ln-portrait__window">
                    {portrait && (
                      <img
                        className="ln-portrait__image"
                        src={portrait}
                        alt={plainText(enemy.nameKey)}
                        onLoad={() => setPortraitReady(portrait)}
                        onError={() => setPortraitReady(portrait)}
                      />
                    )}
                  </div>
                  <MaskFrame />
                </div>
              </div>
              <pre className="ln-enemy__title" title={enemyTitle}>
                {enemyTitle}
              </pre>
              <div className="ln-vitals">
                <Stat vital label="HP" value={number(enemy.hp)} />
                <Stat
                  vital
                  label="ATK"
                  value={`${number(enemy.minAttack)}-${number(enemy.maxAttack)}`}
                />
              </div>
              <div className="ln-ledger ln-plate">
                <Stat label="DEF" value={number(enemy.defense)} />
                <Stat label="Hit" value={number(enemy.hit)} />
                <Stat label="Pierce" value={number(enemy.pierce)} />
                <Stat label="Break" value={number(enemy.break)} />
                <Stat label="Const" value={number(enemy.constitution)} />
                <Stat label="Speed" value={number(enemy.speed)} />
                <Stat label="Block" value={number(enemy.block)} />
                <Stat label="Chakra" value={number(enemy.chakra)} />
              </div>
            </>
          ) : (
            <>
              <pre className="ln-enemy__title" title={enemyTitle}>
                {enemyTitle}
              </pre>
              <pre className="ln-empty ln-plate">No enemy info available</pre>
            </>
          )}
        </div>
        <div className="ln-center">
          <div className="ln-tower-space" />
          <pre className="ln-heading" title={heading}>
            {heading}
          </pre>
          <pre className={`ln-status ln-status--${status.tone}`}>{status.text}</pre>
        </div>
        <div className="ln-record">
          <pre className="ln-record__title" title={record}>
            {record}
          </pre>
          <button
            type="button"
            className={`ln-info-btn${rules ? ' ln-info-btn--open' : ''}`}
            aria-label="How Las Noches works"
            aria-expanded={rules}
            title="How Las Noches works"
            onClick={() => setRules(!rules)}
          >
            <span className="ln-info-btn__label">Info</span>
            <span className="ln-info-btn__icon" aria-hidden="true">
              i
            </span>
          </button>
          <Divider width={260} />
          <dl className="ln-tiles ln-plate">
            {tiles.map((tile) => (
              <div
                key={tile.key}
                className={`ln-tile ln-tile--${tile.key}${tile.tone ? ` ln-tile--${tile.tone}` : ''}`}
                data-tile={tile.key}
                title={`${tile.label}: ${tile.value}`}
              >
                <dt className="ln-tile__label">{tile.label}</dt>
                <dd
                  className={`ln-tile__value${isNumeric(tile.value) ? '' : ' ln-tile__value--word'}`}
                >
                  {tile.masks !== undefined && (
                    <span className="ln-lives" aria-hidden="true">
                      {tile.masks > 0 ? (
                        Array.from({ length: Math.min(tile.masks, 6) }, (_, index) => (
                          <LifeMask key={index} />
                        ))
                      ) : (
                        <LifeMask spent />
                      )}
                    </span>
                  )}
                  <Tick value={tile.value} />
                </dd>
              </div>
            ))}
          </dl>
          <div
            className={`ln-warn ln-warn--${warning.tone}`}
            data-testid="las-noches-halve-warning"
            role="note"
          >
            {warning.text}
          </div>
          {data.auto && (
            <div className="ln-warn ln-warn--info" role="note">
              Purchased auto runs left: {data.auto.runsLeft}. Target floor: {data.auto.reachFloor}.{' '}
              <button
                type="button"
                className="pointer-events-auto underline"
                disabled={busy}
                onClick={legacy ? onStopLegacy : onResumeLegacy}
              >
                {legacy ? 'Stop Auto' : 'Resume purchased runs'}
              </button>
            </div>
          )}
        </div>
        <div className="ln-actions">
          <TowerButton
            className="ln-btn--primary"
            size={PRIMARY}
            title={
              !started && data.options.first.stone > 0
                ? `Entry: ${data.options.first.stone.toLocaleString('en-US')} Stones`
                : primaryLabel
            }
            disabled={primaryDisabled}
            onClick={onChallenge}
          >
            {primaryLabel}
          </TowerButton>
          <div className="ln-actions__row">
            <TowerButton
              className="ln-btn--leave"
              size={SECONDARY}
              title="Leave Tower"
              onClick={onLeave}
            >
              Leave Tower
            </TowerButton>
            <TowerButton
              className={`ln-btn--auto${auto ? ' btn-active' : ''}`}
              size={SECONDARY}
              title="Keep fighting automatically. Untick to stop."
              pressed={auto}
              disabled={lives === 0 || busy || !started || complete || legacy}
              onClick={onAuto}
            >
              {auto ? 'Auto Stop' : 'Auto Battle'}
            </TowerButton>
            <TowerButton
              className={`ln-btn--claim${started && pot > 0 ? ' ln-btn--claimable' : ''}`}
              size={SECONDARY}
              title="Claim"
              disabled={!started || busy || legacy}
              onClick={onClaim}
            >
              Claim
            </TowerButton>
          </div>
          {(message || !!error) && (
            <p role="status" className="ln-status ln-status--ready">
              {error ? errorMessage(error) : message}
            </p>
          )}
        </div>
        {ready && rules && (
          <div
            className="ln-rules ln-plate"
            role="dialog"
            aria-label="How Las Noches works"
            data-testid="las-noches-rules"
          >
            <button
              type="button"
              className="ln-rules__close"
              aria-label="Close"
              title="Close"
              onClick={() => setRules(false)}
            >
              ×
            </button>
            <div className="ln-rules__title">How Las Noches works</div>
            <ul className="ln-rules__list">
              {RULES.map((rule, index) => (
                <li
                  key={rule}
                  className={`ln-rules__item${index === WARN_RULE ? ' ln-rules__item--warn' : ''}`}
                >
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        )}
        {garganta > 0 && <Garganta key={garganta} onDone={onGargantaDone} />}
      </div>
      {!ready && <AreaLoading label="Loading Las Noches..." />}
    </section>
  )
}
