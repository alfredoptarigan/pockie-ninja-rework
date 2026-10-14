// Tailed Beast window (M5 task 13, decision 27): today's two beasts and their shared HP, tickets,
// fights, fight boxes, the Kage pick, the Essence shop and the weekly leaderboard.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  TailedBeastFightResult,
  TailedBeastPool,
  TailedBeastResult,
  TailedBeastView,
} from '../../../../shared/src/schemas/tailed-beast'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { itemName as gameItemName } from '../explore'
import { GateFight } from '../gates/GateFight'
import { ItemIcon } from '../ItemIcon'
import { Bar, Dialog, GameButton, Notice, Tabs } from '../skin'
import type { Replay } from '../types'

export const tailedBeastKey = ['game', 'tailedBeast'] as const
const MODES = ['Normal', 'Hard', 'Rampage']
const VILLAGES = ['Fire', 'Water', 'Earth', 'Wind', 'Lightning']
/** Reborn art (client/src/generated/reborn-assets.json, category "event"). */
export const beastAtlas = (beast: number) => `/assets/reborn/scenes/tailedBeast/beast-${beast}`

/** Names the 2011 item slice lacks or names differently (glossary defaults, decision 27). */
const ITEM_NAMES: Record<string, string> = {
  i100004: 'Seal Breaker',
  i161007: 'Recast Talisman',
  i150117: 'Level 10 Stone Bag',
  i159140: 'Kage Title',
  i500001: 'Tailed Beast Reward Box A',
  i500002: 'Tailed Beast Reward Box B',
  i500003: 'Tailed Beast Reward Box C',
}
export const itemName = (itemId: string) => ITEM_NAMES[itemId] ?? gameItemName(itemId)
const beastName = (nameKey: string, id: number) =>
  (names as Record<string, string>)[nameKey] ?? `Beast ${id}`
const number = (value: number) => value.toLocaleString('en-US')

type Tab = 'beasts' | 'rewards' | 'shop' | 'ranking'
type Fight = TailedBeastFightResult<Replay>
type Frame = { x: number; y: number; w: number; h: number }

/** Frame "1" of a beast's atlas, cropped with CSS; nothing until the atlas data has loaded. */
function BeastPortrait({ beast, name }: { beast: number; name: string }) {
  const atlas = useQuery({
    queryKey: ['asset', 'tailedBeast', beast],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(`${beastAtlas(beast)}.json`)
      const data = (await response.json()) as {
        textures: { size: { w: number; h: number }; frames: { filename: string; frame: Frame }[] }[]
      }
      const texture = data.textures[0]!
      return { size: texture.size, frame: texture.frames.find((f) => f.filename === '1')!.frame }
    },
  })
  if (!atlas.data) return <span className="size-24" />
  const { size, frame } = atlas.data
  const scale = Math.min(1, 96 / Math.max(frame.w, frame.h))
  return (
    <span
      role="img"
      aria-label={name}
      className="block shrink-0"
      style={{
        width: frame.w * scale,
        height: frame.h * scale,
        backgroundImage: `url(${beastAtlas(beast)}.webp)`,
        backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
        backgroundSize: `${size.w * scale}px ${size.h * scale}px`,
      }}
    />
  )
}

