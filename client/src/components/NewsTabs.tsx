import { landingCopy } from './landing-copy'
import type { Post, PostKind } from '@pockie/shared'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatDate, usePosts } from '../lib/content'
import { Button, Card, EmptyState, ErrorState, SectionHeading, Skeleton } from './ui'

const tabs: { kind: PostKind | undefined; label: string; empty: string }[] = [
  { kind: undefined, label: 'All', empty: 'Nothing posted yet. Check back soon.' },
  { kind: 'news', label: 'News', empty: 'No news yet. Check back soon.' },
  { kind: 'update', label: 'Updates', empty: 'No updates yet. Check back soon.' },
  { kind: 'event', label: 'Events', empty: 'No events yet. Check back soon.' },
]

const kindStyle: Record<PostKind, { label: string; className: string }> = {
  news: { label: 'News', className: 'bg-blue text-white' },
  update: { label: 'Update', className: 'bg-teal text-ink' },
  event: { label: 'Event', className: 'bg-pink text-ink' },
}

function PostCard({ post }: { post: Post }) {
  const kind = kindStyle[post.kind]
  return (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-3 text-sm">
        <span
          className={`rounded-full border-2 border-ink px-2.5 py-0.5 font-display font-bold ${kind.className}`}
        >
          {kind.label}
        </span>
        <time dateTime={post.publishedAt} className="font-medium text-ink-soft">
          {formatDate(post.publishedAt)}
        </time>
      </div>
      <h3 className="text-2xl font-bold leading-tight">{landingCopy(post.title)}</h3>
      <p className="text-ink-soft">{landingCopy(post.summary)}</p>
      <details className="group mt-auto">
        <summary className="w-fit cursor-pointer list-none font-semibold underline decoration-coral decoration-[3px] underline-offset-4">
          <span className="group-open:hidden">Read more</span>
          <span className="hidden group-open:inline">Show less</span>
        </summary>
        <p className="mt-3 leading-relaxed">{landingCopy(post.body)}</p>
      </details>
    </Card>
  )
}

function PostSkeletons() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-label="Loading posts" role="status">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index} className="flex flex-col gap-3 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </Card>
      ))}
    </div>
  )
}

function PostList({ kind, empty }: { kind: PostKind | undefined; empty: string }) {
  const query = usePosts(kind)

  if (query.isPending) return <PostSkeletons />
  if (query.isError) {
    return (
      <ErrorState message="We could not load the latest posts." onRetry={() => query.refetch()} />
    )
  }

  const posts = query.data.pages.flatMap((page) => page.items)
  if (posts.length === 0) return <EmptyState>{empty}</EmptyState>

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="grid w-full gap-6 md:grid-cols-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  )
}

export function NewsTabs() {
  const [active, setActive] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const current = tabs[active] ?? tabs[0]!

  function onKeyDown(event: KeyboardEvent) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (active + step + tabs.length) % tabs.length
    setActive(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <section id="news" className="mx-auto max-w-7xl px-4 py-20 md:px-8">
      <SectionHeading eyebrow="From the dojo" title="News, updates and events" accent="bg-pink" />
      <div
        role="tablist"
        aria-label="Post type"
        onKeyDown={onKeyDown}
        className="mb-8 flex flex-wrap gap-3"
      >
        {tabs.map((tab, index) => {
          const selected = index === active
          return (
            <button
              key={tab.label}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              id={`${id}-tab-${index}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={`min-h-11 rounded-full border-[3px] border-ink px-5 font-display font-bold transition-[transform,box-shadow] duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/60 ${
                selected ? 'bg-ink text-cream' : 'bg-paper shadow-sticker-sm hover:-translate-y-0.5'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`}>
        <PostList key={current.label} kind={current.kind} empty={current.empty} />
      </div>
    </section>
  )
}
