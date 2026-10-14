// Reborn's Card Room (reborn-windows-A-L.md, "Card Room"): 690x500 with tabs. Collection: a
// BigBG4 list of the 10 collections (rarity colour, owned/n) beside the BigBG4 page (name,
// 80x106 cards, grey when not owned, and the "{name} Rewards" box with Claim). My Card Box: the
// owned cards by collection with a search. Our rules (M6 decisions 27-30) stay: one fixed prize
// per complete collection.
// ponytail: Reborn's Trade and Synthesis tabs (card market, 5-card synthesis) and the Roll
// Random prize need card trading and synthesis on the server; our cards have neither.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type {
  CardClaimResult,
  CardCollectionView,
  CardRarity,
  CardRoomView,
} from '../../../../shared/src/schemas/cards'
import collections from '../../generated/reborn-cards.json'
import names from '../../i18n/reborn.json'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { bigBg } from '../bloodlines/panels'
import { itemName } from '../explore'
import { ItemIcon } from '../ItemIcon'
import { Dialog, GameButton, Notice, Tabs } from '../skin'
import { showToast } from '../toast'

export const cardsKey = ['game', 'cards'] as const
/** Card art by card id (client/src/generated/reborn-cards.json). */
const CARD_ART = new Map(collections.flatMap((c) => c.cards.map((card) => [card.id, card.image])))
export const cardArt = (id: number) => CARD_ART.get(id)
const text = (key: string, fallback: string) => (names as Record<string, string>)[key] ?? fallback
/** A card's English name, for the bag notice after opening a card box. */
export const cardName = (card: { cardId: number; nameKey: string }) =>
  text(card.nameKey, `Card ${card.cardId}`)
const collectionName = (c: CardCollectionView) => text(c.nameKey, `Collection ${c.id}`)
/** Reborn's rarity colours. */
const RARITY_COLOURS: Record<CardRarity, string> = {
  GREEN: '#2E8B57',
  BLUE: '#4169E1',
  PURPLE: '#9370DB',
  RED: '#DC143C',
  GOLD: '#DAA520',
}

// M6 items are not in the generated 2011 item names yet; reborn.json has them.
const prizeName = (itemId: string) => text(`lg_reborn_item_${itemId.slice(1)}`, itemName(itemId))
const prizeText = (collection: CardCollectionView) =>
  collection.prize
    .map(({ itemId, count }) => `${count > 1 ? `${count} x ` : ''}${prizeName(itemId)}`)
    .join(', ')

type Tab = 'collection' | 'box'

function CardFace({ id, nameKey, count }: { id: number; nameKey: string; count: number }) {
  return (
    <figure
      title={count ? 'Owned' : 'Not Owned'}
      className={`relative flex h-[106px] w-[80px] flex-col items-center ${count ? '' : 'opacity-50 grayscale'}`}
    >
      <img src={cardArt(id)} alt="" className="h-[90px] w-auto" />
      <figcaption className="w-full truncate text-center text-[10px] leading-[14px]">
        {text(nameKey, `Card ${id}`)}
      </figcaption>
      {count > 1 && (
        <span className="absolute top-0 right-0 rounded-sm bg-black/60 px-[3px] text-[10px] font-bold text-white">
          x{count}
        </span>
      )}
    </figure>
  )
}

export function CardRoomWindow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const [tab, setTab] = useState<Tab>('collection')
  const [page, setPage] = useState(1)
  const cards = useQuery({
    queryKey: cardsKey,
    queryFn: () => api<CardRoomView>('/api/game/cards'),
  })
  const claim = useMutation({
    mutationFn: (id: number) =>
      api<CardClaimResult>(`/api/game/cards/collections/${id}/claim`, { method: 'POST' }),
    onSuccess: (result, id) => {
      const claimed = result.collections.find((c) => c.id === id)
      if (claimed) showToast(`Prize claimed: ${prizeText(claimed)}.`, 'success')
      queryClient.setQueryData(cardsKey, result)
      apply(result)
    },
  })
  const data = cards.data
  const error = cards.error ?? claim.error
  const panelId = 'card-room-panel'
  return (
    <Dialog title="Card Room" onClose={onClose} className="game-window-bare w-[700px]">
      <div className="h-[500px] w-[690px] text-[12px] text-black">
        <Tabs
          label="Card Room"
          panelId={panelId}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'collection', title: 'Collection' },
            { id: 'box', title: 'My Card Box' },
          ]}
        />
        <div
          id={panelId}
          role="tabpanel"
          className="flex h-[470px] w-[690px] gap-[5px] p-[5px]"
          style={bigBg(1)}
        >
          {cards.isPending && <p>Loading cards...</p>}
          {error && !data && <Notice tone="error">{errorMessage(error)}</Notice>}
          {data && tab === 'collection' && (
            <CollectionTab
              data={data}
              page={page}
              onPage={setPage}
              busy={claim.isPending}
              error={claim.error}
              onClaim={(id) => claim.mutate(id)}
            />
          )}
          {data && tab === 'box' && <CardBox data={data} />}
        </div>
      </div>
    </Dialog>
  )
}

