// Reborn's Wing Enhancement window (reborn-windows-M-Z-hud.md, key `wingEnhance`): the wing, its
// level and success rate, its stats, the Material / Integrity / Safety / Luck slots and Enhance.
// The odds come from the same game-core function the server rolls. Reborn opens it on the clicked
// bag wing; our window registry carries no item, so it starts on the worn wing with a picker.
import { useMutation } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { enhanceOdds, type WingOutcome } from '../../../../game-core/src/wings/enhance'
import type {
  TalismanFamily,
  WingEnhanceBody,
  WingEnhanceResult,
  WingsView,
} from '../../../../shared/src/schemas/wings'
import { api } from '../../lib/api'
import { errorMessage } from '../api'
import { formatStat } from '../bloodlines'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { nameOf, useSettleWings, useWingsView, WingIcon } from './shared'

/** Reborn's slot order after Material. */
const FAMILIES: { id: TalismanFamily; label: string }[] = [
  { id: 'integrity', label: 'Integrity' },
  { id: 'safety', label: 'Safety' },
  { id: 'luck', label: 'Luck' },
]
/** The ways an attempt can go wrong, shown under the success rate. */
const RISKS: { id: WingOutcome; label: string }[] = [
  { id: 'fail', label: 'No change' },
  { id: 'decrease', label: 'Level down' },
  { id: 'reset', label: 'Reset to +0' },
  { id: 'destroy', label: 'Destroyed' },
]
/** Reborn's result toasts. */
const OUTCOME_TEXT: Record<WingOutcome, string> = {
  success: 'Enhancement Success!',
  fail: 'Enhancement Failed',
  decrease: 'Wing Level Decreased!',
  reset: 'Wing Reset to +0!',
  destroy: 'Wing Destroyed!',
}

const percent = (value: number) => `${Number(value.toFixed(2))}%`
const BOX = 'game-card flex flex-col gap-0.5 p-2'

export function WingEnhanceWindow({ onClose }: { onClose: () => void }) {
  const view = useWingsView()
  const settle = useSettleWings()
  const [outcome, setOutcome] = useState<WingOutcome | null>(null)
  const enhance = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WingEnhanceBody }) =>
      api<WingEnhanceResult>(`/api/game/wings/${id}/enhance`, { method: 'POST', body }),
    onSuccess: (result) => {
      setOutcome(result.outcome)
      settle(result)
    },
  })
  const error = view.error ?? enhance.error
  return (
    <Dialog title="Wing Enhancement" onClose={onClose} className="game-window-bare w-[440px]">
      <div className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black">
        {view.isPending && <p>Loading wings...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {outcome && (
          <Notice tone={outcome === 'success' ? 'info' : 'error'}>{OUTCOME_TEXT[outcome]}</Notice>
        )}
        {view.data && (
          <EnhancePanel
            data={view.data}
            busy={enhance.isPending}
            onEnhance={(id, body) => {
              setOutcome(null)
              enhance.mutate({ id, body })
            }}
          />
        )}
      </div>
    </Dialog>
  )
}

function EnhancePanel({
  data,
  busy,
  onEnhance,
}: {
  data: WingsView
  busy: boolean
  onEnhance: (id: string, body: WingEnhanceBody) => void
}) {
  const [selectedId, select] = useState<string | null>(null)
  const [stoneId, setStone] = useState('')
  const [picks, setPicks] = useState<Partial<Record<TalismanFamily, string>>>({})
  const wing = data.owned.find((w) => w.id === selectedId) ?? data.equipped ?? data.owned[0] ?? null
  if (!wing)
    return <p>You have no wings or auras. Buy them in the Team Stone shop or the Essence shop.</p>
  const stone = data.stones.find((s) => s.itemId === stoneId && s.count > 0)
  const talisman = (family: TalismanFamily) =>
    data.talismans.find((t) => t.itemId === picks[family] && t.count > 0)
  const atMax = wing.level >= data.maxLevel
  const odds =
    stone && !atMax
      ? enhanceOdds(wing.level, stone.levelJump, {
          luck: talisman('luck')?.value,
          safety: talisman('safety')?.value,
          integrity: talisman('integrity')?.value,
        })
      : null
  const name = nameOf(wing.nameKey)
  return (
    <>
      {data.owned.length > 1 && (
        <label className="flex items-center gap-2">
          Wing
          <select value={wing.id} onChange={(event) => select(event.target.value)}>
            {data.owned.map((w) => (
              <option key={w.id} value={w.id}>
                {nameOf(w.nameKey)} +{w.level}
                {w.equipped ? ' (equipped)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-[80px_1fr_110px] gap-3">
        <div className={`${BOX} h-[90px] items-center justify-center`}>
          <WingIcon itemId={wing.itemId} name={name} />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="font-bold">{name}</p>
          <p>
            Level: +{wing.level}
            {atMax && ' (MAX)'}
          </p>
          <p>Success Rate: {odds ? percent(odds.success) : '--'}</p>
          {odds && (
            <ul aria-label="Outcome odds" className="text-[11px]">
              {RISKS.map(({ id, label }) => (
                <li key={id}>
                  {label}: {percent(odds[id])}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${BOX} min-h-[90px]`}>
          <p className="font-bold">Stats</p>
          <ul aria-label="Wing stats">
            {wing.stats.map((stat) => (
              <li key={stat.field}>{formatStat(stat)}</li>
            ))}
          </ul>
        </div>
      </div>
      <fieldset className={BOX}>
        <legend className="font-bold">Materials &amp; Talismans</legend>
        <div className="grid grid-cols-4 gap-2">
          <Slot
            label="Material"
            itemId={stone?.itemId}
            value={stone?.itemId ?? ''}
            onChange={setStone}
          >
            {data.stones
              .filter((s) => s.count > 0)
              .map((s) => (
                <option key={s.itemId} value={s.itemId}>
                  {nameOf(s.nameKey)} (+{s.levelJump}) x{s.count}
                </option>
              ))}
          </Slot>
          {FAMILIES.map(({ id, label }) => (
            <Slot
              key={id}
              label={label}
              itemId={talisman(id)?.itemId}
              value={talisman(id)?.itemId ?? ''}
              onChange={(value) => setPicks({ ...picks, [id]: value || undefined })}
            >
              {data.talismans
                .filter((t) => t.family === id && t.count > 0)
                .map((t) => (
                  <option key={t.itemId} value={t.itemId}>
                    {nameOf(t.nameKey)} x{t.count}
                  </option>
                ))}
            </Slot>
          ))}
        </div>
      </fieldset>
      <GameButton
        disabled={busy || !odds}
        title={stone || atMax ? undefined : 'Place a material first'}
        onClick={() => {
          onEnhance(wing.id, { stone: stone!.itemId, ...picks })
          setPicks({})
        }}
        className="h-[34px] w-[180px] self-center"
      >
        {atMax ? 'MAX LEVEL' : 'Enhance'}
      </GameButton>
      <p>The material and talismans are used up on every attempt.</p>
      {wing.next && (
        <p>
          Next (+{wing.level + 1}): {wing.next.map(formatStat).join(', ')}
        </p>
      )}
    </>
  )
}

/** A material slot: the placed item's icon and the choice of what goes in it. */
function Slot({
  label,
  itemId,
  value,
  onChange,
  children,
}: {
  label: string
  itemId: string | undefined
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col items-center gap-1">
      {itemId ? (
        <ItemIcon itemId={itemId} name="" className="size-9" />
      ) : (
        <span aria-hidden="true" className="game-slot block size-9" />
      )}
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      >
        <option value="">None</option>
        {children}
      </select>
    </div>
  )
}
