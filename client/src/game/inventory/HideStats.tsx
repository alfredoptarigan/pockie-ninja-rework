// Reborn's Inventory "Hide" checkbox (setCharacterPrivacy {hideStats}): other players' View
// Character then shows no stats or skills. Its state comes from the character.
import type { Character } from '@pockie/shared'
import { useSetCharacterPrivacy } from '../api'
import { attempt } from './requests'

export function HideStats({ character }: { character?: Character | null }) {
  const privacy = useSetCharacterPrivacy()
  return (
    <label
      title="Click to hide detailed stats"
      className="absolute top-[230px] left-[183px] flex items-center gap-2 text-[13px] text-[#ffd27a]"
    >
      <input
        type="checkbox"
        // Shows the click at once; a refused request falls back to the character's state.
        checked={privacy.isPending ? privacy.variables : (character?.hideStats ?? false)}
        disabled={!character || privacy.isPending}
        onChange={(event) => void attempt(() => privacy.mutateAsync(event.target.checked))}
        className="grid size-5 appearance-none place-items-center border border-[#5a5a5a] bg-linear-to-b from-[#2a2a2a] to-[#1a1a1a] checked:after:text-[14px] checked:after:leading-none checked:after:font-bold checked:after:text-[#ffd27a] checked:after:content-['✓'] disabled:opacity-60"
      />
      Hide
    </label>
  )
}
