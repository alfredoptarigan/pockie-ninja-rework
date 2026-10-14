// Reborn's View Character (`Us`, 333 wide): equipment columns around the pose, the name plate, the
// action bar Add Friend / Duel / PM / Trade / Block. Opened from player names (Social, Player List).
// Our server keeps stats and skills private, so the stats panel shows the public facts only; we
// have no duels or trading, so those two buttons stay disabled.
import { useState, type CSSProperties } from 'react'
import type { WornItem } from '../../../../shared/src/schemas/social'
import { errorMessage } from '../api'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice } from '../skin'
import { outfitName, plainText } from '../text'
import { useBlocked, useFriendAction, usePlayerView } from './api'
import { village } from './PlayerTable'
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
              disabled
              title="Trading is not available yet."
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
          <dl className="game-panel-1 grid grid-cols-2 gap-x-2 gap-y-1 p-[8px] text-[12px]">
            <dt className="font-bold">Name</dt>
            <dd>{player.name}</dd>
            <dt className="font-bold">Level</dt>
            <dd>Level {player.level}</dd>
            <dt className="font-bold">Village</dt>
            <dd>{village(player.nation)}</dd>
            <dt className="font-bold">Status</dt>
            <dd>{data.online ? 'Online' : 'Offline'}</dd>
          </dl>
        </div>
      )}
    </Dialog>
  )
}
