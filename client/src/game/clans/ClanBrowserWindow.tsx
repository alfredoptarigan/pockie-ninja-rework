// Reborn's Clan Browser (`Zh`, 720 wide): Refresh and Create, a clan table (Name / Level /
// Members / Leader / Action: Apply, Applied or Full), "Total: N" and a pager. The Clan window's
// Clans tab shows the same list read-only. We add a name search; Reborn's Power column is not
// shown (we have no clan power yet).
import { CLAN_MAX_MEMBERS, CLAN_MIN_LEVEL, CLAN_NAME_PATTERN } from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { Pager } from '../social/Pager'
import { Dialog, GameButton, Notice } from '../skin'
import { useOpenWindow, type WindowProps } from '../windows'
import { useClanAction, useClanList, useCreateInfo } from './api'

const CELL = 'px-1 py-[2px] text-center'

/** The clan table; `canApply` adds the Action column (the Clans tab hides it). */
export function ClanList({ canApply }: { canApply: boolean }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const list = useClanList(page, q)
  const apply = useClanAction()
  // Reborn marks the row at once and reverts it when the request fails.
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set())
  const send = (clanId: string) => {
    setSent((ids) => new Set(ids).add(clanId))
    apply.mutate(
      { path: 'apply', body: { clanId } },
      {
        onError: () => setSent((ids) => new Set([...ids].filter((id) => id !== clanId))),
      },
    )
  }
  const data = list.data
  return (
    <div className="flex flex-col gap-1 text-[12px] text-black">
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setQ(search.trim())
        }}
      >
        <GameButton small disabled={list.isFetching} onClick={() => list.refetch()}>
          {list.isFetching ? 'Loading...' : 'Refresh'}
        </GameButton>
        <label htmlFor="clan-search" className="ml-auto">
          Search
        </label>
        <input
          id="clan-search"
          value={search}
          maxLength={10}
          onChange={(event) => setSearch(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
          className="h-[22px] w-[120px] border border-black/40 bg-white px-1"
        />
        <GameButton small type="submit">
          Find
        </GameButton>
      </form>
      {list.isError && <Notice tone="error">{errorMessage(list.error)}</Notice>}
      {apply.isError && <Notice tone="error">{errorMessage(apply.error)}</Notice>}
      <table className="w-full border-collapse" aria-label="Clans">
        <thead>
          <tr className="game-title-plate h-[22px] text-white">
            <th className="px-1 text-left">Name</th>
            <th className={CELL}>Level</th>
            <th className={CELL}>Members</th>
            <th className={CELL}>Leader</th>
            {canApply && <th className={CELL}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {data?.clans.map((clan, index) => {
            const full = clan.members >= CLAN_MAX_MEMBERS
            const applied = clan.applied || sent.has(clan.id)
            return (
              <tr
                key={clan.id}
                aria-label={clan.name}
                className={`h-[22px] ${index % 2 ? 'game-value-box' : 'game-text-box'}`}
              >
                <td className="px-1 font-bold">{clan.name}</td>
                <td className={CELL}>{clan.level}</td>
                <td className={CELL}>
                  {clan.members}/{CLAN_MAX_MEMBERS}
                </td>
                <td className={CELL}>{clan.leader}</td>
                {canApply && (
                  <td className={CELL}>
                    <GameButton
                      small
                      disabled={full || applied || apply.isPending}
                      onClick={() => send(clan.id)}
                    >
                      {applied ? 'Applied' : full ? 'Full' : 'Apply'}
                    </GameButton>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {data && data.clans.length === 0 && <p className="py-4 text-center">No clans found</p>}
      {data && (
        <div className="flex items-center justify-between">
          <span>Total: {data.total}</span>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
          <span />
        </div>
      )}
    </div>
  )
}

/** Reborn's validation messages, in its order. */
function nameError(name: string) {
  if (name.length < 4) return 'Minimum 4 characters.'
  if (!CLAN_NAME_PATTERN.test(name)) return 'Invalid characters (A-Z 0-9).'
  return null
}

/** Create Clan (300 wide): name, cost (free the first time) and the level rule. */
export function CreateClan({ giftCoupon, onClose }: { giftCoupon: number; onClose: () => void }) {
  const [name, setName] = useState('')
  const info = useCreateInfo()
  const create = useClanAction()
  const openWindow = useOpenWindow()
  const error = name ? nameError(name) : null
  const affordable = info.data ? info.data.free || giftCoupon >= info.data.cost : false
  const busy = create.isPending
  const close = () => !busy && onClose()
  return (
    <Dialog title="Create Clan" onClose={close} className="w-[320px]">
      <form
        className="flex flex-col gap-2 text-[12px] text-black"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate({ path: 'create', body: { name } }, { onSuccess: () => openWindow('clan') })
        }}
      >
        <label htmlFor="clan-name" className="font-bold">
          Enter Clan Name
        </label>
        <div className="flex items-center gap-2">
          <input
            id="clan-name"
            value={name}
            maxLength={10}
            onChange={(event) => setName(event.target.value.replace(/\s+/g, ''))}
            aria-invalid={Boolean(error)}
            aria-describedby="clan-name-count"
            className="h-[22px] w-[240px] border border-black/40 bg-white px-1"
          />
          <span id="clan-name-count">{name.length}/10</span>
        </div>
        {error && <p className="text-[#a01010]">{error}</p>}
        {info.data && (
          <>
            <p className={affordable ? '' : 'text-[#a01010]'}>
              Cost to Create:{' '}
              {info.data.free ? 'Free (first clan)' : `${info.data.cost} Gift Certificates`}
            </p>
            <p className={info.data.levelOk ? '' : 'text-[#a01010]'}>
              Requires level {CLAN_MIN_LEVEL}+. Your first clan is free; later ones cost Gift
              Certificates.
            </p>
          </>
        )}
        {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
        <div className="flex justify-center gap-2">
          <GameButton
            type="submit"
            disabled={!name || Boolean(error) || !info.data?.levelOk || !affordable || busy}
          >
            Create
          </GameButton>
          <GameButton onClick={close} disabled={busy}>
            Cancel
          </GameButton>
        </div>
      </form>
    </Dialog>
  )
}

export function ClanBrowserWindow({ character, onClose }: WindowProps) {
  const [creating, setCreating] = useState(false)
  return (
    <Dialog title="Clan Browser" onClose={onClose} className="w-[740px]">
      <div className="flex flex-col gap-1">
        <div>
          <GameButton small onClick={() => setCreating(true)}>
            Create
          </GameButton>
        </div>
        <ClanList canApply />
      </div>
      {creating && (
        <CreateClan giftCoupon={character.giftCoupon} onClose={() => setCreating(false)} />
      )}
    </Dialog>
  )
}