function CollectionList({
  data,
  selected,
  heading,
  onSelect,
  all,
}: {
  data: CardRoomView
  selected: number
  heading: string
  onSelect: (id: number) => void
  /** "All Cards" entry (My Card Box) as id 0. */
  all?: boolean
}) {
  const row = 'flex w-full justify-between rounded-[2px] px-2 py-[3px] text-left'
  return (
    <section
      aria-label={heading}
      className="flex h-[460px] w-[200px] shrink-0 flex-col gap-1 p-[10px]"
      style={bigBg(4)}
    >
      <h3 className="font-bold">{heading}</h3>
      <ul aria-label="Collections" className="flex flex-col gap-[3px] overflow-auto">
        {all && (
          <li>
            <button
              type="button"
              aria-pressed={selected === 0}
              onClick={() => onSelect(0)}
              className={`${row} ${selected === 0 ? 'bg-[#e8c478]' : 'hover:bg-white/40'}`}
            >
              All Cards
            </button>
          </li>
        )}
        {data.collections.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={c.id === selected}
              onClick={() => onSelect(c.id)}
              className={`${row} ${c.id === selected ? 'bg-[#e8c478]' : 'hover:bg-white/40'}`}
            >
              <span className="font-bold" style={{ color: RARITY_COLOURS[c.rarity] }}>
                {collectionName(c)}
              </span>
              <span>
                {c.owned}/{c.total}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CollectionTab({
  data,
  page,
  onPage,
  busy,
  error,
  onClaim,
}: {
  data: CardRoomView
  page: number
  onPage: (id: number) => void
  busy: boolean
  error: Error | null
  onClaim: (id: number) => void
}) {
  const collection = data.collections.find((c) => c.id === page) ?? data.collections[0]
  if (!collection) return <p className="m-auto">No collections yet.</p>
  const name = collectionName(collection)
  const owned = data.collections.reduce((sum, c) => sum + c.owned, 0)
  const total = data.collections.reduce((sum, c) => sum + c.total, 0)
  const complete = collection.owned >= collection.total
  return (
    <>
      <CollectionList
        data={data}
        selected={collection.id}
        heading={`Collections ${owned}/${total}`}
        onSelect={onPage}
      />
      <section
        aria-label={name}
        className="flex h-[460px] w-[480px] flex-col gap-[5px] p-[5px]"
        style={bigBg(4)}
      >
        <h3
          className="h-[40px] w-[470px] text-center text-[16px] leading-[40px] font-bold"
          style={{ color: RARITY_COLOURS[collection.rarity] }}
        >
          {name}
        </h3>
        <ul
          aria-label="Cards"
          className="flex h-[280px] w-[470px] flex-wrap content-start justify-center gap-[8px] overflow-auto"
        >
          {collection.cards.map((card) => (
            <li key={card.id}>
              <CardFace id={card.id} nameKey={card.nameKey} count={card.count} />
            </li>
          ))}
        </ul>
        <section
          aria-label={`${name} Rewards`}
          className="relative h-[130px] w-[470px] p-[8px]"
          style={bigBg(3)}
        >
          <h4 className="font-bold">{name} Rewards</h4>
          <p className="mt-1">Fixed Prize</p>
          <ul aria-label="Fixed Prize" className="mt-1 flex gap-2">
            {collection.prize.map(({ itemId, count }) => (
              <li key={itemId} title={`${count} x ${prizeName(itemId)}`}>
                <ItemIcon itemId={itemId} name={prizeName(itemId)} className="size-10">
                  {count > 1 && (
                    <span className="absolute right-[2px] bottom-0 text-[10px] font-bold">
                      x{count}
                    </span>
                  )}
                </ItemIcon>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="absolute bottom-[8px] left-[8px] w-[370px] text-[#a01010]">
              {errorMessage(error)}
            </p>
          )}
          <GameButton
            small
            className="absolute! right-[10px] bottom-[10px] h-[26px] w-[70px]"
            title={complete ? undefined : 'Collect every card of this collection first.'}
            disabled={busy || collection.claimed || !complete}
            onClick={() => onClaim(collection.id)}
          >
            {collection.claimed ? 'Claimed' : 'Claim'}
          </GameButton>
        </section>
      </section>
    </>
  )
}

function CardBox({ data }: { data: CardRoomView }) {
  const [selected, setSelected] = useState(0)
  const [search, setSearch] = useState('')
  const owned = data.collections.flatMap((c) =>
    c.cards.filter((card) => card.count > 0).map((card) => ({ ...card, collection: c.id })),
  )
  const shown = owned.filter(
    (card) =>
      (!selected || card.collection === selected) &&
      text(card.nameKey, `Card ${card.id}`).toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      <CollectionList
        data={data}
        selected={selected}
        heading="Collections"
        onSelect={setSelected}
        all
      />
      <section
        aria-label="My Card Box"
        className="flex h-[460px] w-[480px] flex-col gap-[5px] p-[8px]"
        style={bigBg(4)}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold">
            My Card Box ({shown.length}/{owned.length})
          </h3>
          <input
            type="search"
            aria-label="Search"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="game-card w-[150px] px-1"
          />
        </div>
        {owned.length === 0 ? (
          <p className="m-auto">No cards yet. Open card boxes from your bag to collect cards.</p>
        ) : (
          <ul
            aria-label="My cards"
            className="flex flex-wrap content-start gap-[8px] overflow-auto"
          >
            {shown.map((card) => (
              <li key={card.id}>
                <CardFace id={card.id} nameKey={card.nameKey} count={card.count} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
