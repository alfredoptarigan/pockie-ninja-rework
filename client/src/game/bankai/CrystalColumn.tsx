// Left column of the Bankai window: Crystal Warehouse (4x4 cells, 5 pages), the held crystal's
// actions, multi-select, Crystal Devour (6 food slots and a target) and Get Crystal.
import { useState } from 'react'
import type {
  BankaiCrystal,
  BankaiView,
  BankaiWeaponName,
  CrystalPlace,
} from '../../../../shared/src/schemas/bankai'
import { GameButton } from '../skin'
import { crystalTitle, crystalTooltip, QUALITY_COLORS, type BankaiResult } from './shared'

const PAGE = 16
const PAGES = 5
const FOOD_SLOTS = 6

export type Run = (
  path: string,
  body: object,
  success?: ((result: BankaiResult) => string | null) | null,
  after?: () => void,
) => void

export function CrystalCell({
  crystal,
  label,
  held,
  className = '',
  ...props
}: {
  crystal: BankaiCrystal | null | undefined
  label: string
  held?: boolean
  className?: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={crystal ? `${label}: ${crystalTitle(crystal)}` : label}
      title={crystal ? crystalTooltip(crystal) : undefined}
      className={`relative grid size-12 place-items-center border text-[9px] leading-tight font-bold text-white disabled:cursor-not-allowed ${
        held ? 'border-2 border-[#ff4400] opacity-60' : 'border-[#b0a060]'
      } ${className}`}
      style={{
        background: crystal
          ? `linear-gradient(135deg, ${QUALITY_COLORS[crystal.quality]}99, ${QUALITY_COLORS[crystal.quality]})`
          : '#d8c888',
      }}
      {...props}
    >
      {crystal && (
        <>
          <span className="absolute top-0 right-0.5 text-[8px]">Lv{crystal.level}</span>
          <span className="px-0.5 text-center [text-shadow:0_0_2px_#000]">{crystal.name}</span>
        </>
      )}
    </button>
  )
}

