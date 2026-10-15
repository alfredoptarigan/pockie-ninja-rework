import { useBuffs } from './api'
import { plainText } from './text'

/** The equipped title in Reborn's engraved plate lettering, or "No title". */
export function TitleText({ className = 'text-base' }: { className?: string }) {
  const title = useBuffs().data?.titles.find((entry) => entry.active)
  return (
    <span
      className={`font-bold tracking-widest text-[#9ba3b0] [text-shadow:0_1px_0_#2a2d31] ${className}`}
    >
      {title ? plainText(title.nameKey, `Title ${title.titleId}`) : 'No title'}
    </span>
  )
}
