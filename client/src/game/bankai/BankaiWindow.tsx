// Reborn's Bankai window (bottom menu, level 30; reborn-windows-A-L.md "Bankai"): the crystal
// warehouse and devour on the left, the weapon tabs, crystal ring, forms and EXP bar in the centre,
// the weapon's stats with their swaps and the Soul Crystal sum on the right. Every rule and roll is
// the server's; this only shows the view and posts actions.
// ponytail: Reborn drags crystals; here a click picks a crystal up and a second click drops it.
import { useState } from 'react'
import type {
  BankaiView,
  BankaiWeaponName,
  BankaiWeaponView,
  CrystalPlace,
} from '../../../../shared/src/schemas/bankai'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { CrystalCell, CrystalColumn, type Run } from './CrystalColumn'
import { CrystalGuide, GetCrystal, UnlockSlot } from './dialogs'
import { useBankai, useBankaiAction } from './shared'

/** `Bp`: ring slot positions on Reborn's 420x420 art, drawn here at RING_SCALE to fit the window. */
const RING_POSITIONS = [
  [185, 30],
  [75, 80],
  [295, 80],
  [30, 185],
  [340, 185],
  [295, 290],
  [75, 290],
  [185, 340],
] as const
const RING_SCALE = 340 / 420

const number = (value: number) => value.toLocaleString('en-US')

export function BankaiWindow({ onClose }: { onClose: () => void }) {
  const bankai = useBankai()
  const action = useBankaiAction()
  const [message, setMessage] = useState<string | null>(null)
  const run: Run = (path, body, success, after) => {
    setMessage(null)
    action.mutate(
      { path, body },
      {
        onSuccess: (result) => {
          setMessage(success?.(result) ?? null)
          after?.()
        },
      },
    )
  }
  const error = bankai.error ?? action.error
  return (
    <Dialog title="Bankai" onClose={onClose} className="w-[920px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        {bankai.isPending && <p>Loading Bankai...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {message && <Notice>{message}</Notice>}
        {bankai.data && (
          <BankaiBody data={bankai.data} busy={action.isPending} run={run} notify={setMessage} />
        )}
      </div>
    </Dialog>
  )
}

function BankaiBody({
  data,
  busy,
  run,
  notify,
}: {
  data: BankaiView
  busy: boolean
  run: Run
  notify: (text: string) => void
}) {
  const [selected, select] = useState<BankaiWeaponName>(data.activeWeapon ?? 'zangetsu')
  const [held, setHeld] = useState<CrystalPlace | null>(null)
  const [absorbing, setAbsorbing] = useState(false)
  const [dialog, setDialog] = useState<'guide' | 'forge' | null>(null)
  const [unlockSlot, setUnlockSlot] = useState<number | null>(null)
  const weapon = data.weapons.find((w) => w.weapon === selected) ?? data.weapons[0]!
  const release = () => {
    setHeld(null)
    setAbsorbing(false)
  }
  /** Drops the held crystal on `to`, or picks up the crystal there. */
  const place = (to: CrystalPlace, hasCrystal: boolean) => {
    if (held) {
      const same = JSON.stringify(held) === JSON.stringify(to)
      if (!same) run('/crystals/move', { from: held, to })
      return release()
    }
    if (hasCrystal) setHeld(to)
  }
  const onCell = (index: number) => {
    if (data.lockedSlots.includes(index)) return setUnlockSlot(index)
    const crystal = data.inventory[index]
    if (absorbing && held?.type === 'ring') {
      if (crystal)
        run(
          '/crystals/absorb',
          { weapon: held.weapon, slot: held.slot, foodId: crystal.id },
          (r) => `+${r.xpGained} XP → Lv.${r.targetLevel}`,
        )
      return release()
    }
    place({ type: 'inventory', index }, crystal !== null)
  }
  return (
    <div className="flex gap-2">
      <CrystalColumn
        data={data}
        weapon={weapon.weapon}
        held={held}
        absorbing={absorbing}
        busy={busy}
        run={run}
        notify={notify}
        onCell={onCell}
        onRelease={release}
        onAbsorbMode={() => setAbsorbing(true)}
        onGetCrystal={() => setDialog('forge')}
        onInfo={() => setDialog('guide')}
      />
      <WeaponColumn
        data={data}
        weapon={weapon}
        held={held}
        busy={busy}
        run={run}
        onTab={(next) => {
          const target = data.weapons.find((w) => w.weapon === next)!
          if (target.level === 0 && !target.unlockable)
            return notify(`${target.name} is locked. Requires ${target.requirement} to unlock.`)
          release()
          select(next)
        }}
        onRingSlot={(slot) =>
          place({ type: 'ring', weapon: weapon.weapon, slot }, weapon.ring[slot] !== null)
        }
      />
      <StatsColumn weapon={weapon} run={run} />
      {dialog === 'guide' && <CrystalGuide onClose={() => setDialog(null)} />}
      {dialog === 'forge' && <GetCrystal data={data} onClose={() => setDialog(null)} />}
      {unlockSlot !== null && (
        <UnlockSlot
          slot={unlockSlot}
          busy={busy}
          onClose={() => setUnlockSlot(null)}
          onPay={(payWith) => {
            run('/slots/unlock', { slot: unlockSlot, payWith }, () => 'Slot unlocked!')
            setUnlockSlot(null)
          }}
        />
      )}
    </div>
  )
}

