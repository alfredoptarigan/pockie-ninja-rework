import { motion, type Variants } from 'motion/react'
import { useMe } from '../lib/auth'
import { ChibiSprite, type ChibiName } from './ChibiSprite'
import { Circle, DotGrid, HalfCircle, Plus, Squiggle, Triangle, Zigzag } from './MemphisShapes'
import { ServerStatus } from './ServerStatus'
import { ButtonLink } from './ui'

const reveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
}

// Positions are percentages of the composition box, so it scales with the viewport.
const cast: { name: ChibiName; className: string; float: number; delay: number }[] = [
  { name: 'ichigo', className: 'left-[4%] top-[8%] w-[24%]', float: 3.6, delay: 0.2 },
  { name: 'sasuke', className: 'right-[6%] top-[4%] w-[24%]', float: 4.2, delay: 0.5 },
  { name: 'naruto', className: 'left-[34%] top-[26%] w-[32%]', float: 3.2, delay: 0 },
  { name: 'rukia', className: 'left-[8%] bottom-[4%] w-[22%]', float: 4.6, delay: 0.8 },
  { name: 'gaara', className: 'right-[8%] bottom-[6%] w-[23%]', float: 3.9, delay: 0.35 },
]

function Composition() {
  return (
    <div className="relative mx-auto aspect-[10/9] w-full max-w-[600px]">
      <Circle className="absolute left-[24%] top-[18%] w-[52%]" color="var(--color-mustard)" />
      <DotGrid className="absolute right-[2%] top-[30%] h-[30%] w-[26%] opacity-70" />
      <HalfCircle className="absolute -left-[2%] top-[44%] w-[22%] rotate-[-18deg]" />
      <Triangle className="absolute right-[24%] top-[0%] w-[13%] rotate-12" />
      <Squiggle className="absolute bottom-[0%] left-[30%] w-[38%]" color="var(--color-pink)" />
      <Zigzag className="absolute left-[2%] top-[0%] w-[18%]" color="var(--color-blue)" />
      <Plus
        className="absolute bottom-[30%] right-[0%] w-[8%] rotate-12"
        color="var(--color-coral)"
      />
      <Circle className="absolute bottom-[34%] left-[30%] w-[6%]" color="var(--color-teal)" />

      {cast.map(({ name, className, float, delay }) => (
        <motion.div
          key={name}
          className={`absolute ${className}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, y: [0, -12, 0] }}
          transition={{
            opacity: { delay: 0.3 + delay, duration: 0.4 },
            scale: { delay: 0.3 + delay, type: 'spring', stiffness: 220, damping: 14 },
            y: { delay: 1 + delay, duration: float, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <ChibiSprite name={name} className="w-full drop-shadow-[4px_4px_0_rgba(31,29,43,0.18)]" />
        </motion.div>
      ))}
    </div>
  )
}

export function Hero() {
  const { data: user } = useMe()

  return (
    <section className="relative overflow-hidden border-b-[3px] border-ink">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 md:min-h-[calc(100dvh-4.5rem)] md:grid-cols-[1.05fr_1fr] md:px-8 md:py-16">
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.09 }}
          className="relative z-10"
        >
          <motion.p
            variants={reveal}
            className="inline-block -rotate-2 rounded-md border-[3px] border-ink bg-teal px-3 py-1 font-display text-sm font-bold uppercase tracking-wider shadow-sticker-sm"
          >
            The 2011 chibi ninja RPG, rebuilt
          </motion.p>
          <motion.h1
            variants={reveal}
            className="mt-6 text-6xl font-extrabold leading-[0.92] tracking-tight sm:text-7xl lg:text-8xl"
          >
            Pockie Ninja
            <span className="relative mt-2 block w-fit">
              <span className="relative z-10">Remastered</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1 z-0 h-5 -rotate-1 bg-coral md:h-7"
              />
            </span>
          </motion.h1>
          <motion.p
            variants={reveal}
            className="mt-6 max-w-[34rem] text-lg text-ink-soft md:text-xl"
          >
            Gear up in famous outfits, plan your techniques and watch the auto-battles unfold. The
            original browser classic is back, fully in English and with no Flash required.
          </motion.p>
          <motion.div variants={reveal} className="mt-8 flex flex-wrap gap-4">
            {user ? (
              <ButtonLink to="/play">Enter the game</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/register">Create account</ButtonLink>
                <ButtonLink to="/login" variant="secondary">
                  Log in
                </ButtonLink>
              </>
            )}
          </motion.div>
          <motion.div variants={reveal} className="mt-8">
            <ServerStatus />
          </motion.div>
        </motion.div>

        <Composition />
      </div>
    </section>
  )
}
