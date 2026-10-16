// Skills window laid out like Pockie Ninja Reborn's (measured 2026-10-14, 456x470): Info and
// Scroll Skills buttons, the ten element passives, the 10x4 ninjutsu grid, the Equipped row (six
// open slots, four locked) and Presets 1-5 (our skill-bar trees). Skills not learned, and those
// already equipped in the shown preset, are drawn grey. Clicking a skill opens its menu (Equip /
// Unequip / Use level); hovering shows its tooltip. Positions are relative to the window content
// (Reborn's x - 5, y - 31).
import type { Character, SkillView } from '@pockie/shared'
import { useCallback, useState, type MouseEvent, type ReactNode } from 'react'
import {
  errorMessage,
  useSkills,
  useSetSkillSlot,
  useActivateSkillTree,
  useResetSkills,
} from './api'
import { ItemMenu, menuAt, type MenuEntry } from './ItemMenu'
import { ScrollSkillsPanel, scrollSkillIcon, scrollSkillName } from './ScrollSkillsPanel'
import { Dialog, GameButton, Notice } from './skin'
import { GameText, plainText, rawText } from './text'

/** Reborn's ninjutsu grid, column by column (top to bottom). */
const ACTIVE_COLUMNS = [
  [1808, 3809, 3804, 3815],
  [3813, 3820, 1803, 3821],
  [1816, 3812, 1815, 3806],
  [1802, 1825, 1839, 3822],
  [1826, 3811, 1813, 1810],
  [1807, 1822, 1832, 3810],
  [3825, 1828, 3814, 3807],
  [1805, 3819, 1823, 1814],
  [1827, 3826, 3805, 3827],
  [1829, 3802, 1830, 3803],
]
/** Equipped row: Reborn shows ten cells; the slots past the open ones are locked. */
export const EQUIPPED_CELLS = 10
/** Reborn's ui__skill_slot_star_requirement: the 7th and 8th slots open with outfit stars. */
const STAR_SLOTS: Record<number, number> = { 6: 2, 7: 5 }
const lockReason = (cell: number) =>
  STAR_SLOTS[cell] ? `Unlocks at ${STAR_SLOTS[cell]} stars` : 'Locked slot'
const PRESETS = 5
const COLUMN_STEP = 44
const ROW_STEP = 48
export const SLOT_STEP = 38

/**
 * Reborn's icon for one of our skill ids: it numbers the element passives from 2800 (ours from
 * 2801) and calls our 3809 (Flame Fireball, the drunk-ignite strike) 1809 Balsam.
 */
const skillIcon = (id: number) =>
  scrollSkillIcon(id >= 2801 && id <= 2810 ? id - 1 : id === 3809 ? 1809 : id)
export const skillName = (id: number) => plainText(`lg_Skill_${id}`, '') || scrollSkillName(id)
/** The text the original client shows (the "_Fake" one leads with the damage), if any. */
const descriptionKey = (id: number) =>
  rawText(`lg_SkillDes_${id}_Fake`) ? `lg_SkillDes_${id}_Fake` : `lg_SkillDes_${id}`

type Menu = { key: string; title: string; entries: MenuEntry[]; x: number; y: number }

export function SkillsWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const query = useSkills()
  return (
    <Dialog
      title="Skills"
      onClose={onClose}
      className="game-window-bare w-[456px] overflow-visible"
    >
      {query.isPending ? (
        <p className="p-2">Loading skills...</p>
      ) : query.isError ? (
        <div className="space-y-2 p-2">
          <Notice tone="error">Could not load your skills.</Notice>
          <GameButton onClick={() => void query.refetch()}>Retry</GameButton>
        </div>
      ) : (
        <SkillBoard data={query.data} character={character} />
      )}
    </Dialog>
  )
}

