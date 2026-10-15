// Akatsuki Invasion (Reborn scene 9400, main.js `tj`), as a 1200x675 window over Reborn's statue
// background: the heading (progress, who hunts you), Leave, the ten members standing on the
// statue's fingers (locked holograms, revealed or defeated sprites, a glow under the defeated)
// and the panel of the clicked member: Zetsu sells you out as bait and sends you to a waiting
// ambush; a beaten member gives their red outfit and a rematch.
// ponytail: Reborn's animated holograms (GIFs) and their Pause toggle are left out: static art.
import type { Character } from '@pockie/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type CSSProperties } from 'react'
import type {
  AkatsukiClaimResult,
  AkatsukiMember,
  AkatsukiView,
} from '../../../../shared/src/schemas/akatsuki'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult } from '../api'
import { Dialog, Notice } from '../skin'
import { showToast } from '../toast'
import { akatsukiKey, AKATSUKI_PATH, PairFight, postFight, type PairFightResult } from './fight'
import { ART, MEMBERS, pairNames, SCENE, type MemberArt } from './members'

const WIDTH = 1200
const HEIGHT = 675
const pct = (value: number, of: number) => `${(value / of) * 100}%`
const BUTTON =
  'min-h-[32px] cursor-pointer rounded-[3px] border border-[#7e6a91] bg-[#2c2140] px-3 py-1.5 text-[#f5edf9] hover:bg-[#44304e] disabled:cursor-default disabled:opacity-55'

