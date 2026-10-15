// The Warehouse tab laid out like Reborn's Storage window (reborn-windows-M-Z-hud.md "Storage"):
// a 290x360 BigBG1 panel with 27px tiles ten to a row, a 290x30 bottom bar, and the Vault popup
// for the money. Ours only goes one way (items and sale money wait here until claimed into the
// bag and purse), so a tile click claims the row and the Vault only withdraws.
// ponytail: no roman tabs, Sort / Sort All, deposits or per-currency amounts; the warehouse has
// 15 rows, no positions, and the server claims the whole wallet at once.
import type { Character } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { ItemIcon } from '../ItemIcon'
import { GameButton, Notice } from '../skin'
import { showToast } from '../toast'
import { useMarketAction, useMarketWarehouse } from './api'
import { marketItemName, Price } from './parts'

const SOURCES = { 0: 'Bought', 1: 'Returned' } as const
const BAR_BUTTON = 'h-[26px] min-w-0 px-0'

export function WarehouseTab({ character }: { character: Character }) {
  const warehouse = useMarketWarehouse()
  const action = useMarketAction()
  const [vault, setVault] = useState(false)
  if (warehouse.isPending) return <p>Opening the warehouse...</p>
  if (warehouse.isError) return <Notice tone="error">{errorMessage(warehouse.error)}</Notice>
  const { items, capacity, wallet } = warehouse.data

  async function run(
    path: string,
    body: object,
    success: (left: number, claimed: number) => string,
  ) {
    try {
      const result = await action.mutateAsync({ action: path, body })
      showToast(success(result.left ?? 0, result.claimed ?? 0), 'success')
    } catch (error) {
      showToast(errorMessage(error), 'failure')
    }
  }

  return (
    <div className="flex items-start gap-[10px]">
      <section
        aria-label="Warehouse"
        className="flex h-[396px] w-[290px] shrink-0 flex-col gap-[2px] font-game text-[12px] text-black"
      >
        <div className="game-panel-1 relative h-[360px] w-[290px] p-[9px]">
          <ul
            aria-label="Warehouse tiles"
            className="grid grid-cols-[repeat(10,27px)] content-start"
          >
            {Array.from({ length: Math.max(capacity, items.length) }, (_, index) => {
              const row = items[index]
              if (!row) return <li key={`empty-${index}`} className="game-slot size-[27px]" />
              const name = marketItemName(row)
              return (
                <li key={row.inventoryId} className="size-[27px]">
                  <button
                    type="button"
                    aria-label={`Claim ${name}${row.count > 1 ? ` x${row.count}` : ''}`}
                    title={`${name}${row.count > 1 ? ` x${row.count}` : ''} (${SOURCES[row.source]})`}
                    disabled={action.isPending}
                    onClick={() =>
                      void run(
                        'warehouse/claim',
                        { inventoryId: row.inventoryId },
                        () => 'Item claimed.',
                      )
                    }
                    className="block size-full disabled:cursor-wait"
                  >
                    <ItemIcon itemId={row.itemId} name={name} className="size-[27px]">
                      {row.count > 1 && (
                        <span className="absolute right-0 bottom-0 text-[9px] leading-none font-bold text-white [text-shadow:var(--shadow-game-text)]">
                          {row.count}
                        </span>
                      )}
                    </ItemIcon>
                  </button>
                </li>
              )
            })}
          </ul>
          <span className="absolute right-[9px] bottom-[6px] text-[11px]">
            {items.length} / {capacity}
          </span>
        </div>
        <div className="game-panel-small flex h-[30px] w-[290px] items-center gap-[5px] px-[5px]">
          <GameButton
            className={`${BAR_BUTTON} w-[65px]`}
            aria-expanded={vault}
            onClick={() => setVault((open) => !open)}
          >
            Vault
          </GameButton>
          <GameButton
            className={`${BAR_BUTTON} w-[70px]`}
            disabled={!items.length || action.isPending}
            onClick={() =>
              void run('warehouse/claim', {}, (left, claimed) =>
                left
                  ? `Claimed ${claimed}. ${left} did not fit in your bag.`
                  : `Claimed ${claimed}.`,
              )
            }
          >
            Claim all
          </GameButton>
        </div>
      </section>
      {vault && (
        <section
          role="dialog"
          aria-label="Vault"
          className="game-frame relative w-[260px] px-[5px] pt-0 pb-[5px] font-game text-[12px]"
        >
          <div className="game-frame-title mb-[5px] flex items-center justify-between">
            <h3 className="game-title-tag font-bold">Vault</h3>
            <button
              type="button"
              aria-label="Close Vault"
              className="game-close shrink-0"
              onClick={() => setVault(false)}
            />
          </div>
          <div className="game-panel-1 flex flex-col gap-[6px] p-[8px] text-black">
            <p className="text-[11px]">
              Market sales wait here after the 10% tax. Money in the vault can't be spent until you
              take it out.
            </p>
            <table className="w-full text-[11px]">
              <tbody>
                {(
                  [
                    ['Stones', 'stone'],
                    ['Gold', 'gold'],
                  ] as const
                ).map(([label, currency]) => (
                  <tr key={currency} aria-label={label}>
                    <th scope="row" className="text-left font-bold">
                      {label}
                    </th>
                    <td>
                      <Price value={wallet[currency]} currency={currency} />
                    </td>
                    <td className="text-right">
                      Carried: {character[currency].toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <GameButton
              className="h-[22px] w-[80px] self-center"
              disabled={(!wallet.stone && !wallet.gold) || action.isPending}
              onClick={() => void run('wallet/claim', {}, () => 'Wallet claimed.')}
            >
              Withdraw
            </GameButton>
          </div>
        </section>
      )}
    </div>
  )
}
