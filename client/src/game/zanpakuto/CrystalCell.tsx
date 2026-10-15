// Reborn's crystal cell `B` (chunk 984 #9544): a 39x38 box with the crystal icon and a star2 /
// star3 overlay for its 2nd / 3rd stat, inside a 45x44 slot frame. Hover shows the crystal lines.
import type { MouseEvent } from 'react'
import type { ZanpakutoCrystal } from '../../../../shared/src/schemas/zanpakuto'
import { crystalIcon, crystalTooltip, uiArt } from './shared'

const FRAME = 'game-inset flex size-[45px] items-center justify-center p-[3px]'

export function CrystalPicture({ crystal }: { crystal: ZanpakutoCrystal }) {
  const stars = crystal.stats.length
  return (
    <span className="relative block size-[39px]">
      <img
        src={crystalIcon(crystal)}
        alt=""
        className="absolute inset-[2px] size-[34px] object-contain"
      />
      {stars > 1 && (
        <img src={uiArt(`star${stars}`)} alt="" className="absolute top-0 left-0 h-[16px] w-auto" />
      )}
    </span>
  )
}

/** A slot frame with its crystal; `onOpen` opens the crystal's menu. */
export function CrystalCell({
  label,
  crystal,
  onOpen,
  readOnly = false,
}: {
  label: string
  crystal: ZanpakutoCrystal | null
  onOpen?: (event: MouseEvent<HTMLButtonElement>) => void
  readOnly?: boolean
}) {
  if (readOnly)
    return (
      <span className={FRAME} title={crystal ? crystalTooltip(crystal) : undefined}>
        {crystal && <CrystalPicture crystal={crystal} />}
      </span>
    )
  return (
    <span className={FRAME}>
      <button
        type="button"
        aria-label={label}
        title={crystal ? crystalTooltip(crystal) : undefined}
        disabled={!crystal}
        onClick={onOpen}
        onContextMenu={onOpen}
        className="size-[39px] cursor-pointer disabled:cursor-default"
      >
        {crystal && <CrystalPicture crystal={crystal} />}
      </button>
    </span>
  )
}

/** A locked slot: Reborn's lock art (a button when it can be bought). */
export function LockedCell({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <span className={FRAME}>
      <button
        type="button"
        aria-label={label}
        disabled={!onClick}
        onClick={onClick}
        className="size-[39px] cursor-pointer disabled:cursor-not-allowed"
      >
        <img src={uiArt('lock')} alt="" className="mx-auto mt-[2px] size-[35px] object-contain" />
      </button>
    </span>
  )
}
