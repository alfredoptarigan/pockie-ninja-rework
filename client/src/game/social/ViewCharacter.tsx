// Reborn's View Character (`Us`, 333 wide): equipment columns around the pose, the name plate, the
// action bar Add Friend / Duel / PM / Trade / Block, the Stats window's rows and the active skill
// preset. Opened from player names (Social, Player List). A ninja who ticks the Inventory's Hide
// sends no stats or skills (the server enforces it): Reborn then shows every stat as 0. Trade sends
// a trade request (modules/trade); we have no duels, so Duel stays disabled.
import { SKILL_SLOTS_PER_TREE, type CharacterStats, type SkillSlot } from '@pockie/shared'
import { useState, type CSSProperties } from 'react'
import type { WornItem } from '../../../../shared/src/schemas/social'
import { errorMessage } from '../api'
import { Divider, StatGrid, StatGroups, statGroups, type StatRow } from '../CharacterWindow'
import { EQUIPPED_CELLS, SkillCell, SLOT_STEP } from '../SkillsWindow'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import { useTradeAction } from '../trade'
import { outfitName, plainText } from '../text'
import { useBlocked, useFriendAction, usePlayerView } from './api'
import { requestWhisper } from './requests'

/** Slot boxes [left, top, size] of Reborn's columns: left at x 0, right at x 270. */
const SLOTS = [
  { slot: 'Weapon', label: 'Weapon', at: [4, 61, 55, 83] },
  { slot: 'Glove', label: 'Gloves', at: [4, 146, 55, 55] },
  { slot: 'Ring', label: 'Ring', at: [270, 3, 28, 28] },
  { slot: 'Amulet', label: 'Amulet', at: [301, 3, 28, 28] },
  { slot: 'Hat', label: 'Hat', at: [274, 32, 55, 55] },
  { slot: 'Cloth', label: 'Armour', at: [274, 89, 55, 55] },
  { slot: 'Girdle', label: 'Belt', at: [274, 146, 55, 55] },
  { slot: 'Shoes', label: 'Shoes', at: [274, 203, 55, 55] },
] as const

const box = ([left, top, width, height]: readonly number[]): CSSProperties => ({
  left,
  top,
  width,
  height,
})

/** Statless stand-in for a hidden ninja; every value is then shown as 0. */
const NO_STATS = {} as CharacterStats
const zeroed = (groups: StatRow[][]): StatRow[][] =>
  groups.map((rows) =>
    rows.map((row) => row.map((cell) => cell && { label: cell.label, value: 0 }) as StatRow),
  )

function StatsPanel({
  name,
  level,
  stats,
}: {
  name: string
  level: number
  stats?: CharacterStats
}) {
  const groups = stats
    ? statGroups(stats, { maxHp: stats.maxHp, maxMp: stats.maxMp })
    : zeroed(statGroups(NO_STATS, { maxHp: 0, maxMp: 0 }))
  return (
    <section aria-label="Stats" className="game-panel-1 h-[290px] w-[332px] pt-1.5 text-black">
      <StatGrid
        rows={[
          [
            { label: 'Name', value: name },
            { label: 'Level', value: level },
          ],
        ]}
      />
      <Divider />
      <StatGroups groups={groups} />
      <p className="mt-0.5 pl-[5px] text-[11px] font-bold">
        Hover over stats to get detailed information.
      </p>
    </section>
  )
}

/** Reborn's skills strip: the six slots of the active preset, then the locked cells. */
function SkillsStrip({ skills = [] }: { skills?: SkillSlot[] }) {
  return (
    <section aria-label="Skills" className="game-skill-column relative h-[50px] w-[332px]">
      {Array.from({ length: EQUIPPED_CELLS }, (_, cell) => {
        const left = 6 + cell * SLOT_STEP
        const slot = skills[cell]
        if (cell >= SKILL_SLOTS_PER_TREE)
          return (
            <span
              key={cell}
              role="img"
              aria-label="Locked slot"
              className="game-skill-lock absolute top-[3px] size-[27px]"
              style={{ left }}
            />
          )
        return slot?.skillId ? (
          <SkillCell key={cell} id={slot.skillId} left={left} learned={slot.level} />
        ) : (
          <span
            key={cell}
            role="img"
            aria-label={`Slot ${cell + 1}: empty`}
            className="game-skill-cell absolute top-[4px] size-[26px]"
            style={{ left }}
          />
        )
      })}
    </section>
  )
}

function Slot({ label, worn, at }: { label: string; worn?: WornItem; at: readonly number[] }) {
  const name = worn && plainText(worn.nameKey, worn.itemId)
  const title = worn
    ? `${label}: ${name}${worn.enhanceLevel ? ` +${worn.enhanceLevel}` : ''}`
    : label
  return (
    <div className="absolute" style={box(at)} title={title}>
      {worn ? (
        <ItemIcon itemId={worn.itemId} name={title} className="size-full" />
      ) : (
        <span aria-label={`${label}: empty`} role="img" className="game-slot block size-full" />
      )}
    </div>
  )
}

