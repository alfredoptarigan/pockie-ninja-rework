import type { Character } from '@pockie/shared'
import { useId, useState } from 'react'
import {
  errorMessage,
  useSkills,
  useSetSkillSlot,
  useActivateSkillTree,
  useResetSkills,
} from './api'
import { Dialog, GameButton, Notice, Tabs } from './skin'
import { plainText } from './text'

export function SkillsWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const query = useSkills()
  const setSlot = useSetSkillSlot()
  const activate = useActivateSkillTree()
  const reset = useResetSkills()
  const [selectedTree, selectTree] = useState<number | null>(null)
  const [currency, setCurrency] = useState<'gold' | 'giftCoupon'>('gold')
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const panelId = useId()
  const busy = setSlot.isPending || activate.isPending || reset.isPending
  const data = query.data
  const tree = selectedTree ?? data?.activeTree ?? 0
  const owned =
    data?.learned.map((skill) => ({
      ...skill,
      definition: data.catalog.find((entry) => entry.skillId === skill.skillId),
    })) ?? []
  const ninjutsu = owned.filter((skill) => skill.definition?.kind === 'ninjutsu')
  const elements = owned.filter((skill) => skill.definition?.kind === 'element')
  const name = (id: number) =>
    plainText(data?.catalog.find((skill) => skill.skillId === id)?.nameKey ?? '', `Skill ${id}`)
  const cost = data?.freeResets
    ? 'one free reset'
    : `${data?.resetCost ?? 8} ${currency === 'gold' ? 'Gold' : 'Gift coupons'}`
  async function run(action: () => Promise<unknown>, success: string) {
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  return (
    <Dialog title="Skills" onClose={onClose} className="w-[38rem]">
      <div className="space-y-3 text-ink-game">
        {query.isPending ? (
          <p>Loading skills...</p>
        ) : query.isError ? (
          <>
            <Notice tone="error">Could not load your skills.</Notice>
            <GameButton onClick={() => void query.refetch()}>Retry</GameButton>
          </>
        ) : (
          data && (
            <>
              <p>
                Learn a random ninjutsu each level and an element skill every ten levels. Element
                skills apply automatically.
              </p>
              <Tabs
                label="Skill trees"
                panelId={panelId}
                tabs={[0, 1, 2].map((id) => ({ id: String(id), title: `Tree ${id + 1}` }))}
                active={String(tree)}
                onChange={(id) => {
                  selectTree(Number(id))
                  setConfirm(false)
                }}
              />
              <section
                id={panelId}
                role="tabpanel"
                aria-label={`Tree ${tree + 1}`}
                className="space-y-2"
              >
                {tree === data.activeTree ? (
                  <p className="font-bold">Active tree</p>
                ) : (
                  <GameButton
                    disabled={busy}
                    onClick={() =>
                      void run(() => activate.mutateAsync({ tree }), `Tree ${tree + 1} activated.`)
                    }
                  >
                    Activate tree {tree + 1}
                  </GameButton>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.trees[tree]?.map((slot) => {
                    const learned = owned.find((skill) => skill.skillId === slot.skillId)
                    return (
                      <fieldset
                        key={slot.slot}
                        disabled={busy}
                        className="rounded border border-wood-light p-2"
                      >
                        <legend>Slot {slot.slot + 1}</legend>
                        <select
                          aria-label={`Slot ${slot.slot + 1} skill`}
                          className="w-full rounded border border-wood-light bg-parchment p-1"
                          value={slot.skillId ?? ''}
                          onChange={(event) => {
                            const skillId = event.target.value ? Number(event.target.value) : null
                            const level = ninjutsu.find((skill) => skill.skillId === skillId)?.level
                            void run(
                              () =>
                                setSlot.mutateAsync({
                                  tree,
                                  slot: slot.slot,
                                  skillId,
                                  ...(level ? { level } : {}),
                                }),
                              'Slot saved.',
                            )
                          }}
                        >
                          <option value="">No skill</option>
                          {ninjutsu.map((skill) => (
                            <option key={skill.skillId} value={skill.skillId}>
                              {name(skill.skillId)}
                            </option>
                          ))}
                        </select>
                        <label className="mt-2 flex items-center gap-2">
                          Use level
                          <select
                            aria-label={`Slot ${slot.slot + 1} level`}
                            disabled={!learned || busy}
                            value={slot.level || 1}
                            onChange={(event) =>
                              void run(
                                () =>
                                  setSlot.mutateAsync({
                                    tree,
                                    slot: slot.slot,
                                    skillId: slot.skillId,
                                    level: Number(event.target.value),
                                  }),
                                'Skill level saved.',
                              )
                            }
                          >
                            {Array.from({ length: learned?.level ?? 1 }, (_, index) => (
                              <option key={index} value={index + 1}>
                                {index + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      </fieldset>
                    )
                  })}
                </div>
              </section>
              <section aria-label="Learned skills">
                <h3 className="font-bold">Learned ninjutsu ({ninjutsu.length})</h3>
                {ninjutsu.length ? (
                  <p>
                    {ninjutsu
                      .map((skill) => `${name(skill.skillId)} (level ${skill.level})`)
                      .join(', ')}
                  </p>
                ) : (
                  <p>Gain a level to learn your first ninjutsu.</p>
                )}
                <h3 className="mt-2 font-bold">Element skills</h3>
                {elements.length ? (
                  <ul>
                    {elements.map((skill) => (
                      <li key={skill.skillId}>{name(skill.skillId)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No element skills learned yet.</p>
                )}
              </section>
              <section
                aria-label="Reset skills"
                className="space-y-2 border-t border-wood-light pt-2"
              >
                <p>
                  Free resets: {data.freeResets}. Reset cost: {cost}.
                </p>
                <label>
                  Reset currency{' '}
                  <select
                    aria-label="Reset currency"
                    disabled={busy || confirm}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value as typeof currency)}
                  >
                    <option value="gold">Gold</option>
                    <option value="giftCoupon">Gift coupons</option>
                  </select>
                </label>
                {!confirm ? (
                  <GameButton
                    disabled={busy || (!data.freeResets && character[currency] < data.resetCost)}
                    onClick={() => setConfirm(true)}
                  >
                    Reset skills
                  </GameButton>
                ) : (
                  <div className="space-y-2">
                    <p>
                      This will reroll your learned skills and clear all three trees. Cost: {cost}.
                    </p>
                    <GameButton
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await reset.mutateAsync({ currency })
                          setConfirm(false)
                        }, 'Skills reset. Equip your new skills before fighting.')
                      }
                    >
                      Confirm reset
                    </GameButton>
                    <GameButton disabled={busy} onClick={() => setConfirm(false)}>
                      Cancel
                    </GameButton>
                  </div>
                )}
              </section>
            </>
          )
        )}
        {message && <Notice>{message}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Dialog>
  )
}
