// Reborn's social pager (`vu`): two arrows and "p/N" on SmallBG1; pages hold a fixed row count.
import { useState } from 'react'

/** The rows of the current page; the page clamps when the list shrinks (a removed friend). */
export function usePages<T>(items: readonly T[], size: number) {
  const [chosen, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(chosen, pages)
  return { page, pages, setPage, rows: items.slice((page - 1) * size, page * size) }
}

const ARROW =
  'h-[15px] w-[17px] bg-contain bg-no-repeat disabled:cursor-not-allowed disabled:opacity-50'

export function Pager({
  page,
  pages,
  onPage,
  className = '',
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  className?: string
}) {
  return (
    <div
      className={`game-panel-small mx-auto flex h-[24px] w-fit items-center gap-2 px-2 text-[11px] text-white ${className}`}
    >
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className={`${ARROW} bg-(image:--ui-page-prev-up) hover:bg-(image:--ui-page-prev-over) active:bg-(image:--ui-page-prev-down)`}
      />
      <span>
        {page}/{pages}
      </span>
      <button
        type="button"
        aria-label="Next page"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className={`${ARROW} bg-(image:--ui-page-next-up) hover:bg-(image:--ui-page-next-over) active:bg-(image:--ui-page-next-down)`}
      />
    </div>
  )
}
