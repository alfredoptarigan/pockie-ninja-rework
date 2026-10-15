// The Mysterious Merchant laid out like Reborn's Festival Shop (reborn-windows-A-L.md): a 480x480
// BigBG1 panel, the balance box top right, 105x190 cards with "(purchased/limit)" and Buy /
// Sold Out, eight to a page; Buy asks in the confirm prompt and a toast reports the result.
import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import { errorMessage } from '../api'
import { itemName } from '../explore'
import { Prompt } from '../Prompt'
import { Dialog, Notice, Tabs } from '../skin'
import { useMerchantView, useShopAction, type MerchantItem } from './api'
import {
  Balance,
  CardGrid,
  QuantityField,
  ShopCard,
  useCountdown,
  validCount,
  withToast,
} from './parts'

type Tab = 'gold' | 'vip'
const TABS: { id: Tab; title: string }[] = [
  { id: 'gold', title: 'Gold' },
  { id: 'vip', title: 'VIP' },
]

const remaining = (item: MerchantItem) =>
  Math.min(item.left ?? Infinity, item.limit - item.purchased)

export function MerchantWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const query = useMerchantView()
  const action = useShopAction()
  const [tab, setTab] = useState<Tab>('gold')
  const [slot, setSlot] = useState<number | null>(null)
  const [count, setCount] = useState(1)
  const id = useId()
  const data = query.data && query.data.available !== false ? query.data : null
  const countdown = useCountdown(data?.endsAt)
  const stock = data ? (tab === 'gold' ? data.stock : data.vipStock) : []
  const selected = stock.find((item) => item.slot === slot)
  const closed = countdown.seconds === 0 || (tab === 'vip' && !data?.vipAvailable)
  return (
    <>
      <Dialog title="Mysterious Merchant" onClose={onClose} className="game-window-bare w-[490px]">
        <div className="game-panel-1 flex h-[480px] w-[480px] flex-col gap-[4px] p-[5px] font-game text-[12px] text-black">
          {query.isPending && <p>Finding the merchant...</p>}
          {query.isError && <Notice tone="error">{errorMessage(query.error)}</Notice>}
          {query.data && !data && (
            <p className="p-[10px] text-center">
              The merchant is away. Visit the neutral fields during the first ten minutes of a
              scheduled hour.
            </p>
          )}
          {data && (
            <>
              <Tabs
                label="Merchant tabs"
                tabs={TABS}
                active={tab}
                onChange={(value) => {
                  setTab(value)
                  setSlot(null)
                }}
                panelId={id}
              />
              <section
                role="tabpanel"
                id={id}
                aria-label={tab === 'gold' ? 'Gold' : 'VIP'}
                className="flex min-h-0 flex-1 flex-col gap-[4px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px]">Leaves in {countdown.text}</span>
                  <Balance character={character} currencies={['gold']} />
                </div>
                {tab === 'vip' && !data.vipAvailable && (
                  <Notice>VIP membership is required.</Notice>
                )}
                <CardGrid
                  key={tab}
                  label="Merchant stock"
                  items={stock}
                  empty="Nothing for sale."
                  card={(item) => {
                    const soldOut = remaining(item) <= 0
                    const underLevel = character.level < item.useLevel
                    return (
                      <ShopCard
                        key={item.slot}
                        itemId={item.itemId}
                        lines={
                          <>
                            <span>
                              {item.price} Gold ({item.purchased}/{item.limit})
                            </span>
                            <span>{item.bound ? 'Bound' : 'Unbound'}</span>
                            {item.left !== null && <span>{item.left} left</span>}
                            <span className={underLevel ? 'text-[#c00]' : undefined}>
                              Lv {item.useLevel}
                            </span>
                          </>
                        }
                        button={soldOut ? 'Sold Out' : 'Buy'}
                        buttonLabel={`Buy ${itemName(item.itemId)}`}
                        disabled={action.isPending || closed || underLevel || soldOut}
                        onClick={() => {
                          setSlot(item.slot)
                          setCount(1)
                        }}
                      />
                    )
                  }}
                />
              </section>
            </>
          )}
        </div>
      </Dialog>
      {selected && data && (
        <Prompt
          label={`Buy ${itemName(selected.itemId)}`}
          message={`Buy ${itemName(selected.itemId)} x${count}?\n\nCost: ${
            selected.price * (validCount(count, remaining(selected)) ? count : 0)
          } Gold`}
          acceptDisabled={action.isPending || closed || !validCount(count, remaining(selected))}
          onAccept={() => {
            setSlot(null)
            void withToast(
              action.mutateAsync({
                action: 'merchant/buy',
                body: { spawnId: data.spawnId, tab, slot: selected.slot, count },
              }),
              'Purchase successful!',
            )
          }}
          onClose={() => setSlot(null)}
        >
          {remaining(selected) > 1 && (
            <QuantityField value={count} max={remaining(selected)} onChange={setCount} />
          )}
        </Prompt>
      )}
    </>
  )
}
