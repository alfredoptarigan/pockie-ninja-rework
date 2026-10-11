import { AccountPanel } from '../components/AccountPanel'
import { FaqAccordion } from '../components/FaqAccordion'
import { Hero } from '../components/Hero'
import { LoreList } from '../components/LoreList'
import { NewsTabs } from '../components/NewsTabs'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'

export function Landing() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <div className="mx-auto max-w-7xl px-4 pt-16 md:px-8">
          <AccountPanel />
        </div>
        <NewsTabs />
        <LoreList />
        <FaqAccordion />
      </main>
      <SiteFooter />
    </>
  )
}