function SkillBoard({ data, character }: { data: SkillView; character: Character }) {
  const setSlot = useSetSkillSlot()
  const activate = useActivateSkillTree()
  const [panel, setPanel] = useState<'info' | 'scrolls' | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const closeMenu = useCallback(() => setMenu(null), [])
  const busy = setSlot.isPending || activate.isPending
  const tree = data.activeTree
  const slots = data.trees[tree] ?? []
  const level = (id: number) => data.learned.find((skill) => skill.skillId === id)?.level
  const slotOf = (id: number) => slots.find((slot) => slot.skillId === id)
  const empty = slots.find((slot) => slot.skillId === null)
  const passives = data.catalog
    .filter((skill) => skill.kind === 'element')
    .map((skill) => skill.skillId)
    .sort((a, b) => a - b)

  async function run(action: () => Promise<unknown>, success: string) {
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }
  const save = (slot: number, skillId: number | null, done: string, use?: number) =>
    void run(
      () => setSlot.mutateAsync({ tree, slot, skillId, ...(use ? { level: use } : {}) }),
      done,
    )

  /** The menu of a skill, from the grid or from an equipped slot. */
  function entries(id: number): MenuEntry[] {
    const name = skillName(id)
    const slotted = slotOf(id)
    if (!slotted)
      return [
        {
          label: 'Equip',
          name: `Equip ${name}`,
          disabled: busy || !empty,
          reason: empty ? undefined : 'All slots are full.',
          onSelect: () => empty && save(empty.slot, id, `${name} equipped.`, level(id)),
        },
      ]
    const grades = Array.from({ length: level(id) ?? 1 }, (_, index) => index + 1)
    return [
      {
        label: 'Unequip',
        name: `Unequip ${name}`,
        disabled: busy,
        onSelect: () => save(slotted.slot, null, `${name} unequipped.`),
      },
      ...(grades.length > 1
        ? grades.map((grade) => ({
            label: `Use level ${grade}${grade === slotted.level ? ' (current)' : ''}`,
            name: `Use ${name} at level ${grade}`,
            disabled: busy || grade === slotted.level,
            onSelect: () => save(slotted.slot, id, 'Skill level saved.', grade),
          }))
        : []),
    ]
  }
  const open = (id: number) => (event: MouseEvent<HTMLElement>) =>
    setMenu({ key: String(id), title: skillName(id), entries: entries(id), ...menuAt(event) })

  const equipped = slots.filter((slot) => slot.skillId !== null).length
  return (
    <div data-menu-root className="relative h-[432px] w-[446px] font-game text-xs text-ink-game">
      <div className="game-panel-1 absolute top-0 left-0 h-[311px] w-[446px]" />
      <div className="game-panel-1 absolute top-[311px] left-0 h-[85px] w-[446px]" />
      <div className="game-panel-1 absolute top-[396px] left-0 h-[36px] w-[446px]" />

      <GameButton
        aria-pressed={panel === 'info'}
        onClick={() => setPanel(panel === 'info' ? null : 'info')}
        className="absolute top-[6px] left-[4px] h-[20px] min-h-0! w-[50px] min-w-0! px-0!"
      >
        Info
      </GameButton>
      <GameButton
        aria-pressed={panel === 'scrolls'}
        onClick={() => setPanel(panel === 'scrolls' ? null : 'scrolls')}
        className="absolute top-[6px] left-[58px] h-[20px] min-h-0! w-[80px] min-w-0! px-0!"
      >
        Scroll Skills
      </GameButton>

      <Label at={6}>Passive</Label>
      <section aria-label="Passive skills">
        {passives.map((id, column) => (
          <div
            key={id}
            className="game-skill-column absolute h-[48px] w-[37px]"
            style={{ left: 7 + column * COLUMN_STEP, top: 30 }}
          >
            <SkillCell id={id} learned={level(id)} />
          </div>
        ))}
      </section>

      <Label at={83}>Active</Label>
      <section aria-label="Ninjutsu">
        {ACTIVE_COLUMNS.map((column, index) => (
          <div
            key={index}
            className="game-skill-column absolute h-[201px] w-[37px]"
            style={{ left: 7 + index * COLUMN_STEP, top: 105 }}
          >
            {column.map((id, row) => (
              <SkillCell
                key={id}
                id={id}
                top={7 + row * ROW_STEP}
                learned={level(id)}
                grey={!level(id) || !!slotOf(id)}
                open={menu?.key === String(id)}
                onOpen={level(id) ? open(id) : undefined}
              />
            ))}
          </div>
        ))}
      </section>

      <Label at={317}>{`Equipped (${equipped})`}</Label>
      <section
        aria-label={`Equipped skills, preset ${tree + 1}`}
        className="game-skill-column absolute top-[341px] left-[25px] h-[50px] w-[396px]"
      >
        {Array.from({ length: EQUIPPED_CELLS }, (_, cell) => {
          const slot = slots[cell]
          const left = 16 + cell * SLOT_STEP
          if (!slot)
            return (
              <span
                key={cell}
                role="img"
                aria-label={lockReason(cell)}
                title={lockReason(cell)}
                className="game-skill-lock absolute top-[3px] size-[27px]"
                style={{ left }}
              />
            )
          return slot.skillId === null ? (
            <span
              key={cell}
              role="img"
              aria-label={`Slot ${cell + 1}: empty`}
              className="game-skill-cell absolute top-[4px] size-[26px]"
              style={{ left }}
            />
          ) : (
            <SkillCell
              key={cell}
              id={slot.skillId}
              left={left}
              top={4}
              learned={slot.level}
              open={menu?.key === String(slot.skillId)}
              onOpen={open(slot.skillId)}
            />
          )
        })}
      </section>

      <div className="absolute top-[404px] left-[116px] flex items-center gap-[6px]">
        <span className="mr-[4px] text-[11px] text-black">Presets:</span>
        {Array.from({ length: PRESETS }, (_, preset) => (
          <GameButton
            key={preset}
            aria-pressed={preset === tree}
            aria-label={`Preset ${preset + 1}`}
            disabled={busy}
            onClick={() =>
              preset !== tree &&
              void run(() => activate.mutateAsync({ tree: preset }), `Preset ${preset + 1} active.`)
            }
            className={`h-[20px] min-h-0! w-[28px] min-w-0! px-0! text-[11px] ${
              preset === tree ? 'brightness-[.85]' : ''
            }`}
          >
            {preset + 1}
          </GameButton>
        ))}
      </div>

      {panel && (
        <section
          role="dialog"
          aria-label={panel === 'info' ? 'Skill info' : 'Scroll Skills'}
          className="game-panel-1 absolute inset-x-[4px] top-[30px] z-20 max-h-[370px] space-y-2 overflow-y-auto p-4"
        >
          {panel === 'info' ? (
            <InfoPanel data={data} character={character} />
          ) : (
            <ScrollSkillsPanel
              data={data}
              tree={tree}
              busy={busy}
              onSlot={(slot, skillId) =>
                save(
                  slot,
                  skillId,
                  skillId === null ? 'Scroll skill removed.' : 'Scroll skill added.',
                )
              }
            />
          )}
          <GameButton onClick={() => setPanel(null)}>Close</GameButton>
        </section>
      )}
      {menu && <ItemMenu title={menu.title} at={menu} entries={menu.entries} onClose={closeMenu} />}
      {(message || error) && (
        <div className="absolute inset-x-[60px] top-[150px] z-30">
          {message && <Notice>{message}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </div>
  )
}

/** Section caption on Reborn's TextBG2 plate ("Passive", "Active", "Equipped (6)"). */
function Label({ at, children }: { at: number; children: ReactNode }) {
  return (
    <h3
      className="game-value-box absolute left-[173px] grid h-[20px] w-[104px] place-items-center font-mono text-xs font-normal text-black"
      style={{ top: at }}
    >
      {children}
    </h3>
  )
}

/**
 * One skill: the 24px icon in its 26px cell, the level strip under it, and the tooltip on hover
 * or focus. `onOpen` makes it a button that opens the skill's menu.
 */
export function SkillCell({
  id,
  left = 4,
  top = 3,
  learned,
  grey = !learned,
  open = false,
  onOpen,
}: {
  id: number
  left?: number
  top?: number
  learned?: number
  grey?: boolean
  open?: boolean
  onOpen?: (event: MouseEvent<HTMLElement>) => void
}) {
  const [shown, setShown] = useState(false)
  const name = skillName(id)
  const label = learned ? `${name}, level ${learned}` : `${name}, not learned`
  return (
    <div
      className="absolute"
      style={{ left, top }}
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      <span
        className={`game-skill-cell relative grid size-[26px] place-items-center ${
          open ? 'shadow-[0_0_0_2px_#fff2ae]' : ''
        }`}
      >
        <img
          src={skillIcon(id)}
          alt=""
          draggable={false}
          className={`size-[24px] ${grey ? 'grayscale' : ''}`}
        />
        {onOpen ? (
          <button
            type="button"
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={onOpen}
            onContextMenu={onOpen}
            className="absolute inset-0 cursor-pointer"
          />
        ) : (
          <span role="img" aria-label={label} className="absolute inset-0" />
        )}
      </span>
      <span
        aria-hidden="true"
        className="game-skill-level mt-[3px] block h-[12px] w-[26px] text-center text-[9px] leading-[12px] font-bold text-white"
      >
        {learned && learned > 1 ? learned : ''}
      </span>
      {shown && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-full left-0 z-50 mt-1 w-[250px] rounded-[3px] border-2 border-[#5c5c5c] bg-black/85 px-2 py-1 text-xs leading-snug text-white"
        >
          <p className="text-sm font-bold text-[#f0d060]">{name}</p>
          <p className="text-[#8e8e8e]">{learned ? `Level ${learned}` : 'Not learned'}</p>
          <SkillDescription id={id} />
        </div>
      )}
    </div>
  )
}

/** Info: how skills are learned, and the paid reset (moved here from the old window). */
function InfoPanel({ data, character }: { data: SkillView; character: Character }) {
  const reset = useResetSkills()
  const [currency, setCurrency] = useState<'gold' | 'giftCoupon'>('gold')
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const ninjutsu = data.learned.filter(
    (skill) => data.catalog.find((entry) => entry.skillId === skill.skillId)?.kind === 'ninjutsu',
  )
  const cost = data.freeResets
    ? 'one free reset'
    : `${data.resetCost} ${currency === 'gold' ? 'Gold' : 'Gift Coupons'}`
  async function confirmReset() {
    setNotice(null)
    try {
      await reset.mutateAsync({ currency })
      setConfirm(false)
      setNotice({ tone: 'info', text: 'Skills reset. Equip your new skills before fighting.' })
    } catch (failure) {
      setNotice({ tone: 'error', text: errorMessage(failure) })
    }
  }
  return (
    <>
      <p>
        Learn a random ninjutsu each level and an element skill every ten levels. Element skills
        apply automatically. Each preset holds six skills; pick the preset to fight with below.
      </p>
      <p>
        Learned ninjutsu: {ninjutsu.length} of {ACTIVE_COLUMNS.flat().length}.
      </p>
      <section aria-label="Reset skills" className="space-y-2 border-t border-wood-light pt-2">
        <p>
          Free resets: {data.freeResets}. Reset cost: {cost}.
        </p>
        <label>
          Reset currency{' '}
          <select
            aria-label="Reset currency"
            disabled={reset.isPending || confirm}
            value={currency}
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
          >
            <option value="gold">Gold</option>
            <option value="giftCoupon">Gift Coupons</option>
          </select>
        </label>
        {!confirm ? (
          <GameButton
            disabled={reset.isPending || (!data.freeResets && character[currency] < data.resetCost)}
            onClick={() => setConfirm(true)}
          >
            Reset skills
          </GameButton>
        ) : (
          <div className="space-y-2">
            <p>This will reroll your learned skills and clear all five presets. Cost: {cost}.</p>
            <GameButton disabled={reset.isPending} onClick={() => void confirmReset()}>
              Confirm reset
            </GameButton>
            <GameButton disabled={reset.isPending} onClick={() => setConfirm(false)}>
              Cancel
            </GameButton>
          </div>
        )}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </section>
    </>
  )
}

/** Shared rich description for the skill board and battle hover cards. */
export function SkillDescription({ id }: { id: number }) {
  // shortcut: level-specific chakra costs are unavailable here; fill them when replay data carries them.
  return (
    <GameText
      k={descriptionKey(id)}
      args={['—']}
      tone="dark"
      fallback="No skill description available."
    />
  )
}
