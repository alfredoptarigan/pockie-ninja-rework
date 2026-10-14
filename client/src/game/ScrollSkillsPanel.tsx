// "Scroll Skills" panel of the Skills window (M5 decision 18): scroll skills learned from 7-day or
// permanent scrolls, at most SCROLL_SKILLS_PER_TREE of them in each preset (skill-bar tree).
import { SCROLL_SKILLS_PER_TREE, type ScrollSkill, type SkillView } from '@pockie/shared'
import rebornText from '../i18n/reborn.json'
import { GameButton } from './skin'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const scrollSkillName = (skillId: number) =>
  (rebornText as Record<string, string>)[`lg_Skill_${skillId}`] ?? `Scroll skill ${skillId}`
/** Same URL as `icons/skills/<id>` in generated/reborn-assets.json, without bundling the manifest. */
export const scrollSkillIcon = (skillId: number) => `/assets/reborn/icons/skills/${skillId}.webp`

export function scrollTimeLeft(expiresAt: string | null, now = Date.now()) {
  if (expiresAt === null) return 'Permanent'
  const left = new Date(expiresAt).getTime() - now
  if (left <= 0) return 'Expired'
  const days = Math.floor(left / DAY_MS)
  const hours = Math.floor((left % DAY_MS) / HOUR_MS)
  if (days > 0) return `${days}d ${hours}h left`
  const minutes = Math.max(1, Math.floor((left % HOUR_MS) / 60000))
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`
}

export function ScrollSkillsPanel({
  data,
  tree,
  busy,
  onSlot,
}: {
  data: SkillView
  /** The preset (skill-bar tree) the Skills window shows. */
  tree: number
  busy: boolean
  onSlot: (slot: number, skillId: number | null) => void
}) {
  const isScroll = (id: number | null) => data.scrolls.some((scroll) => scroll.skillId === id)
  if (!data.scrolls.length) return <p>Use a skill scroll from your bag to learn a scroll skill.</p>
  const slots = data.trees[tree] ?? []
  const empty = slots.find((slot) => slot.skillId === null)
  const full = slots.filter((slot) => isScroll(slot.skillId)).length >= SCROLL_SKILLS_PER_TREE
  return (
    <div className="space-y-2">
      <p>
        Each preset holds up to {SCROLL_SKILLS_PER_TREE} scroll skills. Showing preset {tree + 1}.
      </p>
      <ul className="space-y-2">
        {data.scrolls.map((scroll: ScrollSkill) => {
          const name = scrollSkillName(scroll.skillId)
          const slotted = slots.find((slot) => slot.skillId === scroll.skillId)
          return (
            <li
              key={scroll.skillId}
              className="flex items-center gap-2 rounded border border-wood-light p-2"
            >
              <img src={scrollSkillIcon(scroll.skillId)} alt="" className="size-6" />
              <span className="font-bold">{name}</span>
              <span>{scrollTimeLeft(scroll.expiresAt)}</span>
              {slotted ? (
                <GameButton
                  small
                  disabled={busy}
                  aria-label={`Remove ${name} from preset ${tree + 1}`}
                  onClick={() => onSlot(slotted.slot, null)}
                  className="ml-auto"
                >
                  Remove
                </GameButton>
              ) : (
                <GameButton
                  small
                  disabled={busy || !empty || full}
                  aria-label={`Add ${name} to preset ${tree + 1}`}
                  onClick={() => empty && onSlot(empty.slot, scroll.skillId)}
                  className="ml-auto"
                >
                  Add
                </GameButton>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
