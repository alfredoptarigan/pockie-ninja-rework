import type { Character, CharacterStats } from '@pockie/shared'
import { errorMessage, useBuyPouches, useCharacterStats } from './api'
import { useOutfitPortrait } from './art'
import { Bar, Dialog, GameButton, Notice } from './skin'
import { outfitName, plainText } from './text'
import { expToNext, sceneNameKey, villageOf } from './world'

/** Points per displayed attribute point (RoleInitProperty.ini stores attributes x100). */
const ATTRIBUTE_SCALE = 100
/** Damage reduction from defence: def / (def + 1354) (Damage.java). */
const DEFENSE_CURVE = 1354

/** Combat rows as the original role window shows them (UI_RoleInfoFrame.as). */
export function statRows(stats: CharacterStats): [string, string | number][] {
  const attribute = (value: number) => Math.trunc(value / ATTRIBUTE_SCALE)
  const minAttack = Math.min(stats.minAttack, stats.maxAttack)
  const reduction = Math.trunc((stats.defense * 100) / (stats.defense + DEFENSE_CURVE))
  return [
    ['Strength', attribute(stats.strength)],
    ['Agility', attribute(stats.agility)],
    ['Stamina', attribute(stats.stamina)],
    ['Attack', `${minAttack} - ${stats.maxAttack}`],
    ['Defense', `${stats.defense} (-${reduction}% damage)`],
    ['Speed', (1000 / stats.atkTime).toFixed(2)],
    ['Dodge', stats.dodge],
    ['Hit', stats.hit],
    ['Critical', stats.crit],
    ['Block', stats.parry],
    ['Pierce', stats.pierce],
    ['Toughness', stats.tough],
  ]
}

/** OnCustomBuy: 1 Gold or Gift Coupon per 1000 pouch points. */
const POUCH_POINTS_PER_COIN = 1000

/** Buys both pouches full (UI_RoleUse.as "Full" choice) with Gold or Gift Coupons. */
function PouchRefill({ character }: { character: Character }) {
  const buy = useBuyPouches()
  const cost = [character.hpPouch, character.mpPouch].reduce(
    (sum, pouch) => sum + Math.ceil((character.pouchMax - pouch) / POUCH_POINTS_PER_COIN),
    0,
  )
  const refill = (currency: 'gold' | 'giftCoupon') =>
    buy.mutate({ currency, hp: 'full', mp: 'full' })
  return (
    <section aria-label="Refill pouches" className="game-card mt-3 flex flex-col gap-1 p-2 text-xs">
      {buy.isError && <Notice tone="error">{errorMessage(buy.error)}</Notice>}
      {cost === 0 ? (
        <p>Your pouches are full.</p>
      ) : (
        <>
          <p>Refill both pouches for {cost} Gold or {cost} Gift Coupons.</p>
          <div className="flex gap-2">
            <GameButton
              small
              disabled={buy.isPending || character.gold < cost}
              onClick={() => refill('gold')}
            >
              Refill with Gold
            </GameButton>
            <GameButton
              small
              disabled={buy.isPending || character.giftCoupon < cost}
              onClick={() => refill('giftCoupon')}
            >
              Refill with Coupons
            </GameButton>
          </div>
        </>
      )}
    </section>
  )
}

/** Character stats window (menu bar "Character"). */
export function CharacterWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const portrait = useOutfitPortrait(character.clothing)
  const stats = useCharacterStats()
  const next = expToNext(character.level)
  const rows: [string, string | number][] = [
    ['Name', character.name],
    ['Level', character.level],
    ['Village', plainText(sceneNameKey(villageOf(character.nation)), 'Village')],
    ['Outfit', outfitName(character.clothing)],
    ['HP', `${character.hp} / ${character.maxHp}`],
    ['Chakra', `${character.mp} / ${character.maxMp}`],
    ['HP pouch', `${character.hpPouch} / ${character.pouchMax}`],
    ['MP pouch', `${character.mpPouch} / ${character.pouchMax}`],
    ['Stone', character.stone],
    ['Gold', character.gold],
    ['Coupons', character.giftCoupon],
    ['Honor', character.honor],
  ]
  return (
    <Dialog title="Stats" onClose={onClose} className="w-[30rem]">
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
      <PouchRefill character={character} />
      <section aria-label="Combat stats" className="mt-3">
        {stats.isPending && <p className="text-xs">Loading stats...</p>}
        {stats.isError && <p className="text-xs">We could not load your stats.</p>}
        {stats.data && (
          <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-1 text-xs">
            {statRows(stats.data).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-right font-bold">{label}</dt>
                <dd className="game-card px-2 text-center">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
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
