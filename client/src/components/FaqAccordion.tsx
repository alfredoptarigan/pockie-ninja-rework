import { useFaq } from '../lib/content'
import { Card, EmptyState, ErrorState, SectionHeading, Skeleton } from './ui'

export function FaqAccordion() {
  const query = useFaq()

  let content
  if (query.isPending) {
    content = (
      <div role="status" aria-label="Loading questions" className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    )
  } else if (query.isError) {
    content = (
      <ErrorState message="We could not load the questions." onRetry={() => query.refetch()} />
    )
  } else if (query.data.length === 0) {
    content = <EmptyState>No questions yet.</EmptyState>
  } else {
    content = (
      <div className="flex flex-col gap-4">
        {query.data.map((item) => (
          <Card key={item.id} className="shadow-sticker-sm">
            <details className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-4 font-display text-lg font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/60 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-mustard text-xl leading-none transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[65ch] px-6 pb-6 leading-relaxed text-ink-soft">{item.answer}</p>
            </details>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <section id="faq" className="mx-auto max-w-4xl px-4 py-20 md:px-8">
      <SectionHeading eyebrow="Good to know" title="Frequently asked questions" accent="bg-coral" />
      {content}
    </section>
  )
}
