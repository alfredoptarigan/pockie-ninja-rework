import { landingCopy } from './landing-copy'
import { useLore } from '../lib/content'
import { Card, EmptyState, ErrorState, SectionHeading, Skeleton } from './ui'

const badgeColors = ['bg-coral', 'bg-mustard', 'bg-teal', 'bg-blue text-white', 'bg-pink']

export function LoreList() {
  const query = useLore()

  let content
  if (query.isPending) {
    content = (
      <div role="status" aria-label="Loading lore" className="flex flex-col gap-6">
        {[0, 1, 2].map((index) => (
          <Card key={index} className="flex flex-col gap-3 p-6">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </Card>
        ))}
      </div>
    )
  } else if (query.isError) {
    content = <ErrorState message="We could not load the story." onRetry={() => query.refetch()} />
  } else if (query.data.length === 0) {
    content = <EmptyState>The story is still being written.</EmptyState>
  } else {
    content = (
      <ol className="flex flex-col gap-8">
        {query.data.map((chapter, index) => (
          <li key={chapter.id} className="grid gap-4 md:grid-cols-[5rem_1fr] md:gap-6">
            <span
              aria-hidden="true"
              className={`flex size-16 items-center justify-center rounded-full border-[3px] border-ink font-display text-2xl font-extrabold shadow-sticker-sm ${badgeColors[index % badgeColors.length]}`}
            >
              {chapter.position}
            </span>
            <Card className="p-6 md:p-8">
              <h3 className="text-2xl font-bold">
                <span className="sr-only">Chapter {chapter.position}: </span>
                {landingCopy(chapter.title)}
              </h3>
              <p className="mt-3 max-w-[65ch] leading-relaxed text-ink-soft">
                {landingCopy(chapter.body)}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section id="lore" className="relative border-y-[3px] border-ink bg-mustard/35">
      <div
        aria-hidden="true"
        className="bg-dots absolute inset-y-0 right-0 hidden w-1/4 opacity-15 md:block"
      />
      <div className="relative mx-auto max-w-5xl px-4 py-20 md:px-8">
        <SectionHeading
          eyebrow="The story so far"
          title="Lore of the five seals"
          accent="bg-teal"
        />
        {content}
      </div>
    </section>
  )
}
