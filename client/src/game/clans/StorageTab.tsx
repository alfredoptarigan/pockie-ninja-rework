// The Clan window's Storage tab, currencies only: the treasury, Reborn's "Donate Stones / Gold /
// Gift Certificates" windows (amount, then "Confirm your donation?"), Withdraw Currency (leader:
// To Self / To Member / Split All) and the weekly Contribution Leaderboard. Item storage is not
// built.
import {
  contributionPoints,
  type ClanCurrency,
  type ClanView,
  type ClanWithdrawInput,
} from '@pockie/shared'
import { useState } from 'react'
import { errorMessage } from '../api'
import { Dialog, GameButton, Notice } from '../skin'
import { useClanAction } from './api'

const NAMES: Record<ClanCurrency, string> = {
  stone: 'Stones',
  gold: 'Gold',
  giftCoupon: 'Gift Certificates',
}
const SHORT: Record<ClanCurrency, string> = { stone: 'Stones', gold: 'Gold', giftCoupon: 'Certs' }
const CURRENCIES: ClanCurrency[] = ['stone', 'gold', 'giftCoupon']
const parseAmount = (text: string) => (/^\d+$/.test(text) ? Number(text) : 0)

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      aria-label="Amount"
      inputMode="numeric"
      placeholder="Amount..."
      value={value}
      maxLength={10}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      className="h-[22px] w-full border border-black/40 bg-white px-1"
    />
  )
}

