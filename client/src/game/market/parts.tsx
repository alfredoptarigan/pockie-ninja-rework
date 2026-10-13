// Small pieces shared by the Market tabs: prices with the currency icons, item cells, rows,
// the category tree and the pager, drawn with the exported 2011 Market skin pieces.
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { MarketItem } from '../../../../shared/src/schemas/market'
import { itemName } from '../explore'
import { borderColor } from '../forge/gear'
import { ItemIcon } from '../ItemIcon'
import type { MarketCategory } from './api'
import { STEP_LABELS, TOP_LABELS } from './labels'

export const ROW_STYLE: CSSProperties = {
  borderStyle: 'solid',
  borderWidth: 'var(--ui-list-row-border)',
  borderImage: 'var(--ui-list-row) var(--ui-list-row-slice) fill / var(--ui-list-row-border)',
}

const ICONS = { stone: 'var(--ui-icon-stone)', gold: 'var(--ui-icon-gold)' } as const
const NAMES = { stone: 'Stone', gold: 'Gold' } as const

/** An amount with its currency icon; "--" when the currency is not offered. */
export function Price({ value, currency }: { value: number | null; currency: 'stone' | 'gold' }) {
  if (value === null) return <span aria-label={`No ${NAMES[currency]} price`}>--</span>
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block size-4 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: ICONS[currency] }}
      />
      <span>
        {value.toLocaleString('en-US')} <span className="sr-only">{NAMES[currency]}</span>
      </span>
    </span>
  )
}

export const marketItemName = (item: Pick<MarketItem, 'itemId' | 'enhanceLevel'>) =>
  `${itemName(item.itemId)}${item.enhanceLevel ? ` +${item.enhanceLevel}` : ''}`

export function ItemCell({ item }: { item: MarketItem }) {
  const name = marketItemName(item)
  const color = item.props.length ? borderColor({ identifyCount: item.props.length }) : undefined
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ItemIcon itemId={item.itemId} name={name} className="size-8">
        {item.count > 1 && (
          <span className="absolute right-0 bottom-0 text-[10px] font-bold text-white [text-shadow:var(--shadow-game-text)]">
            {item.count}
          </span>
        )}
      </ItemIcon>
      <span className="truncate" style={color ? { color: darker(color) } : undefined}>
        {name}
        {item.count > 1 && ` x${item.count}`}
      </span>
    </span>
  )
}

/** The bag border colours are for dark cells; on the cream panel they need darker shades. */
const darker = (color: string) =>
  ({ '#00aeff': '#0a5f93', '#ff8a00': '#9a4a00', '#ffc600': '#7a5c00' })[color] ?? undefined

/** "HH:MM" left, or "Expired". */
export function timeLeft(expiresAt: string, now = Date.now()) {
  const minutes = Math.floor((Date.parse(expiresAt) - now) / 60_000)
  if (minutes <= 0) return 'Expired'
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function categoryLabel(node: MarketCategory, depth: number) {
  if (depth === 0) return TOP_LABELS[String(node.Name)] ?? String(node.Name)
  const name = String(node.Name)
  if (name.includes('—')) return `Level ${name.replace('—', '-')}`
  return STEP_LABELS[name] ?? name
}

/** The martsellshow tree: folders expand, any node can be selected (it browses its subtree). */
export function CategoryTree({
  categories,
  selected,
  onSelect,
}: {
  categories: MarketCategory[]
  selected: string | undefined
  onSelect: (path: string | undefined) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  const node = (category: MarketCategory, depth: number): ReactNode => {
    const leaf = category.children.length === 0
    const expanded = open.has(category.Path)
    const icon = leaf
      ? 'var(--ui-tree-leaf)'
      : expanded
        ? 'var(--ui-tree-folder-open)'
        : 'var(--ui-tree-folder-closed)'
    return (
      <li key={category.Path}>
        <button
          type="button"
          aria-expanded={leaf ? undefined : expanded}
          aria-current={selected === category.Path ? 'true' : undefined}
          onClick={() => {
            onSelect(category.Path)
            if (!leaf) toggle(category.Path)
          }}
          className={`flex w-full items-center gap-1 rounded px-1 text-left hover:bg-white/50 ${
            selected === category.Path ? 'bg-white/70 font-bold' : ''
          }`}
          style={{ paddingLeft: `${depth * 10 + 4}px` }}
        >
          <span
            aria-hidden
            className="inline-block size-3.5 shrink-0 bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: icon }}
          />
          {categoryLabel(category, depth)}
        </button>
        {expanded && <ul>{category.children.map((child) => node(child, depth + 1))}</ul>}
      </li>
    )
  }
  return (
    <nav aria-label="Market categories" className="text-xs">
      <ul>
        <li>
          <button
            type="button"
            aria-current={selected === undefined ? 'true' : undefined}
            onClick={() => onSelect(undefined)}
            className={`w-full rounded px-1 text-left hover:bg-white/50 ${
              selected === undefined ? 'bg-white/70 font-bold' : ''
            }`}
          >
            All items
          </button>
        </li>
        {categories.map((category) => node(category, 0))}
      </ul>
    </nav>
  )
}

const PAGE_BUTTONS = [
  ['first', 'First page'],
  ['prev', 'Previous page'],
  ['next', 'Next page'],
  ['last', 'Last page'],
] as const

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  const target = { first: 1, prev: page - 1, next: page + 1, last: pages }
  return (
    <div className="flex items-center justify-center gap-1 text-xs">
      {PAGE_BUTTONS.map(([kind, label], i) => {
        const disabled = target[kind] < 1 || target[kind] > pages || target[kind] === page
        return (
          <span key={kind} className="contents">
            {i === 2 && (
              <span className="px-2">
                Page {page} of {pages}
              </span>
            )}
            <button
              type="button"
              aria-label={label}
              disabled={disabled}
              onClick={() => onPage(target[kind])}
              className="size-5 bg-contain bg-center bg-no-repeat disabled:opacity-40"
              style={{ backgroundImage: `var(--ui-page-${kind}-up)` }}
            />
          </span>
        )
      })}
    </div>
  )
}
