import type { Character } from '@pockie/shared'
import { Bar } from './skin'
import { outfitName, plainText } from './text'
import { expToNext, sceneNameKey } from './world'

const VILLAGE_SCENES = [111, 121, 151, 141, 131]

export function CharacterPanel({ character }: { character: Character }) {
  const next = expToNext(character.level)
  const village = plainText(sceneNameKey(VILLAGE_SCENES[character.nation]!), 'Village')
  return (
    <section
      aria-label="Character"
      className="flex flex-col gap-1.5 rounded-tr-[48px] rounded-br-lg border border-[#5d6163] bg-[linear-gradient(110deg,#2c2f31_0%,#141617_55%,#3a3d3f_100%)] p-3 font-game shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-white [text-shadow:var(--shadow-game-text)]">
          {character.name}
        </h2>
        <span className="rounded-full border border-[#6b6f72] bg-[#2b2e30] px-2.5 text-sm text-white">
          Lv. {character.level}
        </span>
        <span className="text-xs text-trim-soft">
          {outfitName(character.clothing)} · {village}
        </span>
      </div>
      <Bar label="HP" value={character.hp} max={character.maxHp} kind="hp" />
      <Bar label="MP" value={character.mp} max={character.maxMp} kind="mp" />
      {next === undefined ? (
        <p className="text-xs text-trim-soft">EXP {character.exp} (max level)</p>
      ) : (
        <Bar label="EXP" value={character.exp} max={next} kind="exp" />
      )}
      <dl className="mt-1 flex flex-wrap gap-2 text-xs">
        {(
          [
            ['Stone', character.stone, 'game-currency-stone pl-7'],
            ['Gold', character.gold, 'game-currency-gold pl-7'],
            ['Coupons', character.giftCoupon, 'game-currency-coupon pl-7'],
            ['Honor', character.honor, 'game-hud-inset rounded-full pl-2.5'],
          ] as const
        ).map(([label, value, box]) => (
          <div
            key={label}
            className={`flex min-h-6 min-w-28 items-center justify-between gap-2 pr-2 ${box}`}
          >
            <dt className="text-[#c9c9c9]">{label}</dt>
            <dd className="font-bold text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