export function AkatsukiWindow({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const view = useQuery({
    queryKey: akatsukiKey,
    queryFn: () => api<AkatsukiView>(AKATSUKI_PATH),
  })
  const [selected, setSelected] = useState<AkatsukiMember | null>(null)
  const [fight, setFight] = useState<PairFightResult | null>(null)
  const onFight = {
    onSuccess: (result: PairFightResult) => {
      setSelected(null)
      setFight(result)
    },
    onError: (error: unknown) => showToast(errorMessage(error), 'failure'),
  }
  const ambush = useMutation({ mutationFn: () => postFight('/ambush'), ...onFight })
  const rematch = useMutation({
    mutationFn: (pair: string) => postFight('/rematch', { pair }),
    ...onFight,
  })
  const bait = useMutation({
    mutationFn: () => api<{ akatsuki: AkatsukiView }>(`${AKATSUKI_PATH}/bait`, { method: 'POST' }),
    onSuccess: ({ akatsuki }) => {
      queryClient.setQueryData(akatsukiKey, akatsuki)
      showToast('Zetsu spreads word of where you are...', 'success')
    },
    onError: (error) => showToast(errorMessage(error), 'failure'),
  })
  const claim = useMutation({
    mutationFn: (member: AkatsukiMember) =>
      api<AkatsukiClaimResult>(`${AKATSUKI_PATH}/claim`, { method: 'POST', body: { member } }),
    onSuccess: (result) => {
      queryClient.setQueryData(akatsukiKey, result.akatsuki)
      apply(result)
      showToast('Red outfit received!', 'success')
    },
    onError: (error) => showToast(errorMessage(error), 'failure'),
  })
  const busy = ambush.isPending || rematch.isPending || bait.isPending || claim.isPending

  if (fight) return <PairFight fight={fight} character={character} onDone={() => setFight(null)} />
  const data = view.data
  const member = MEMBERS.find((m) => m.key === selected)
  return (
    <Dialog title="Akatsuki Invasion" onClose={onClose} className="game-window-bare w-[1210px]">
      <section
        aria-label="Akatsuki Invasion"
        className="relative overflow-hidden font-[Arial,sans-serif] text-[#eee8f7]"
        style={{
          width: WIDTH,
          height: HEIGHT,
          background: `url(${ART}/background.webp) center / cover`,
        }}
      >
        {view.isPending && <p className="p-4">Loading the hunt...</p>}
        {view.error && <Notice tone="error">{errorMessage(view.error)}</Notice>}
        {data && (
          <>
            <Heading view={data} level={character.level} />
            <div className="absolute top-[4%] right-[3%] flex gap-2">
              <button type="button" className={BUTTON} onClick={onClose}>
                Leave
              </button>
            </div>
            {MEMBERS.map((art) =>
              data.members[art.key] === 'defeated' ? (
                <span
                  key={`${art.key}-glow`}
                  aria-hidden="true"
                  className="pointer-events-none absolute aspect-square w-[3.4%] -translate-1/2 rounded-full bg-[radial-gradient(circle,#f2d6ffee_0,#b14dffaa_35%,#7a1fd400_70%)] mix-blend-screen motion-safe:animate-pulse"
                  style={{
                    left: pct(art.finger.x, SCENE.width),
                    top: pct(art.finger.y, SCENE.height),
                  }}
                />
              ) : null,
            )}
            {MEMBERS.map((art) => (
              <Member
                key={art.key}
                art={art}
                view={data}
                selected={selected === art.key}
                onSelect={() => setSelected(selected === art.key ? null : art.key)}
              />
            ))}
            {member && (
              <section
                aria-label={member.name}
                className="absolute bottom-[6%] left-1/2 z-10 flex w-[360px] -translate-x-1/2 flex-col gap-2 rounded border border-[#9d708d] bg-[#1a1426f5] px-3.5 py-3 text-[13px] leading-normal"
              >
                <h3 className="text-[16px] font-semibold">{member.name}</h3>
                {member.key === 'zetsu' ? (
                  <ZetsuPanel
                    view={data}
                    busy={busy}
                    onFace={() => ambush.mutate()}
                    onBait={() => bait.mutate()}
                  />
                ) : (
                  <MemberPanel
                    art={member}
                    view={data}
                    busy={busy}
                    onClaim={() => claim.mutate(member.key)}
                    onRematch={(pair) => rematch.mutate(pair)}
                  />
                )}
                <button
                  type="button"
                  className={`${BUTTON} bg-transparent`}
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </section>
            )}
          </>
        )}
      </section>
    </Dialog>
  )
}

function Heading({ view, level }: { view: AkatsukiView; level: number }) {
  const hunting = view.pairs.find((pair) => pair.key === view.hunting)
  return (
    <header className="absolute top-[4%] left-[3%] border-l-[3px] border-[#c74e67] pl-4 [text-shadow:0_2px_8px_#100c1b]">
      <h3 className="my-[5px] text-[26px] leading-[1.1] font-semibold tracking-[.025em]">
        Akatsuki Invasion
      </h3>
      {!view.enabled ? (
        <p className="text-[13px] text-[#d3c8df]">The hunt is not active.</p>
      ) : (
        <>
          <p className="text-[13px] text-[#d3c8df]">
            Pairs defeated: {view.pairsDefeated} / {view.pairs.length}
          </p>
          <p className="text-[13px] text-[#d3c8df]">
            {level < view.minLevel
              ? `The Akatsuki only hunt ninjas of level ${view.minLevel} and above.`
              : hunting
                ? `Hunted by ${pairNames(hunting.members)}`
                : 'Nobody is hunting you... but someone is still watching.'}
          </p>
        </>
      )}
    </header>
  )
}

/** A member on the statue: the locked hologram, or their sprite feet-first on the finger. */
function Member({
  art,
  view,
  selected,
  onSelect,
}: {
  art: MemberArt
  view: AkatsukiView
  selected: boolean
  onSelect: () => void
}) {
  const status = (art.sprite && view.members[art.key]) || 'locked'
  const label =
    art.key === 'zetsu'
      ? 'Informant'
      : status === 'defeated'
        ? 'Defeated'
        : status === 'revealed'
          ? 'Hunting you'
          : 'Locked'
  const style: CSSProperties =
    status === 'locked'
      ? {
          left: pct(art.finger.x - art.image.footX, SCENE.width),
          top: pct(art.finger.y - art.image.footY, SCENE.height),
          width: pct(art.image.width, SCENE.width),
        }
      : {
          left: pct(art.finger.x, SCENE.width),
          top: pct(art.finger.y, SCENE.height),
          height: pct(1.15 * art.image.footY, SCENE.height),
          transform: 'translate(-50%, -100%)',
        }
  const glow =
    art.key === 'zetsu'
      ? 'drop-shadow-[0_0_6px_#9be37b99]'
      : status === 'defeated'
        ? 'sepia-[.35] saturate-[1.6] -hue-rotate-20 drop-shadow-[0_0_6px_#ff2442]'
        : status === 'revealed'
          ? 'drop-shadow-[0_0_6px_#e6d5ff99]'
          : ''
  return (
    <button
      type="button"
      aria-label={`${art.name}. ${label}`}
      aria-pressed={selected}
      data-status={art.key === 'zetsu' ? 'informant' : status}
      onClick={onSelect}
      className={`absolute cursor-pointer hover:z-[2] focus-visible:z-[2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#f5d2ff] ${selected ? 'z-[3]' : ''}`}
      style={style}
    >
      <img
        src={status === 'locked' ? `${ART}/locked/${art.key}.webp` : `${ART}/${art.sprite}.webp`}
        alt=""
        draggable={false}
        className={`block ${status === 'locked' ? 'h-auto w-full' : 'h-full w-auto'} ${glow} ${selected ? 'outline-2 outline-offset-2 outline-[#f5d2ff]' : ''}`}
      />
    </button>
  )
}

function ZetsuPanel({
  view,
  busy,
  onFace,
  onBait,
}: {
  view: AkatsukiView
  busy: boolean
  onFace: () => void
  onBait: () => void
}) {
  const names = (key: string | null) =>
    pairNames(view.pairs.find((pair) => pair.key === key)?.members ?? [])
  const until = view.bait.activeUntil
  return (
    <>
      <p>
        {view.pendingAmbush
          ? `"${names(view.pendingAmbush)} are waiting for you right now."`
          : view.hunting
            ? `"${names(view.hunting)} are hunting you. Win a field fight and they may strike."`
            : 'Nobody is hunting you... but someone is still watching.'}
      </p>
      {view.pendingAmbush && (
        <button type="button" className={BUTTON} disabled={busy} onClick={onFace}>
          Face them now
        </button>
      )}
      {view.hunting && (
        <>
          <p className="text-[12px] text-[#cbbcd8]">
            Ambush chance per field win: {view.ambushChancePercent}%
          </p>
          {until ? (
            <p className="text-[12px] text-[#cbbcd8]">
              Bait active until{' '}
              {new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <button
              type="button"
              className={BUTTON}
              disabled={busy || view.bait.usedToday}
              onClick={onBait}
            >
              {view.bait.usedToday
                ? 'Bait already used today'
                : 'Set bait: double ambush chance for 1 hour'}
            </button>
          )}
        </>
      )}
    </>
  )
}

function MemberPanel({
  art,
  view,
  busy,
  onClaim,
  onRematch,
}: {
  art: MemberArt
  view: AkatsukiView
  busy: boolean
  onClaim: () => void
  onRematch: (pair: string) => void
}) {
  if (art.key === 'obito') return <p>Something watches you from behind the mask...</p>
  const status = view.members[art.key] ?? 'locked'
  if (status === 'locked')
    return <p>Not met yet. They find you, not the other way around: keep winning field fights.</p>
  const pair = view.pairs.find((p) => p.members.includes(art.key))
  const claimed = view.claimed.includes(art.key)
  return (
    <>
      <p>{status === 'defeated' ? 'Defeated' : 'Hunting you'}</p>
      {status === 'defeated' && view.redOutfits[art.key] && (
        <button type="button" className={BUTTON} disabled={busy || claimed} onClick={onClaim}>
          {claimed ? 'Red outfit claimed' : 'Claim red outfit'}
        </button>
      )}
      {/* Ours: only a beaten pair can be fought again; the hunting one must find you. */}
      {status === 'defeated' && pair && (
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={() => onRematch(pair.key)}
        >
          Fight {pairNames(pair.members)}
        </button>
      )}
    </>
  )
}