export function TailedBeastWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [tab, setTab] = useState<Tab>('beasts')
  const [message, setMessage] = useState('')
  const [replay, setReplay] = useState<Fight | null>(null)
  const view = useQuery({
    queryKey: tailedBeastKey,
    queryFn: () => api<TailedBeastView>('/api/game/tailed-beast'),
  })
  const done = (result: TailedBeastResult, text: string) => {
    queryClient.setQueryData(tailedBeastKey, result.tailedBeast)
    setMessage(text)
  }
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object; text: string }) =>
      api<TailedBeastResult>(`/api/game/tailed-beast/${path}`, { method: 'POST', body }),
    onSuccess: (result, { text }) => {
      done(result, text)
      apply(result)
    },
  })
  const fight = useMutation({
    mutationFn: (body: { beast: number; mode: number }) =>
      api<Fight>('/api/game/tailed-beast/fight', { method: 'POST', body }),
    onSuccess: (result) => {
      setMessage('')
      setReplay(result)
    },
  })

  if (replay) {
    return (
      <GateFight
        result={replay}
        character={character}
        onDone={() => {
          done(
            replay,
            `You dealt ${number(replay.damage)} damage and earned ${number(replay.honor)} Honor` +
              (replay.killed ? '. You dealt the final blow!' : '.'),
          )
          setReplay(null)
        }}
      />
    )
  }
  const data = view.data
  const busy = action.isPending || fight.isPending
  const ticketsLeft = data ? data.tickets.perDay - data.tickets.used : 0
  const myKage = data?.kages.find((k) => k.isMe)
  const error = view.error ?? action.error ?? fight.error

  const poolRow = (beast: number, pool: TailedBeastPool) => (
    <li key={pool.mode} className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">
          {MODES[pool.mode]} (level {pool.level})
        </span>
        <GameButton
          small
          disabled={busy || pool.hpLeft === 0 || pool.ticketCost > ticketsLeft}
          onClick={() => fight.mutate({ beast, mode: pool.mode })}
        >
          Fight ({pool.ticketCost} {pool.ticketCost === 1 ? 'ticket' : 'tickets'})
        </GameButton>
      </div>
      <Bar label="HP" kind="hp" value={pool.hpLeft} max={pool.maxHp} />
      <span className="text-[11px]">
        {pool.hpLeft === 0
          ? `Defeated${pool.killedBy ? ` by ${pool.killedBy}` : ''}.`
          : `${number(pool.hpLeft)} / ${number(pool.maxHp)} HP`}
      </span>
    </li>
  )

  return (
    <Dialog title="Tailed Beast" onClose={onClose} className="game-window-bare w-[600px]">
      <div className="game-inset flex flex-col gap-2 p-[10px] font-game text-[12px] text-black">
        {view.isPending && <p>Loading the Tailed Beast event...</p>}
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        {data && (
          <>
            <p>
              Tickets left today: {ticketsLeft}/{data.tickets.perDay}. Honor:{' '}
              {number(data.me.honor)}. Essence: {number(data.me.essence)}. Fights this week:{' '}
              {data.me.fights}. Village: {VILLAGES[data.me.village]}.
            </p>
            <Tabs
              label="Tailed Beast"
              panelId="tailed-beast-panel"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'beasts', title: 'Beasts' },
                { id: 'rewards', title: 'Rewards' },
                { id: 'shop', title: 'Essence Shop' },
                { id: 'ranking', title: 'Ranking' },
              ]}
            />
            <div id="tailed-beast-panel" role="tabpanel" className="flex flex-col gap-2">
              {tab === 'beasts' &&
                data.beasts.map((beast) => {
                  const name = beastName(beast.nameKey, beast.id)
                  return (
                    <section key={beast.id} aria-label={name} className="game-card flex gap-3 p-2">
                      <BeastPortrait beast={beast.id} name={name} />
                      <div className="flex flex-1 flex-col gap-1">
                        <h3 className="font-bold">{name}</h3>
                        <ul className="flex flex-col gap-1">
                          {beast.pools.map((pool) => poolRow(beast.id, pool))}
                        </ul>
                      </div>
                    </section>
                  )
                })}
              {tab === 'rewards' && (
                <>
                  <section aria-label="Fight boxes" className="game-card flex flex-col gap-1 p-2">
                    <h3 className="font-bold">Fight boxes</h3>
                    {data.boxes.map((box) => (
                      <div key={box.fights} className="flex items-center gap-2">
                        <ItemIcon
                          itemId={box.itemId}
                          name={itemName(box.itemId)}
                          className="size-7"
                        />
                        <span className="flex-1">
                          {itemName(box.itemId)}: {box.fights} fights
                        </span>
                        <GameButton
                          small
                          disabled={busy || !box.ready}
                          onClick={() =>
                            action.mutate({
                              path: 'box',
                              body: { fights: box.fights },
                              text: `You received ${itemName(box.itemId)}.`,
                            })
                          }
                        >
                          {box.claimed ? 'Opened' : 'Open'}
                        </GameButton>
                      </div>
                    ))}
                  </section>
                  <section aria-label="Kages" className="game-card flex flex-col gap-1 p-2">
                    <h3 className="font-bold">Last week&apos;s Kages</h3>
                    {data.kages.length === 0 && <p>No village had a Kage last week.</p>}
                    <ul>
                      {data.kages.map((kage) => (
                        <li key={kage.village}>
                          {VILLAGES[kage.village]}: {kage.name}
                          {kage.claimedItemId ? ` (picked ${itemName(kage.claimedItemId)})` : ''}
                        </li>
                      ))}
                    </ul>
                    {myKage && !myKage.claimedItemId && (
                      <>
                        <p>You are the Kage of {VILLAGES[myKage.village]}. Pick one reward:</p>
                        <div className="flex flex-wrap gap-2">
                          {data.kageChoices.map((itemId) => (
                            <GameButton
                              key={itemId}
                              small
                              disabled={busy}
                              onClick={() =>
                                action.mutate({
                                  path: 'kage',
                                  body: { itemId },
                                  text: `You received ${itemName(itemId)}.`,
                                })
                              }
                            >
                              {itemName(itemId)}
                            </GameButton>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}
              {tab === 'shop' && (
                <ul aria-label="Essence shop" className="grid grid-cols-2 gap-2">
                  {data.shop.map((offer) => (
                    <li key={offer.itemId} className="game-card flex items-center gap-2 p-1">
                      <ItemIcon
                        itemId={offer.itemId}
                        name={itemName(offer.itemId)}
                        className="size-8"
                      />
                      <span className="flex-1">
                        {itemName(offer.itemId)}
                        <br />
                        {offer.available ? `${offer.essence} Essence` : 'Coming soon'}
                      </span>
                      <GameButton
                        small
                        disabled={busy || !offer.available || data.me.essence < offer.essence}
                        onClick={() =>
                          action.mutate({
                            path: 'shop',
                            body: { itemId: offer.itemId, count: 1 },
                            text: `You bought ${itemName(offer.itemId)}.`,
                          })
                        }
                      >
                        Buy
                      </GameButton>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'ranking' && (
                <>
                  <table className="w-full text-left">
                    <caption className="text-left font-bold">Top 10 by Honor this week</caption>
                    <thead>
                      <tr>
                        <th>Place</th>
                        <th>Name</th>
                        <th>Level</th>
                        <th>Village</th>
                        <th>Honor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((row) => (
                        <tr key={row.place}>
                          <td>{row.place}</td>
                          <td>{row.name}</td>
                          <td>{row.level}</td>
                          <td>{VILLAGES[row.village]}</td>
                          <td>{number(row.honor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    Village Honor:{' '}
                    {data.villages
                      .map((v) => `${VILLAGES[v.village]} ${number(v.honor)}`)
                      .join(', ')}
                    .
                  </p>
                </>
              )}
            </div>
            <p>The event resets every Monday at 00:00 UTC.</p>
            {message && <Notice>{message}</Notice>}
          </>
        )}
      </div>
      <div className="mt-[10px] flex justify-end">
        <GameButton onClick={onClose}>Close</GameButton>
      </div>
    </Dialog>
  )
}
