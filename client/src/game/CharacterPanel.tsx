import type { Character } from '@pockie/shared'
import { Bar } from './skin'
import { outfitName, plainText } from './text'
import { expToNext, sceneNameKey } from './world'

const VILLAGE_SCENES = [111, 121, 151, 141, 131]

export function CharacterPanel({ character }: { character: Character }) {
  const next = expToNext(character.level)
  const village = plainText(sceneNameKey(VILLAGE_SCENES[character.nation]!), 'Village')
  return (
    <section aria-label="Character" className="game-frame flex flex-col gap-1.5 p-3 font-game">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-base font-bold text-trim-soft">{character.name}</h2>
        <span className="text-sm font-bold text-white">Lv. {character.level}</span>
        <span className="text-xs text-parchment">
          {outfitName(character.clothing)} · {village}
        </span>
      </div>
      <Bar label="HP" value={character.hp} max={character.maxHp} color="var(--color-bar-hp)" />
      <Bar label="MP" value={character.mp} max={character.maxMp} color="var(--color-bar-mp)" />
      {next === undefined ? (
        <p className="text-xs text-trim-soft">EXP {character.exp} (max level)</p>
      ) : (
        <Bar label="EXP" value={character.exp} max={next} color="var(--color-bar-exp)" />
      )}
      <dl className="grid grid-cols-4 gap-1 text-center text-xs text-parchment">
        {[
          ['Stone', character.stone],
          ['Gold', character.gold],
          ['Coupons', character.giftCoupon],
          ['Honor', character.honor],
        ].map(([label, value]) => (
          <div key={label} className="rounded bg-wood-deep px-1 py-0.5">
            <dt className="text-trim-soft">{label}</dt>
            <dd className="font-bold text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
