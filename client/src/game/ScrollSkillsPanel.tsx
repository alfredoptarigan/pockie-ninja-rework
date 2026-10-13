// "Scroll Skills" tab of the Skills window (M5 decision 18): scroll skills learned from 7-day or
// permanent scrolls, at most SCROLL_SKILLS_PER_TREE of them in each skill-bar tree.
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
  busy,
  onSlot,
}: {
  data: SkillView
  busy: boolean
  onSlot: (tree: number, slot: number, skillId: number | null) => void
}) {
  const isScroll = (id: number | null) => data.scrolls.some((scroll) => scroll.skillId === id)
  if (!data.scrolls.length) return <p>Use a skill scroll from your bag to learn a scroll skill.</p>
  return (
    <div className="space-y-2">
      <p>Each tree holds up to {SCROLL_SKILLS_PER_TREE} scroll skills.</p>
      <ul className="space-y-2">
        {data.scrolls.map((scroll: ScrollSkill) => {
          const name = scrollSkillName(scroll.skillId)
          return (
            <li
              key={scroll.skillId}
              className="flex flex-wrap items-center gap-2 rounded border border-wood-light p-2"
            >
              <img src={scrollSkillIcon(scroll.skillId)} alt="" className="size-9" />
              <span className="font-bold">{name}</span>
              <span>{scrollTimeLeft(scroll.expiresAt)}</span>
              <span className="ml-auto flex flex-wrap gap-1">
                {data.trees.map((slots, tree) => {
                  const slotted = slots.find((slot) => slot.skillId === scroll.skillId)
                  if (slotted)
                    return (
                      <GameButton
                        key={tree}
                        small
                        disabled={busy}
                        aria-label={`Remove ${name} from tree ${tree + 1}`}
                        onClick={() => onSlot(tree, slotted.slot, null)}
                      >
                        Tree {tree + 1}: remove
                      </GameButton>
                    )
                  const empty = slots.find((slot) => slot.skillId === null)
                  const full =
                    slots.filter((slot) => isScroll(slot.skillId)).length >= SCROLL_SKILLS_PER_TREE
                  return (
                    <GameButton
                      key={tree}
                      small
                      disabled={busy || !empty || full}
                      aria-label={`Slot ${name} in tree ${tree + 1}`}
                      onClick={() => empty && onSlot(tree, empty.slot, scroll.skillId)}
                    >
                      Tree {tree + 1}: slot
                    </GameButton>
                  )
                })}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