function WeaponColumn({
  data,
  weapon,
  held,
  busy,
  run,
  onTab,
  onRingSlot,
}: {
  data: BankaiView
  weapon: BankaiWeaponView
  held: CrystalPlace | null
  busy: boolean
  run: Run
  onTab: (weapon: BankaiWeaponName) => void
  onRingSlot: (slot: number) => void
}) {
  const { level } = weapon
  const atMax = level >= weapon.maxLevel
  const body = { weapon: weapon.weapon }
  return (
    <div className="flex w-[440px] shrink-0 flex-col items-center gap-1">
      <div className="flex gap-1">
        {data.weapons.map((w) => (
          <GameButton
            key={w.weapon}
            aria-pressed={w.weapon === weapon.weapon}
            className={`w-[104px] ${w.level === 0 && !w.unlockable ? 'opacity-60 grayscale' : ''}`}
            onClick={() => onTab(w.weapon)}
          >
            {w.name}
          </GameButton>
        ))}
      </div>
      <div className="game-card flex h-7 w-full items-center justify-between px-2">
        <span className="font-mono text-sm font-bold text-[#336]">
          {level > 0 ? `Lv.${level} ${weapon.name}` : 'Locked'}
        </span>
        {level === 0 && weapon.unlockable && (
          <GameButton small disabled={busy} onClick={() => run('/unlock', body)}>
            Unlock
          </GameButton>
        )}
        {level > 0 && (
          <GameButton
            small
            disabled={busy}
            aria-pressed={data.activeWeapon === weapon.weapon}
            onClick={() => run('/activate', body, () => `${weapon.name} Activated!`)}
          >
            Activate
          </GameButton>
        )}
      </div>
      {level === 0 && !weapon.unlockable && (
        <p className="text-[11px] font-bold text-[#c44]">
          Requires {weapon.requirement} to unlock.
        </p>
      )}
      <div
        aria-label="Crystal ring"
        role="group"
        className={`relative size-[340px] rounded-full border-8 border-double border-[#8a6d3b] bg-[radial-gradient(circle,#f5edd4,#c9b37a)] ${level > 0 ? '' : 'opacity-50'}`}
      >
        {RING_POSITIONS.map(([x, y], slot) => {
          const crystal = weapon.ring[slot] ?? null
          const opensAt = weapon.ringSlotLevels[slot]!
          const locked = level < opensAt
          return (
            <div
              key={slot}
              className="absolute"
              style={{ left: x * RING_SCALE, top: y * RING_SCALE }}
            >
              <CrystalCell
                crystal={crystal}
                label={
                  locked
                    ? `Ring slot ${slot + 1}: unlocks at Bankai level ${opensAt}`
                    : crystal
                      ? `Ring slot ${slot + 1}`
                      : `Ring slot ${slot + 1}: empty`
                }
                held={held?.type === 'ring' && held.slot === slot}
                disabled={locked}
                className="rounded-full"
                onClick={() => onRingSlot(slot)}
              />
            </div>
          )
        })}
      </div>
      {level > 0 && weapon.forms > 1 && (
        <div className="flex gap-1.5">
          {Array.from({ length: weapon.forms }, (_, i) => i + 1).map((form) => (
            <GameButton
              key={form}
              small
              aria-pressed={form === weapon.form}
              className={form === weapon.form ? 'brightness-125' : ''}
              onClick={() => run('/form', { ...body, form })}
            >
              Form {form}
            </GameButton>
          ))}
        </div>
      )}
      <div className="flex w-full items-center gap-1.5">
        <div className="relative h-[22px] flex-1 overflow-hidden rounded border-2 border-[#5a4a30] bg-[#1a1208]">
          <div
            className="h-full bg-[linear-gradient(180deg,#e8c84a,#a87a08)]"
            style={{
              width: `${atMax ? 100 : weapon.required ? Math.min(100, (weapon.exp / weapon.required) * 100) : 0}%`,
            }}
          />
          <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-[#f5edd4]">
            {level <= 0
              ? ''
              : atMax
                ? 'EXP: MAX'
                : `${number(weapon.exp)} / ${number(weapon.required)}`}
          </span>
        </div>
        <GameButton
          small
          disabled={busy || level <= 0 || atMax || data.expPool <= 0}
          onClick={() => run('/upgrade', body)}
        >
          {atMax ? 'Max Level' : 'Upgrade'}
        </GameButton>
      </div>
      {level > 0 && (
        <p className="text-[11px] font-bold text-[#336]">EXP Pool: {number(data.expPool)}</p>
      )}
    </div>
  )
}

function StatsColumn({ weapon, run }: { weapon: BankaiWeaponView; run: Run }) {
  return (
    <div className="game-card flex w-[200px] shrink-0 flex-col gap-1 p-2 font-mono text-[12px] font-bold">
      <h3 className="bg-[#d0c080] text-center text-[13px]">
        {weapon.name} Lv.{weapon.level}
      </h3>
      <ul aria-label="Bankai stats">
        {weapon.stats.map((row) => (
          <li key={row.stat} className="flex items-center justify-between">
            <span>
              {row.label}: {row.value}
              {row.percent ? '%' : ''}
            </span>
            {row.swappable && (
              <button
                type="button"
                aria-label={`Switch ${row.label} to ${row.counterpart} (same value)`}
                title={`Switch ${row.label} to ${row.counterpart} (same value)`}
                className="rounded border border-[#8a6d3b] bg-[#f3e3b5] px-1.5"
                onClick={() => run('/stat-swap', { stat: row.stat })}
              >
                &#8644;
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3 className="mt-1.5 bg-[#d0c080] text-center text-[13px]">Soul Crystal</h3>
      <ul aria-label="Soul Crystal">
        {weapon.soulCrystal.length === 0 && <li className="text-[#999]">None</li>}
        {weapon.soulCrystal.map((row) => (
          <li key={row.label}>
            {row.label}: {row.value}
          </li>
        ))}
      </ul>
    </div>
  )
}
