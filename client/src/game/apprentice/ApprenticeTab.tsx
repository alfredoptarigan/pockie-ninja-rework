// The Player List's "Apprentice" tab (an empty panel in Reborn, so the layout is ours, in the Area
// tab's style): the master row, the apprentice rows (Lv., name, an action 44 wide), then the
// request line: a ninja's name and Request, or "Waiting for {name}..." with Cancel.
import { useState, type FormEvent } from 'react'
import type { ApprenticeMember } from '../../../../shared/src/schemas/apprentice'
import { LEVEL_RULE } from '../../../../game-core/src/social/apprentice'
import { errorMessage } from '../api'
import { Prompt } from '../Prompt'
import { showToast } from '../toast'
import { APPRENTICE_CONFIG, useApprentice, useApprenticeAction } from './api'

const { maxApprentices, graduateLevel } = APPRENTICE_CONFIG
const ROW =
  'game-text-box grid h-[22px] w-[182px] grid-cols-[30px_1fr_44px] items-center px-[2px] text-[11px]'
const SMALL_BUTTON = 'game-button h-[16px] w-[44px] text-[9px] disabled:cursor-not-allowed'

interface Ending {
  member: ApprenticeMember
  label: 'Leave' | 'Dismiss'
}

function MemberRow({
  member,
  endLabel,
  busy,
  onView,
  onEnd,
  onGraduate,
}: {
  member: ApprenticeMember
  endLabel: Ending['label']
  busy: boolean
  onView: (id: string) => void
  onEnd: () => void
  onGraduate: () => void
}) {
  return (
    <li className={ROW}>
      <span className="text-[10px] font-bold">Lv.{member.level}</span>
      <button
        type="button"
        onClick={() => onView(member.characterId)}
        title={member.online ? 'Online' : 'Offline'}
        className={`min-w-0 truncate text-left hover:underline ${member.online ? 'text-[#1a5276]' : 'text-[#777]'}`}
      >
        {member.name}
      </button>
      {member.canGraduate ? (
        <button type="button" disabled={busy} onClick={onGraduate} className={SMALL_BUTTON}>
          Graduate
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={onEnd} className={SMALL_BUTTON}>
          {endLabel}
        </button>
      )}
    </li>
  )
}

const Heading = ({ children }: { children: string }) => (
  <h3 className="w-[182px] text-[10px] leading-[14px] font-bold">{children}</h3>
)

export function ApprenticeTab({ onView }: { onView: (id: string) => void }) {
  const { data } = useApprentice()
  const action = useApprenticeAction()
  const [name, setName] = useState('')
  const [ending, setEnding] = useState<Ending | null>(null)
  const run = (path: string, body: object, success?: string) =>
    action.mutate(
      { path, body },
      {
        onSuccess: () => success && showToast(success, 'success'),
        onError: (error) => showToast(errorMessage(error), 'failure'),
      },
    )
  const send = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) run('request', { name: name.trim() }, 'Request sent.')
  }
  const graduate = (member: ApprenticeMember) =>
    run('graduate', { characterId: member.characterId })
  const apprentices = data?.apprentices ?? []
  const busy = action.isPending

  return (
    <div className="flex w-[185px] flex-col items-center gap-[2px]">
      <Heading>Master</Heading>
      <ul aria-label="Your master" className="flex flex-col">
        {data?.master ? (
          <MemberRow
            member={data.master}
            endLabel="Leave"
            busy={busy}
            onView={onView}
            onEnd={() => setEnding({ member: data.master!, label: 'Leave' })}
            onGraduate={() => graduate(data.master!)}
          />
        ) : (
          <li className={`${ROW} text-[#777]`}>
            <span className="col-span-3 pl-[2px]">No master</span>
          </li>
        )}
      </ul>
      <Heading>{`Apprentices (${apprentices.length}/${maxApprentices})`}</Heading>
      <ul aria-label="Your apprentices" className="flex flex-col gap-[2px]">
        {apprentices.map((member) => (
          <MemberRow
            key={member.characterId}
            member={member}
            endLabel="Dismiss"
            busy={busy}
            onView={onView}
            onEnd={() => setEnding({ member, label: 'Dismiss' })}
            onGraduate={() => graduate(member)}
          />
        ))}
        {Array.from({ length: maxApprentices - apprentices.length }, (_, i) => (
          <li key={i} aria-hidden className="game-text-box h-[22px] w-[182px]" />
        ))}
      </ul>
      {data?.outgoing ? (
        <div className={`${ROW} mt-[6px] grid-cols-[1fr_44px]!`}>
          <span className="truncate">Waiting for {data.outgoing.to.name}...</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('cancel', {})}
            className={SMALL_BUTTON}
          >
            Cancel
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="mt-[6px] flex w-[182px] gap-[2px]" title={LEVEL_RULE}>
          <input
            aria-label="Ninja name"
            placeholder="Ninja name"
            maxLength={32}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="game-field h-[18px] min-w-0 flex-1 px-1 text-[11px] text-black"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={`${SMALL_BUTTON} h-[18px]! w-[50px]!`}
          >
            Request
          </button>
        </form>
      )}
      <p className="w-[182px] text-[9px] leading-[11px] text-[#555]">
        Graduates at Lv. {graduateLevel}: both get a reward.
      </p>
      {ending && (
        <Prompt
          message={
            ending.label === 'Leave'
              ? `Leave your master ${ending.member.name}? There is no reward.`
              : `Dismiss your apprentice ${ending.member.name}? There is no reward.`
          }
          acceptLabel={ending.label}
          onAccept={() => {
            run('dismiss', { characterId: ending.member.characterId })
            setEnding(null)
          }}
          onClose={() => setEnding(null)}
        />
      )}
    </div>
  )
}