export function CrystalColumn({
  data,
  weapon,
  held,
  absorbing,
  busy,
  run,
  notify,
  onCell,
  onRelease,
  onAbsorbMode,
  onGetCrystal,
  onInfo,
}: {
  data: BankaiView
  weapon: BankaiWeaponName
  held: CrystalPlace | null
  absorbing: boolean
  busy: boolean
  run: Run
  notify: (text: string) => void
  onCell: (index: number) => void
  onRelease: () => void
  onAbsorbMode: () => void
  onGetCrystal: () => void
  onInfo: () => void
}) {
  const [page, setPage] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [foods, setFoods] = useState<string[]>([])
  const [targetId, setTargetId] = useState<string | null>(null)
  const byId = (id: string | null) => data.inventory.find((c) => c?.id === id) ?? null
  const foodCrystals = foods.map(byId).filter((c): c is BankaiCrystal => c !== null)
  const target = byId(targetId)
  const ring = data.weapons.find((w) => w.weapon === weapon)?.ring ?? []
  const heldCrystal =
    held?.type === 'inventory' ? data.inventory[held.index] : held ? ring[held.slot] : null

  const addFoods = (ids: string[]) => {
    const fresh = ids.filter((id) => !foods.includes(id) && id !== targetId)
    if (foods.length + fresh.length > FOOD_SLOTS) return notify('Devour slots are full')
    setFoods([...foods, ...fresh])
  }
  const toggleSelected = (crystal: BankaiCrystal) => {
    if (selected.includes(crystal.id))
      return setSelected(selected.filter((id) => id !== crystal.id))
    if (selected.length >= FOOD_SLOTS) return notify('Maximum 6 crystals can be selected')
    setSelected([...selected, crystal.id])
  }

  return (
    <div className="flex w-[220px] shrink-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <h3 className="font-bold">Crystal Warehouse</h3>
        <label className="flex items-center gap-1 text-[10px]">
          <input
            type="checkbox"
            checked={selecting}
            onChange={() => {
              setSelecting(!selecting)
              setSelected([])
            }}
          />
          Select
        </label>
        {selecting && selected.length > 0 && (
          <GameButton
            small
            onClick={() => {
              addFoods(selected)
              setSelected([])
              setSelecting(false)
            }}
          >
            Move ({selected.length})
          </GameButton>
        )}
      </div>
      <div className="game-card grid grid-cols-4 justify-center gap-[3px] p-1.5">
        {Array.from({ length: PAGE }, (_, i) => {
          const index = page * PAGE + i
          const crystal = data.inventory[index]
          if (data.lockedSlots.includes(index))
            return (
              <button
                key={index}
                type="button"
                aria-label={`Cell ${index + 1}: locked`}
                title="Use gold to unlock additional inventory slots."
                className="grid size-12 place-items-center border border-[#b0a060] bg-[#b8a870] text-lg"
                onClick={() => onCell(index)}
              >
                <span aria-hidden="true">&#128274;</span>
              </button>
            )
          return (
            <CrystalCell
              key={index}
              crystal={crystal}
              label={crystal ? `Cell ${index + 1}` : `Cell ${index + 1}: empty`}
              held={
                (held?.type === 'inventory' && held.index === index) ||
                (crystal != null && selected.includes(crystal.id))
              }
              onClick={() => (selecting && crystal ? toggleSelected(crystal) : onCell(index))}
            />
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[10px]">
        <GameButton
          small
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          &lt;
        </GameButton>
        <span>
          {page + 1}/{PAGES}
        </span>
        <GameButton
          small
          aria-label="Next page"
          disabled={page === PAGES - 1}
          onClick={() => setPage(page + 1)}
        >
          &gt;
        </GameButton>
      </div>
      {absorbing && (
        <p className="border border-[#ffa040] bg-[#fff3e0] px-1 text-center text-[10px] font-bold text-[#c44]">
          Absorb crystals to gain their stats and experience
        </p>
      )}
      {held && heldCrystal && (
        <div aria-label="Held crystal" role="group" className="flex flex-wrap gap-1 text-[10px]">
          <span className="w-full font-bold">Holding: {crystalTitle(heldCrystal)}</span>
          {held.type === 'inventory' ? (
            <>
              <GameButton
                small
                onClick={() => {
                  setFoods(foods.filter((id) => id !== heldCrystal.id))
                  setTargetId(heldCrystal.id)
                  onRelease()
                }}
              >
                Set as target
              </GameButton>
              <GameButton
                small
                onClick={() => {
                  addFoods([heldCrystal.id])
                  onRelease()
                }}
              >
                Add as food
              </GameButton>
              <GameButton
                small
                disabled={busy}
                onClick={() => run('/crystals/sell', { id: heldCrystal.id }, null, onRelease)}
              >
                Sell
              </GameButton>
            </>
          ) : (
            <>
              <GameButton small onClick={onAbsorbMode}>
                Absorb
              </GameButton>
              <GameButton
                small
                disabled={busy}
                onClick={() =>
                  run('/crystals/unequip', { weapon, slot: held.slot }, null, onRelease)
                }
              >
                Unequip
              </GameButton>
            </>
          )}
          <GameButton small onClick={onRelease}>
            Cancel
          </GameButton>
        </div>
      )}
      <h3
        className="mt-1 font-bold"
        title="Devour crystals to convert them into experience for your current crystal."
      >
        Crystal Devour
      </h3>
      <div className="game-card flex items-center gap-1.5 p-1.5">
        <div className="grid grid-cols-3 gap-[3px]">
          {Array.from({ length: FOOD_SLOTS }, (_, i) => (
            <CrystalCell
              key={i}
              crystal={foodCrystals[i]}
              label={foodCrystals[i] ? `Food ${i + 1}` : `Food ${i + 1}: empty`}
              onClick={() => setFoods(foods.filter((id) => id !== foodCrystals[i]?.id))}
            />
          ))}
        </div>
        <CrystalCell
          crystal={target}
          label={target ? 'Devour target' : 'Devour target: empty'}
          onClick={() => setTargetId(null)}
        />
      </div>
      <GameButton
        disabled={busy || !target || foodCrystals.length === 0}
        onClick={() =>
          run(
            '/crystals/devour',
            { targetId: target!.id, foodIds: foodCrystals.map((c) => c.id) },
            (result) => `+${result.xpGained} XP → Lv.${result.targetLevel}`,
            () => setFoods([]),
          )
        }
      >
        Devour
      </GameButton>
      <div className="flex justify-between">
        <GameButton small onClick={onInfo}>
          Info
        </GameButton>
        <GameButton onClick={onGetCrystal}>Get Crystal</GameButton>
      </div>
    </div>
  )
}