function DonateDialog({ currency, onClose }: { currency: ClanCurrency; onClose: () => void }) {
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const donate = useClanAction()
  const amount = parseAmount(text)
  const name = NAMES[currency]
  return (
    <Dialog title={`Donate ${name}`} onClose={onClose} className="w-[300px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        <p>Enter amount to donate</p>
        <AmountInput value={text} onChange={setText} />
        {donate.isError && <Notice tone="error">{errorMessage(donate.error)}</Notice>}
        <div className="flex justify-center gap-2">
          <GameButton disabled={amount <= 0} onClick={() => setConfirming(true)}>
            Donate
          </GameButton>
          <GameButton onClick={onClose}>Cancel</GameButton>
        </div>
      </div>
      {confirming && (
        <Dialog
          title="Confirm your donation?"
          onClose={() => setConfirming(false)}
          className="w-[320px]"
        >
          <div className="flex flex-col gap-2 text-[12px] text-black">
            <p>
              Donate {amount.toLocaleString('en-US')} {name} to the clan treasury for +
              {contributionPoints(currency, amount)} contribution points?
            </p>
            <div className="flex justify-center gap-2">
              <GameButton
                disabled={donate.isPending}
                onClick={() =>
                  donate.mutate(
                    { path: 'donate', body: { currency, amount } },
                    { onSuccess: onClose, onSettled: () => setConfirming(false) },
                  )
                }
              >
                {donate.isPending ? 'Processing' : 'Confirm'}
              </GameButton>
              <GameButton onClick={() => setConfirming(false)}>Cancel</GameButton>
            </div>
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}

type Mode = ClanWithdrawInput['mode']
const MODES: { mode: Mode; label: string; caption: string }[] = [
  { mode: 'self', label: 'To Self', caption: 'Withdraw to yourself' },
  { mode: 'member', label: 'To Member', caption: 'Send to a clan member' },
  { mode: 'all', label: 'Split All', caption: 'Split equally to all members' },
]

function WithdrawDialog({
  clan,
  selfId,
  onClose,
}: {
  clan: ClanView
  selfId: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>('self')
  const [target, setTarget] = useState<string | null>(null)
  const [text, setText] = useState('')
  const withdraw = useClanAction()
  const amount = parseAmount(text)
  const others = clan.members.filter((m) => m.characterId !== selfId)
  const send = (currency: ClanCurrency) => {
    if (amount <= 0) return
    const body =
      mode === 'member'
        ? { mode, currency, amount, characterId: target }
        : { mode, currency, amount }
    withdraw.mutate({ path: 'withdraw', body })
  }
  return (
    <Dialog title="Withdraw Currency" onClose={onClose} className="w-[360px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        <div role="radiogroup" aria-label="Withdraw mode" className="flex gap-1">
          {MODES.map((m) => (
            <GameButton
              key={m.mode}
              small
              role="radio"
              aria-checked={mode === m.mode}
              className={mode === m.mode ? '' : 'opacity-60'}
              onClick={() => setMode(m.mode)}
            >
              {m.label}
            </GameButton>
          ))}
        </div>
        <p>{MODES.find((m) => m.mode === mode)!.caption}</p>
        {mode === 'member' &&
          (others.length === 0 ? (
            <p>No other members</p>
          ) : (
            <ul aria-label="Members" className="max-h-[120px] overflow-auto">
              {others.map((m) => (
                <li key={m.characterId}>
                  <button
                    type="button"
                    aria-pressed={target === m.characterId}
                    onClick={() => setTarget(m.characterId)}
                    className={`w-full px-1 text-left ${target === m.characterId ? 'bg-black/15 font-bold' : ''}`}
                  >
                    {m.name} - {m.online ? 'Online' : 'Offline'}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        <AmountInput value={text} onChange={setText} />
        {mode === 'all' && (
          <p>
            Each member gets: {Math.floor(amount / clan.members.length).toLocaleString('en-US')}
          </p>
        )}
        <p>
          Available: Stones: {clan.stone} | Gold: {clan.gold} | Certs: {clan.giftCoupon}
        </p>
        {withdraw.isError && <Notice tone="error">{errorMessage(withdraw.error)}</Notice>}
        {withdraw.isSuccess && <Notice>Done.</Notice>}
        <div className="flex justify-center gap-1">
          {CURRENCIES.map((currency) => (
            <GameButton
              key={currency}
              small
              disabled={withdraw.isPending || (mode === 'member' && !target)}
              onClick={() => send(currency)}
            >
              {SHORT[currency]}
            </GameButton>
          ))}
        </div>
        <div className="flex justify-center">
          <GameButton small onClick={onClose}>
            Close
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

const MEDALS = ['#d4a017', '#9a9a9a', '#b0703a']

function Leaderboard({ clan, onClose }: { clan: ClanView; onClose: () => void }) {
  const rows = clan.members
    .filter((m) => m.weeklyPoints > 0)
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
  return (
    <Dialog title="Contribution Leaderboard" onClose={onClose} className="w-[340px]">
      <div className="flex flex-col gap-2 text-[12px] text-black">
        <h3 className="font-bold">Weekly Contributions (Resets Monday)</h3>
        {rows.length === 0 ? (
          <p>No contributions this week</p>
        ) : (
          <table className="w-full" aria-label="Weekly contributions">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Member</th>
                <th className="text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, index) => (
                <tr key={m.characterId} aria-label={m.name}>
                  <td style={{ color: MEDALS[index] }}>{index + 1}</td>
                  <td className={index < 3 ? 'font-bold' : ''}>{m.name}</td>
                  <td className="text-right text-[#1f7a1f]">{m.weeklyPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-center">
          <GameButton small onClick={onClose}>
            Close
          </GameButton>
        </div>
      </div>
    </Dialog>
  )
}

export function StorageTab({ clan, selfId }: { clan: ClanView; selfId: string }) {
  const [donating, setDonating] = useState<ClanCurrency | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [board, setBoard] = useState(false)
  return (
    <div className="flex gap-3 text-[12px] text-black">
      <section aria-label="Treasury" className="game-panel-1 flex-1 p-2">
        <h3 className="font-bold">Treasury</h3>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1">
          {CURRENCIES.map((currency) => (
            <div key={currency} className="contents">
              <dt>{NAMES[currency]}</dt>
              <dd>{clan[currency].toLocaleString('en-US')}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="flex w-[210px] flex-col gap-1">
        <h3 className="font-bold">Donate</h3>
        {CURRENCIES.map((currency) => (
          <GameButton key={currency} onClick={() => setDonating(currency)}>
            Donate {NAMES[currency]}
          </GameButton>
        ))}
        {clan.myRole === 'leader' && (
          <GameButton onClick={() => setWithdrawing(true)}>Withdraw Currency</GameButton>
        )}
        <GameButton onClick={() => setBoard(true)}>Leaderboard</GameButton>
      </div>
      {donating && <DonateDialog currency={donating} onClose={() => setDonating(null)} />}
      {withdrawing && (
        <WithdrawDialog clan={clan} selfId={selfId} onClose={() => setWithdrawing(false)} />
      )}
      {board && <Leaderboard clan={clan} onClose={() => setBoard(false)} />}
    </div>
  )
}
