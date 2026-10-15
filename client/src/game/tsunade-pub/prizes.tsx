// Tsunade Pub unclaimed prizes (Reborn chunk 221, right panel): prizes packed first-fit into 10x8
// pages of 27px tiles by their bag footprint, at least 5 pages; a prize's menu has Collect Item;
// Collect All and Sell Page (after a confirm) under the page.
import { useState } from 'react'
import { TSUNADE_PUB_RULES, type PubPrizeView } from '../../../../shared/src/schemas/tsunade-pub'
import { ItemMenu, menuAt } from '../ItemMenu'
import { TILE } from '../inventory/BagGrid'
import { Pager } from '../market/parts'
import { Prompt } from '../Prompt'
import { GameButton } from '../skin'
import { PrizeTile, prizeName } from './wheel'

const { pageColumns: COLUMNS, pageRows: ROWS } = TSUNADE_PUB_RULES
const MIN_PAGES = 5

export interface PlacedPrize {
  /** Index into the unclaimed list (what collect and sell take). */
  index: number
  x: number
  y: number
  prize: PubPrizeView
}

function fits(grid: boolean[], x: number, y: number, w: number, h: number) {
  if (x + w > COLUMNS || y + h > ROWS) return false
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) if (grid[(y + dy) * COLUMNS + x + dx]) return false
  return true
}

/** First fit, page by page and row by row, like Reborn's prize pages. */
export function packPages(prizes: readonly PubPrizeView[]) {
  const grids: boolean[][] = []
  const pages: PlacedPrize[][] = []
  prizes.forEach((prize, index) => {
    const { w, h } = prize.info
    for (let page = 0; ; page++) {
      const grid = (grids[page] ??= Array<boolean>(COLUMNS * ROWS).fill(false))
      const list = (pages[page] ??= [])
      const slot = grid.findIndex((_, s) => fits(grid, s % COLUMNS, Math.floor(s / COLUMNS), w, h))
      if (slot < 0) continue
      const x = slot % COLUMNS
      const y = Math.floor(slot / COLUMNS)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) grid[(y + dy) * COLUMNS + x + dx] = true
      list.push({ index, x, y, prize })
      return
    }
  })
  return pages
}

export function Prizes({
  won,
  busy,
  onCollect,
  onSell,
  onTip,
}: {
  won: PubPrizeView[]
  busy: boolean
  onCollect: (index?: number) => void
  onSell: (indexes: number[]) => void
  onTip: (prize: PubPrizeView | null, at?: { x: number; y: number }) => void
}) {
  const pages = packPages(won)
  const pageCount = Math.max(MIN_PAGES, pages.length)
  const [chosen, setPage] = useState(1)
  const page = Math.min(chosen, pageCount)
  const onPage = pages[page - 1] ?? []
  const [menu, setMenu] = useState<{ placed: PlacedPrize; at: { x: number; y: number } } | null>(
    null,
  )
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="relative flex flex-col items-center gap-[8px]" data-menu-root>
      <h3 className="text-[12px] font-bold text-[#333]">Unclaimed Prizes ({won.length})</h3>
      <div className="game-panel-1 relative p-[4px]" style={{ width: 278, height: 224 }}>
        <ul
          aria-label={`Prize page ${page}`}
          className="relative"
          style={{ width: COLUMNS * TILE, height: ROWS * TILE }}
        >
          {onPage.map((placed) => {
            const { w, h } = placed.prize.info
            const open = (event: Parameters<typeof menuAt>[0]) =>
              setMenu({ placed, at: menuAt(event) })
            return (
              <li
                key={placed.index}
                className="absolute"
                style={{
                  left: placed.x * TILE,
                  top: placed.y * TILE,
                  width: 26 * w + (w - 1),
                  height: 26 * h + (h - 1),
                }}
              >
                <button
                  type="button"
                  aria-label={`Prize: ${prizeName(placed.prize)}`}
                  className="size-full"
                  onClick={open}
                  onContextMenu={open}
                  onPointerMove={(event) =>
                    onTip(placed.prize, { x: event.clientX + 12, y: event.clientY + 12 })
                  }
                  onPointerLeave={() => onTip(null)}
                >
                  <PrizeTile prize={placed.prize} />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <Pager page={page} pages={pageCount} onPage={setPage} />
      <div className="flex gap-[8px]">
        <GameButton
          className="h-[30px] w-[100px]"
          disabled={busy || won.length === 0}
          onClick={() => onCollect()}
        >
          Collect All
        </GameButton>
        <GameButton
          className="h-[30px] w-[100px]"
          disabled={busy || onPage.length === 0}
          onClick={() => setConfirm(true)}
        >
          Sell Page
        </GameButton>
      </div>
      {menu && (
        <ItemMenu
          title={prizeName(menu.placed.prize)}
          at={menu.at}
          entries={[{ label: 'Collect Item', onSelect: () => onCollect(menu.placed.index) }]}
          onClose={() => setMenu(null)}
        />
      )}
      {confirm && (
        <Prompt
          message={`Sell all ${onPage.length} prize(s) on this page for stones?\nThis cannot be undone.`}
          onAccept={() => {
            setConfirm(false)
            onSell(onPage.map((placed) => placed.index))
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  )
}