export function ViewCharacter({
  characterId,
  selfId,
  onClose,
  onWhisper,
}: {
  characterId: string
  selfId: string
  onClose: () => void
  /** After PM prefilled the chat: close whatever covers the chat box. */
  onWhisper: () => void
}) {
  const view = usePlayerView(characterId)
  const blocked = useBlocked()
  const action = useFriendAction()
  const trade = useTradeAction()
  const [done, setDone] = useState<string | null>(null)
  const run = (path: string, body: object, message: string) =>
    action.mutate({ path, body }, { onSuccess: () => setDone(message) })
  const self = characterId === selfId
  const isBlocked = blocked.data?.blocked.some((p) => p.characterId === characterId) ?? false
  const data = view.data
  const player = data?.player

  const block = () => {
    if (!player) return
    const body = { characterId: player.characterId }
    if (isBlocked) return run('blocks/remove', body, `${player.name} is unblocked.`)
    if (window.confirm(`Block ${player.name}? They will be removed from your friends.`))
      run('blocks/add', body, `${player.name} is blocked.`)
  }

  return (
    <Dialog title="View Character" onClose={onClose} className="w-[357px]">
      {view.isError && <Notice tone="error">{errorMessage(view.error)}</Notice>}
      {player && data && (
        <div className="flex flex-col gap-[4px] text-black">
          <div className="relative h-[262px] w-[333px]">
            <div className="game-equip-column absolute top-0 left-0 h-[262px] w-[63px]" />
            <div className="game-equip-column absolute top-0 left-[270px] h-[262px] w-[63px]" />
            <div className="game-equip-backdrop absolute top-[43px] left-[67px] h-[218px] w-[199px] overflow-hidden">
              <img
                src={`/assets/reborn/poses/${player.clothing}.webp`}
                alt=""
                className="absolute bottom-0 left-1/2 h-[208px] w-[124px] -translate-x-1/2 object-contain"
              />
            </div>
            <p className="game-title-plate absolute top-[3px] left-[85px] flex h-[36px] w-[164px] items-center justify-center truncate font-bold text-white">
              {player.name}
            </p>
            <div
              className="absolute"
              style={box([4, 4, 55, 55])}
              title={outfitName(player.clothing)}
            >
              <img
                src={`/assets/reborn/icons/items/avatars/${player.clothing}.webp`}
                alt={`Outfit: ${outfitName(player.clothing)}`}
                className="game-slot size-full object-contain p-1"
              />
            </div>
            {SLOTS.map(({ slot, label, at }) => (
              <Slot
                key={slot}
                label={label}
                at={at}
                worn={data.equipped.find((item) => item.slot === slot)}
              />
            ))}
            <span
              role="img"
              aria-label="Pet: empty"
              className="game-slot absolute block"
              style={box([4, 203, 55, 55])}
            />
            {data.stats && (
              <p
                title={String(data.stats.battlePower)}
                className="pointer-events-none absolute top-[232px] left-[67px] w-[199px] bg-linear-to-b from-[#ffee00] via-[#ff9500] to-[#ff5500] bg-clip-text text-center font-[KOMIKAK,Arial] text-[16px] leading-[18px] font-black text-transparent [-webkit-text-stroke:0.5px_#000]"
              >
                BP: {data.stats.battlePower.toLocaleString('en-US')}
              </p>
            )}
          </div>
          <div className="game-panel-small flex h-[32px] w-[332px] items-center justify-between px-[5px]">
            <GameButton
              disabled={self}
              onClick={() => run('friends/add', { name: player.name }, 'Friend request sent!')}
              className="h-[28px] w-[62px] min-w-0! px-0! text-[10px]"
            >
              Add Friend
            </GameButton>
            <GameButton
              disabled
              title="Duels are not available yet."
              className="h-[28px] w-[62px] min-w-0! px-0!"
            >
              Duel
            </GameButton>
            <GameButton
              disabled={self}
              onClick={() => {
                requestWhisper(player.name)
                onWhisper()
              }}
              className="h-[28px] w-[62px] min-w-0! px-0!"
            >
              PM
            </GameButton>
            <GameButton
              disabled={self || trade.isPending}
              onClick={() =>
                trade.mutate(
                  { path: 'request', body: { characterId: player.characterId } },
                  { onError: (error) => showToast(errorMessage(error), 'failure') },
                )
              }
              className="h-[28px] w-[62px] min-w-0! px-0!"
            >
              Trade
            </GameButton>
            <GameButton
              disabled={self}
              onClick={block}
              className="h-[28px] w-[62px] min-w-0! px-0!"
            >
              {isBlocked ? 'Unblock' : 'Block'}
            </GameButton>
          </div>
          {action.isError && <Notice tone="error">{errorMessage(action.error)}</Notice>}
          {done && !action.isError && <Notice>{done}</Notice>}
          <StatsPanel name={player.name} level={player.level} stats={data.stats} />
          <SkillsStrip skills={data.skills} />
        </div>
      )}
    </Dialog>
  )
}
