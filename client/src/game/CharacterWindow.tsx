import type { Character } from '@pockie/shared'
import { useOutfitPortrait } from './art'
import { Bar, Dialog } from './skin'
import { outfitName, plainText } from './text'
import { expToNext, sceneNameKey, villageOf } from './world'

/** Character stats window (menu bar "Character"). */
export function CharacterWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const portrait = useOutfitPortrait(character.clothing)
  const next = expToNext(character.level)
  const rows: [string, string | number][] = [
    ['Name', character.name],
    ['Level', character.level],
    ['Village', plainText(sceneNameKey(villageOf(character.nation)), 'Village')],
    ['Outfit', outfitName(character.clothing)],
    ['HP', `${character.hp} / ${character.maxHp}`],
    ['Chakra', `${character.mp} / ${character.maxMp}`],
    ['Stone', character.stone],
    ['Gold', character.gold],
    ['Coupons', character.giftCoupon],
    ['Honor', character.honor],
  ]
  return (
    <Dialog title="Stats" onClose={onClose} className="w-[26rem]">
      <div className="flex gap-3">
        <div className="game-slot grid size-24 shrink-0 place-items-center overflow-hidden">
          {portrait && <img src={portrait} alt="" className="size-full object-cover" />}
        </div>
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-right font-bold">{label}</dt>
              <dd className="game-card px-2 text-center">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-3 rounded bg-[#3a3d40] px-2 py-1">
        {next === undefined ? (
          <p className="text-xs text-white">EXP {character.exp} (max level)</p>
        ) : (
          <Bar label="EXP" value={character.exp} max={next} kind="exp" />
        )}
      </div>
    </Dialog>
  )
}
