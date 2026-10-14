// An equipment item as the forge and the bag show it: the icon framed in its property-count
// colour with the enhance level, and the tooltip (name, levels, stats, properties, durability,
// set progress) in the original dark tip style.
import type { GearView } from '@pockie/shared'
import { useId, useState, type ReactNode } from 'react'
import { ItemIcon } from '../ItemIcon'
import { plainText } from '../text'
import { borderColor, propText } from './gear'

const LOW_DURABILITY = 0.1
const TOOLTIP =
  'pointer-events-none absolute top-full left-0 z-50 mt-1 w-[190px] rounded-[3px] border-2 border-[#5c5c5c] bg-black/85 px-2 py-1 text-white'

/** The tooltip body; also used as the details panel of the forge windows. */
export function GearDetails({ nameKey, gear }: { nameKey: string; gear: GearView }) {
  const name = plainText(nameKey, 'Unknown item')
  const worn = gear.durability / gear.maxDurability
  return (
    <div className="flex flex-col gap-0.5 text-xs leading-snug">
      <p className="font-bold" style={{ color: borderColor(gear) }}>
        {name}
        {gear.enhanceLevel > 0 && ` +${gear.enhanceLevel}`}
      </p>
      {gear.inscribeLevel > 0 && (
        <p className="text-[#d2a7ff]">Inscription +{gear.inscribeLevel}</p>
      )}
      {gear.baseType === 1 && (
        <p>
          Attack {gear.attack.min} - {gear.attack.max}
        </p>
      )}
      {gear.defense > 0 && <p>Defense {gear.defense}</p>}
      {gear.maxHp > 0 && <p>+{gear.maxHp} Max HP (enhanced)</p>}
      {gear.inscription.map((row) => (
        <p key={row.name} className="text-[#d2a7ff]">
          {propText(row.name, row.value)} (inscription)
        </p>
      ))}
      {gear.appraised ? (
        gear.props.map((prop, i) => (
          <p key={`${prop.propId}-${i}`} className="text-[#00aeff]">
            {propText(prop.name, prop.value)}
          </p>
        ))
      ) : (
        <p className="text-[#ff8a00]">Not appraised ({gear.identifyCount} hidden properties)</p>
      )}
      <p className={gear.durability <= 0 || worn < LOW_DURABILITY ? 'text-[#ff6565]' : ''}>
        Durability {gear.durability} / {gear.maxDurability}
        {gear.durability <= 0 && ' (broken: no stats)'}
      </p>
      {gear.set && (
        <div className="mt-1">
          <p className="text-[#9dff6a]">
            Set: {gear.set.worn} / {gear.set.pieces} worn
          </p>
          {gear.set.bonuses.map((bonus) => (
            <p
              key={`${bonus.pieces}-${bonus.name}`}
              className={gear.set!.worn >= bonus.pieces ? 'text-[#9dff6a]' : 'text-[#8e8e8e]'}
            >
              ({bonus.pieces}) {propText(bonus.name, bonus.value)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The item icon with its border colour and enhance level; hovering or focusing the cell shows
 * the tooltip: the gear details, or only the name for other items and when `brief` (the bag's
 * "Hide" box). `children` (usually the cell's button) go on top.
 */
export function GearIcon({
  itemId,
  nameKey,
  gear,
  brief = false,
  className = 'size-[51px]',
  children,
}: {
  itemId: string
  nameKey: string
  gear?: GearView
  brief?: boolean
  className?: string
  children?: ReactNode
}) {
  const [shown, setShown] = useState(false)
  const id = useId()
  const detailed = gear && !brief
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
      aria-describedby={detailed && shown ? id : undefined}
    >
      <ItemIcon
        itemId={itemId}
        name={plainText(nameKey, 'Unknown item')}
        className={`${className} [&_img]:size-full [&_img]:object-contain`}
      >
        {gear && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[2px] border-2"
            style={{ borderColor: borderColor(gear) }}
          />
        )}
        {gear && gear.enhanceLevel > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-px right-[3px] text-[11px] font-bold text-[#ffc600] [text-shadow:var(--shadow-game-text)]"
          >
            +{gear.enhanceLevel}
          </span>
        )}
        {children}
      </ItemIcon>
      {detailed && shown && (
        <div id={id} role="tooltip" className={TOOLTIP}>
          <GearDetails nameKey={nameKey} gear={gear} />
        </div>
      )}
      {/* The name alone: the cell's accessible name already says it. */}
      {!detailed && shown && (
        <div aria-hidden="true" className={`${TOOLTIP} w-max max-w-[190px] text-xs font-bold`}>
          {plainText(nameKey, 'Unknown item')}
        </div>
      )}
    </span>
  )
}
