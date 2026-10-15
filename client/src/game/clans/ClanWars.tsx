// Reborn's Clan Wars (`Wu` @2767162, reborn-windows-A-L.md "Clan Wars"; 760 wide, parchment):
// the tab bar (War, My Fighter, Rankings, History, Info, Refresh), the status bar (Fighters,
// Rivals left today, Reset, Weekly reset) and toasts at the bottom. War: choose a rival, a size
// (5v5-20v20), both rosters and Attack Clan (leader) with the reward breakdown to confirm.
import type { InventoryItem } from '../types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import {
  CLAN_WAR_RULES,
  type ClanWarAttackResult,
  type ClanWarFighterView,
  type ClanWarHistoryView,
  type ClanWarMatchup,
  type ClanWarSize,
  type ClanWarStatus,
  type ClanWarTarget,
} from '../../../../shared/src/schemas/clan-wars'
import { api } from '../../lib/api'
import { errorMessage, useApplyResult, useInventory } from '../api'
import { ItemIcon } from '../ItemIcon'
import { itemName } from '../inventory/outfits'
import { Dialog, GameButton, Notice } from '../skin'
import { activityKeys, CLAN_EVENTS, useClanWarFighter, useClanWars } from './activities-api'
import { useNow } from './Training'

type Tab = 'attack' | 'fighter' | 'leaderboard' | 'history' | 'info'
const TABS: { id: Tab; label: string }[] = [
  { id: 'attack', label: 'War' },
  { id: 'fighter', label: 'My Fighter' },
  { id: 'leaderboard', label: 'Rankings' },
  { id: 'history', label: 'History' },
  { id: 'info', label: 'Info' },
]
const SETS = ['I', 'II', 'III', 'IV', 'V']
const SLOTS = [
  ['Outfit', 'Outfit'],
  ['Weapon', 'Weapon'],
  ['Glove', 'Gloves'],
  ['Pet', 'Pet'],
  ['Ring', 'Ring'],
  ['Amulet', 'Amulet'],
  ['Hat', 'Helmet'],
  ['Cloth', 'Armor'],
  ['Girdle', 'Belt'],
  ['Shoes', 'Shoes'],
  ['Wing', 'Wings'],
] as const
const CARD = 'rounded-md border border-[#8b6914] bg-[#fff9e5]/95 shadow-sm'

const fmt = (n: number) => Math.max(0, n).toLocaleString('en-US')

/** Reborn's timer: "Nd Nh Nm" beyond a day, else HH:MM:SS. */
function timer(iso: string, now: number) {
  const left = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000))
  const d = Math.floor(left / 86_400)
  const h = Math.floor((left % 86_400) / 3600)
  const m = Math.floor((left % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${h}h ${m}m` : `${pad(h)}:${pad(m)}:${pad(left % 60)}`
}

function Pose({ fighter, size }: { fighter: { clothing: number }; size: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded bg-black/10"
      style={{ width: size, height: size }}
    >
      <img
        src={`/assets/reborn/poses/${fighter.clothing}.webp`}
        alt=""
        className="size-full object-contain object-bottom"
      />
    </div>
  )
}

function TabButton({
  children,
  active,
  ...props
}: { children: ReactNode; active?: boolean } & Parameters<typeof GameButton>[0]) {
  return (
    <GameButton
      {...props}
      aria-pressed={active}
      className={`${active ? 'brightness-[1.18]' : 'opacity-80'} ${props.className ?? ''}`}
    >
      {children}
    </GameButton>
  )
}

function Roster({ title, fighters }: { title: string; fighters: ClanWarFighterView[] }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded border border-[#a9894b] bg-[#f8eac8]/70">
      <p className="h-[23px] bg-[#6f4c1b] text-center text-[10px] leading-[23px] font-bold text-[#fff0c5]">
        {title}
      </p>
      <ol aria-label={`${title} roster`} className="min-h-0 flex-1 overflow-y-auto">
        {fighters.map((f, i) => (
          <li
            key={f.characterId}
            aria-label={f.name}
            className="flex min-h-[31px] items-center border-b border-[#d1b982] px-1 text-[9px]"
          >
            <span className="w-[18px] font-bold text-[#8d6315]">{i + 1}</span>
            <Pose fighter={f} size={27} />
            <span className="ml-1 min-w-0">
              <b className="block max-w-[115px] truncate">{f.name}</b>
              <span className="text-[#765d35]">Lv.{f.level}</span>
            </span>
            <b className="ml-auto">{fmt(f.power)}</b>
          </li>
        ))}
        {fighters.length === 0 && (
          <li className="p-4 text-center text-[10px] text-[#846f4b]">No equipped fighters</li>
        )}
      </ol>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-[#b09153] bg-[#f9edcf] px-2 py-1 text-center">
      <p className="text-[9px] text-[#7a6039]">{label}</p>
      <p className="text-[13px] font-bold" style={{ color: color ?? '#50320d' }}>
        {value}
      </p>
    </div>
  )
}

const rateColor = (rate: number) => (rate < 100 ? '#a52b22' : rate > 100 ? '#237422' : '#6d4a12')

function WarTab({
  status,
  onAttack,
  busy,
}: {
  status: ClanWarStatus
  onAttack: (target: ClanWarTarget, size: ClanWarSize, matchup: ClanWarMatchup) => void
  busy: boolean
}) {
  const [search, setSearch] = useState('')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [size, setSize] = useState<ClanWarSize>(5)
  const shown = status.targets.filter((t) =>
    t.clanName.toLowerCase().includes(search.toLowerCase()),
  )
  const target = status.targets.find((t) => t.clanId === targetId) ?? status.targets[0] ?? null
  const matchup = target?.matchups[size]
  return (
    <div className="grid h-full grid-cols-[245px_1fr] gap-[10px]">
      <div className={`${CARD} flex min-h-0 flex-col p-2`}>
        <p className="mb-1 text-[13px] font-bold">Choose a rival clan</p>
        <input
          aria-label="Search clan"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search clan..."
          className="mb-2 h-6 border border-[#8b6914] bg-[#fff9e7] px-2 text-[11px]"
        />
        <ul aria-label="Rival clans" className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((t) => {
            const m = t.matchups[size]
            const selected = t.clanId === target?.clanId
            return (
              <li key={t.clanId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTargetId(t.clanId)}
                  className={`mb-1 w-full rounded px-2 py-[6px] text-left ${
                    selected
                      ? 'border-2 border-[#c88d0b] bg-[#ffe5a2]'
                      : 'border border-[#aa8b4e] bg-[#f6e8c6]'
                  }`}
                >
                  <span className="flex justify-between text-[12px] font-bold">
                    <span>{t.clanName}</span>
                    <span>Lv.{t.level}</span>
                  </span>
                  <span className="mt-[3px] flex justify-between text-[9px] text-[#715832]">
                    <span>{t.registeredFighters} equipped</span>
                    {t.attackedToday ? (
                      <b className="text-[#9b241d]">Attacked today</b>
                    ) : (
                      <span>
                        {m.available ? `${m.rewardPercent}% rewards` : 'Roster too small'}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 && (
            <li className="p-5 text-center text-[11px] text-[#806f52]">No rival clans found.</li>
          )}
        </ul>
      </div>
      <div className={`${CARD} flex min-h-0 min-w-0 flex-col p-[10px]`}>
        {!target || !matchup ? (
          <p className="m-auto">Select a rival clan.</p>
        ) : (
          <>
            <div className="mb-2 flex items-center">
              <div>
                <p className="text-[16px] font-bold">{target.clanName}</p>
                <p className="text-[10px] text-[#765d35]">
                  Record {target.wins}W - {target.losses}L | {target.registeredFighters} saved
                  fighters
                </p>
              </div>
              <p className="ml-auto text-right text-[10px]">
                Registered BP
                <br />
                <b className="text-[14px]">{fmt(target.totalRegisteredPower)}</b>
              </p>
            </div>
            <p className="mb-1 text-[11px] font-bold">War size</p>
            <div className="mb-2 flex gap-[6px]" role="group" aria-label="War size">
              {status.sizes.map((s) => (
                <TabButton
                  key={s}
                  active={size === s}
                  disabled={!target.matchups[s].available}
                  onClick={() => setSize(s)}
                  className="w-[84px]"
                >
                  {s}v{s}
                </TabButton>
              ))}
            </div>
            {matchup.available ? (
              <div className="mb-2 grid grid-cols-3 gap-[6px]">
                <Stat label="Your roster BP" value={fmt(matchup.ownPower)} />
                <Stat label="Rival roster BP" value={fmt(matchup.targetPower)} />
                <Stat
                  label="Your reward rate"
                  value={`${matchup.rewardPercent}%`}
                  color={rateColor(matchup.rewardPercent)}
                />
              </div>
            ) : (
              <p className="mb-2 border border-[#9a3024] bg-[#ad332422] p-[10px] text-[11px]">
                Both clans need enough equipped fighters for this size.
              </p>
            )}
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden">
              <Roster
                title={status.myClan.clanName}
                fighters={status.myClan.roster.slice(0, size)}
              />
              <Roster title={target.clanName} fighters={target.roster.slice(0, size)} />
            </div>
            <div className="flex items-center justify-between pt-[7px]">
              <p className="max-w-[340px] text-[9px] text-[#765d35]">
                The strongest saved fighters fill the roster. Fighters are paired by rank: #1 vs #1,
                #2 vs #2, and so on. More duel wins takes the war.
              </p>
              <GameButton
                className="h-[30px] w-[145px] text-[12px] font-bold"
                disabled={busy || !status.canStartWar || target.attackedToday || !matchup.available}
                onClick={() => onAttack(target, size, matchup)}
              >
                {status.canStartWar
                  ? target.attackedToday
                    ? 'Attacked Today'
                    : 'Attack Clan'
                  : 'Leader Only'}
              </GameButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const wornIn = (items: InventoryItem[], set: number) =>
  items.filter((item) => item.equippedSlot && (item.equippedSet ?? 1) === set)

function FighterTab({
  status,
  onDone,
}: {
  status: ClanWarStatus
  onDone: (text: string, bad?: boolean) => void
}) {
  const inventory = useInventory()
  const save = useClanWarFighter()
  const [set, setSet] = useState(status.fighter?.set ?? 1)
  const items = inventory.data ?? []
  const hasOutfit = (n: number) => wornIn(items, n).some((item) => item.equippedSlot === 'Outfit')
  const worn = wornIn(items, set)
  const outfit = worn.find((item) => item.equippedSlot === 'Outfit')
  const run = (value: number | null, text: string) =>
    save.mutate(value, {
      onSuccess: () => onDone(text),
      onError: (error) => onDone(errorMessage(error), true),
    })
  return (
    <div className="grid h-full grid-cols-[210px_1fr] gap-[10px]">
      <div className={`${CARD} p-3`}>
        <p className="mb-2 text-[14px] font-bold">Clan War character slot</p>
        <p className="mb-3 text-[10px] leading-normal">
          Every clan member fights in Clan Wars: equipment set I is registered automatically. Pick
          another set to change your fighter. Later personal set changes do not replace the saved
          fighter until you save again.
        </p>
        {status.fighter ? (
          <div
            aria-label="Saved fighter"
            className="flex items-center rounded-md border-2 border-[#5b8d2a] bg-[#e2f0c8] p-2"
          >
            <Pose fighter={status.fighter} size={58} />
            <div className="ml-2">
              <p className="text-[11px] font-bold">{status.fighter.name}</p>
              <p className="text-[10px]">Set {SETS[status.fighter.set - 1]}</p>
              <p className="text-[13px] font-bold text-[#336d20]">{fmt(status.fighter.power)} BP</p>
            </div>
          </div>
        ) : (
          <p className="rounded-md border-2 border-dashed border-[#9d7540] p-4 text-center text-[11px] text-[#81653d]">
            No fighter yet.
            <br />
            Put an outfit on equipment set I (or save another set) to join the war roster.
          </p>
        )}
        {status.fighter && (
          <GameButton
            small
            className="mt-2"
            disabled={save.isPending}
            onClick={() => run(null, 'Your Clan War fighter was removed.')}
          >
            Remove
          </GameButton>
        )}
      </div>
      <div className={`${CARD} flex flex-col p-3`}>
        <div className="mb-2 flex items-center">
          <b className="text-[13px]">Select equipment set</b>
          <span className="ml-auto text-[9px] text-[#7b633e]">
            Equip items in Inventory, then save here.
          </span>
        </div>
        <div className="mb-2 flex gap-2" role="group" aria-label="Equipment set">
          {SETS.map((label, i) => (
            <TabButton
              key={label}
              active={set === i + 1}
              disabled={!hasOutfit(i + 1)}
              onClick={() => setSet(i + 1)}
              className="w-[66px]"
            >
              {label}
            </TabButton>
          ))}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[7px] border-2 border-[#8b6914] bg-[radial-gradient(circle_at_50%_45%,#fff5d4,#c9a563)]">
          {outfit ? (
            <ul
              aria-label="Set equipment"
              className="grid h-full grid-cols-6 content-start gap-1 p-2"
            >
              {SLOTS.map(([slot, label]) => {
                const item = worn.find((w) => w.equippedSlot === slot)
                return (
                  <li
                    key={slot}
                    title={label}
                    className="grid h-[48px] place-items-center rounded border border-[#86621d] bg-[#efe0b9]/80"
                  >
                    {item ? (
                      <ItemIcon itemId={item.itemId} name={itemName(item)} className="size-9" />
                    ) : (
                      <span className="text-[8px] text-[#8a7552]">{label}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="absolute inset-0 grid place-items-center font-bold text-[#80663d]">
              This equipment set has no outfit.
            </p>
          )}
        </div>
        <div className="flex justify-center pt-2">
          <GameButton
            className="h-[30px] w-[185px] text-[12px] font-bold"
            disabled={save.isPending || !outfit}
            onClick={() =>
              run(set, `Equipment Set ${SETS[set - 1]} is now your saved Clan War fighter.`)
            }
          >
            {status.fighter ? 'Update Saved Fighter' : 'Equip Clan Fighter'}
          </GameButton>
        </div>
      </div>
    </div>
  )
}

const WEEKLY_REWARDS = [
  [
    '1st',
    `${CLAN_WAR_RULES.weeklyFreeEntries[0]}x Clan Boss Free Entry for Clan Missions`,
    '#c38b0b',
  ],
  ['2nd', `${CLAN_WAR_RULES.weeklyFreeEntries[1]}x Clan Boss Free Entry for Clan Missions`, '#777'],
  [
    '3rd',
    `${CLAN_WAR_RULES.weeklyFreeEntries[2]}x Clan Boss Free Entry for Clan Missions`,
    '#925426',
  ],
] as const

function RankingsTab({ status, now }: { status: ClanWarStatus; now: number }) {
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly')
  const board = status[period]
  return (
    <div className={`grid h-full gap-[10px] ${period === 'weekly' ? 'grid-cols-[1fr_235px]' : ''}`}>
      <div className={`${CARD} flex min-h-0 flex-col p-[10px]`}>
        <div className="mb-2 flex items-center gap-1">
          <TabButton active={period === 'weekly'} onClick={() => setPeriod('weekly')}>
            Weekly
          </TabButton>
          <TabButton active={period === 'monthly'} onClick={() => setPeriod('monthly')}>
            Monthly
          </TabButton>
          <span className="ml-auto text-[10px]">
            Ends in <b>{timer(board.endsAt, now)}</b>
          </span>
        </div>
        <table
          aria-label={`${period === 'weekly' ? 'Weekly' : 'Monthly'} standings`}
          className="w-full text-left text-[10px] [&_td]:px-2 [&_th]:px-2"
        >
          <thead>
            <tr className="h-[22px] bg-[#5b3d1b] text-[9px] font-bold text-[#fff0c7]">
              <th className="w-[45px]">Rank</th>
              <th>Clan</th>
              <th className="w-[70px]">Wins</th>
              <th className="w-[80px]">KOs</th>
              <th className="w-[95px]">Defeated BP</th>
            </tr>
          </thead>
          <tbody>
            {board.standings.map((row) => (
              <tr
                key={row.clanId}
                aria-label={row.clanName}
                className={`h-[28px] border-b border-[#d1b982] ${
                  row.clanId === status.myClan.clanId
                    ? 'bg-[#ffe29a]'
                    : row.rank <= 3
                      ? 'bg-[#f4e1ad]'
                      : ''
                }`}
              >
                <td className="font-bold">#{row.rank}</td>
                <td className="font-bold">{row.clanName}</td>
                <td>
                  {row.wins}W / {row.losses}L
                </td>
                <td>{row.knockouts}</td>
                <td>{fmt(row.defeatedPower)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {board.standings.length === 0 && (
          <p className="p-8 text-center text-[#806f52]">No completed wars in this period.</p>
        )}
        <p className="mt-auto pt-2 text-[9px] text-[#725c39]">
          Ties: wins, then fighter knockouts, defeated BP, fewer losses, then clan ID. Monthly
          standings reset each calendar month.
        </p>
      </div>
      {period === 'weekly' && (
        <div className={`${CARD} p-[10px]`}>
          <p className="mb-2 text-center text-[13px] font-bold">Weekly Top Clan Rewards</p>
          {WEEKLY_REWARDS.map(([rank, text, color]) => (
            <p
              key={rank}
              className="mb-[6px] flex gap-2 rounded-[5px] border bg-[#fff1cc] p-[7px] text-[10px]"
              style={{ borderColor: color }}
            >
              <b className="min-w-[28px]" style={{ color }}>
                {rank}
              </b>
              {text}
            </p>
          ))}
          <p className="mt-2 text-[9px] leading-normal text-[#715832]">
            Free Entries start a Clan Missions boss without its cost or the daily limit. Rewards are
            delivered after Monday&apos;s reset (00:00 UTC).
          </p>
        </div>
      )}
    </div>
  )
}

function outcome(war: ClanWarHistoryView) {
  if (war.winner === war.myClan.clanId) return { text: 'VICTORY', color: '#24721f' }
  if (war.winner === null) return { text: 'DRAW', color: '#756a55' }
  return { text: 'DEFEAT', color: '#9a251d' }
}

function HistoryTab({ wars }: { wars: ClanWarHistoryView[] }) {
  return (
    <div className={`${CARD} h-full overflow-y-auto p-[10px]`}>
      <p className="mb-2 text-[14px] font-bold">Recent Clan Wars</p>
      <ul aria-label="Recent Clan Wars">
        {wars.map((war) => {
          const result = outcome(war)
          return (
            <li
              key={war.warId}
              aria-label={`${result.text} against ${war.enemyClan.clanName}`}
              className="mb-[7px] rounded-[5px] border border-[#aa8a50] bg-[#f8e9c7] p-2"
            >
              <p className="flex items-center text-[11px]">
                <b className="w-[62px]" style={{ color: result.color }}>
                  {result.text}
                </b>
                <b>{war.myClan.clanName}</b>
                <span className="mx-[6px]">vs</span>
                <b>{war.enemyClan.clanName}</b>
                <span className="ml-auto">
                  {war.size}v{war.size} | {new Date(war.endedAt).toLocaleString()}
                </span>
              </p>
              <div className="mt-[6px] grid grid-cols-2 gap-2 text-[9px]">
                {[war.myClan, war.enemyClan].map((side) => (
                  <p key={side.clanId} className="border border-[#d0b77e] bg-[#fff6df] p-[6px]">
                    <b>
                      {side.clanName}: {side.knockouts} KOs ({side.rewardPercent}%)
                    </b>
                    <br />
                    {fmt(side.gcReward)} GC | {fmt(side.expReward)} Clan EXP
                    {side.stoneBonus > 0 && ` | ${fmt(side.stoneBonus)} Stones`}
                    {side.giftCertificateBonus > 0 &&
                      ` | ${fmt(side.giftCertificateBonus)} bonus GC`}
                  </p>
                ))}
              </div>
              <p className="mt-[5px] truncate text-[9px] text-[#705936]">
                {war.duels.some((d) => d.winner !== 'none')
                  ? war.duels
                      .filter((d) => d.winner !== 'none')
                      .map((d) =>
                        d.winner === 'attacker'
                          ? `${d.attacker.name} > ${d.defender.name}`
                          : `${d.defender.name} > ${d.attacker.name}`,
                      )
                      .join(' | ')
                  : 'No knockouts recorded.'}
              </p>
            </li>
          )
        })}
      </ul>
      {wars.length === 0 && (
        <p className="p-12 text-center text-[#806f52]">
          No direct Clan Wars have been completed yet.
        </p>
      )}
    </div>
  )
}

const RULES: [string, string][] = [
  [
    'Saved fighters',
    'Every clan member chooses one of their equipped character sets and saves it as a separate Clan War fighter. Only saved fighters count toward roster sizes. Saving again refreshes the snapshot; normal equipment changes do not silently replace it.',
  ],
  [
    'Direct wars',
    'The clan leader can attack any eligible rival immediately without approval or online defenders. A clan may attack each rival clan once per day (00:00 UTC), so every clan can attack every other clan once a day; being attacked does not consume any of its own attacks. Choose 5v5, 10v10, 15v15, or 20v20. A size stays gray until both clans have enough saved fighters.',
  ],
  [
    'Paired duels',
    'Rosters use the strongest saved fighters first and are paired by rank: #1 fights #1, #2 fights #2, and so on. Every duel is a fresh 1v1 at full HP. The clan that wins more duels wins the war; equal duel wins is a draw. A duel where both fighters fall counts for neither side.',
  ],
  [
    'Rewards per knockout',
    `At an even matchup, every duel win is a knockout that adds ${fmt(CLAN_WAR_RULES.gcPerKnockout)} GC to clan storage and ${fmt(CLAN_WAR_RULES.expPerKnockout)} Clan EXP. The winning fighter always receives ${fmt(CLAN_WAR_RULES.bankaiCoinsPerWin)} Bankai Coins, including offline fighters.`,
  ],
  [
    'Battle Power scaling',
    'Matchups within 10% BP pay 100%. Attacking a weaker roster smoothly reduces all currency, EXP and bonus rates to a 35% floor. Defeating a stronger roster increases them gradually up to 150%. The exact rate is shown to the leader before confirmation. Each clan uses its own fair rate, so a weaker defending clan can earn increased rewards too.',
  ],
  [
    'Complete-war bonus',
    `Only the war winner rolls a base ${CLAN_WAR_RULES.stoneBonusChance}% chance for ${fmt(CLAN_WAR_RULES.stoneBonus)} Stones and a base ${CLAN_WAR_RULES.giftCertificateBonusChance}% chance for ${fmt(CLAN_WAR_RULES.giftCertificateBonus)} extra GC in clan storage. These chances use the same matchup rate. The losing clan keeps all rewards earned from its fighter knockouts.`,
  ],
  [
    'Rankings',
    "Weekly and monthly boards rank complete war wins. Ties use knockouts, defeated BP, fewer losses, then clan ID. Weekly Top 3 rewards are delivered after Monday's reset (00:00 UTC); monthly standings reset on the first day of each month.",
  ],
]

function InfoTab() {
  return (
    <div
      className={`${CARD} h-full overflow-y-auto px-[18px] py-[14px] text-[11px] leading-[1.55]`}
    >
      <h3 className="mb-2 text-center font-bold text-[#6d470b]">Clan Wars - Rules and Rewards</h3>
      {RULES.map(([title, text]) => (
        <div key={title} className="mb-[9px]">
          <p className="font-bold text-[#9a6509]">{title}</p>
          <p>{text}</p>
        </div>
      ))}
    </div>
  )
}

function ConfirmAttack({
  target,
  size,
  matchup,
  busy,
  onCancel,
  onConfirm,
}: {
  target: ClanWarTarget
  size: ClanWarSize
  matchup: ClanWarMatchup
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const d = matchup.differencePercent
  const line =
    d < -10
      ? `${target.clanName} is ${Math.abs(d)}% weaker. Rewards are reduced.`
      : d > 10
        ? `${target.clanName} is ${d}% stronger. Rewards are increased.`
        : 'The rosters are closely matched. Full base rewards apply.'
  return (
    <Dialog title={`Attack ${target.clanName}?`} onClose={onCancel} className="w-[430px]">
      <p className="mb-2 text-center text-[11px]">
        {size}v{size} paired duels - this uses today&apos;s attack against {target.clanName}.
      </p>
      <p
        className="border border-[#8b6914] p-2 text-[10px] leading-[1.55]"
        style={{
          background:
            matchup.rewardPercent < 100
              ? '#f5c8bc'
              : matchup.rewardPercent > 100
                ? '#d9edc5'
                : '#f7e8bd',
        }}
      >
        <b>{line}</b>
        <br />
        Your roster: {fmt(matchup.ownPower)} BP | Rival: {fmt(matchup.targetPower)} BP
        <br />
        <b>Your reward rate: {matchup.rewardPercent}%</b> (defender: {matchup.defenderRewardPercent}
        %)
        <br />
        Per knockout: {fmt(matchup.gcPerKnockout)} GC + {fmt(matchup.expPerKnockout)} Clan EXP, plus{' '}
        {fmt(CLAN_WAR_RULES.bankaiCoinsPerWin)} Bankai Coins for the winning fighter
        <br />
        Winner bonus chances: {matchup.stoneBonusChancePercent}% /{' '}
        {matchup.giftCertificateBonusChancePercent}%
      </p>
      <div className="mt-3 flex justify-center gap-[10px]">
        <GameButton onClick={onCancel}>Cancel</GameButton>
        <GameButton disabled={busy} onClick={onConfirm} className="font-bold">
          Confirm Attack
        </GameButton>
      </div>
    </Dialog>
  )
}

export function ClanWarsWindow({ onClose }: { onClose: () => void }) {
  const wars = useClanWars()
  const queryClient = useQueryClient()
  const apply = useApplyResult()
  const now = useNow()
  const [tab, setTab] = useState<Tab>('attack')
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
  const [confirm, setConfirm] = useState<{
    target: ClanWarTarget
    size: ClanWarSize
    matchup: ClanWarMatchup
  } | null>(null)
  const attack = useMutation({
    mutationFn: (input: { targetClanId: string; size: ClanWarSize }) =>
      api<ClanWarAttackResult>(`${CLAN_EVENTS}/wars/attack`, { method: 'POST', body: input }),
    onSuccess: (result) => {
      queryClient.setQueryData(activityKeys.wars, result.status)
      apply(result)
      const { text } = outcome(result.war)
      setToast({ text: `${text}: war complete against ${result.war.enemyClan.clanName}.` })
      setTab('history')
    },
    onError: (error) => setToast({ text: errorMessage(error), bad: true }),
  })
  const status = wars.data
  return (
    <Dialog title="Clan Wars" onClose={onClose} className="w-[760px]">
      {wars.isError && <Notice tone="error">{errorMessage(wars.error)}</Notice>}
      <div className="relative h-[min(520px,calc(100vh-120px))] overflow-hidden bg-linear-135 from-[#f2dfb6] to-[#c69d54] text-[#25180d]">
        <div className="flex h-[40px] items-center gap-[5px] border-b-2 border-[#987129] bg-linear-to-b from-[#3a2818] to-[#1b120a] px-3">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
              className={t.id === 'fighter' ? 'w-[104px]' : 'w-[86px]'}
            >
              {t.label}
            </TabButton>
          ))}
          <GameButton className="ml-auto w-[74px]" onClick={() => void wars.refetch()}>
            Refresh
          </GameButton>
        </div>
        <div className="flex h-[38px] items-center gap-[18px] border-b border-[#9c7b3c] bg-[#fff6da]/90 px-4 text-[11px] font-bold">
          <span>
            Fighters: <b className="text-[#784f08]">{status?.myClan.registeredFighters ?? 0}</b>
          </span>
          <span>
            Rivals left today:{' '}
            <b className={status?.attacksRemaining ? 'text-[#267322]' : 'text-[#9b241d]'}>
              {status?.attacksRemaining ?? 0}
            </b>
          </span>
          <span>
            Reset: <b>{status ? timer(status.nextDailyReset, now) : '--:--:--'}</b>
          </span>
          <span className="ml-auto">
            Weekly reset: <b>{status ? timer(status.weekly.endsAt, now) : '--'}</b>
          </span>
        </div>
        <div className="absolute inset-x-0 top-[78px] bottom-0 min-h-0 p-[10px]">
          {!status ? (
            <p className="grid h-full place-items-center font-bold">Loading Clan Wars...</p>
          ) : (
            <>
              {/* Kept mounted so the chosen rival and size survive a tab switch. */}
              <div hidden={tab !== 'attack'} className="h-full">
                <WarTab
                  status={status}
                  busy={attack.isPending}
                  onAttack={(target, size, matchup) => setConfirm({ target, size, matchup })}
                />
              </div>
              {tab === 'fighter' && (
                <FighterTab status={status} onDone={(text, bad) => setToast({ text, bad })} />
              )}
              {tab === 'leaderboard' && <RankingsTab status={status} now={now} />}
              {tab === 'history' && <HistoryTab wars={status.history} />}
              {tab === 'info' && <InfoTab />}
            </>
          )}
        </div>
        {toast && (
          <button
            type="button"
            role="status"
            onClick={() => setToast(null)}
            className={`absolute inset-x-[120px] bottom-[10px] z-30 rounded-[5px] px-3 py-2 text-center text-[11px] font-bold text-white shadow-[0_3px_10px_#0008] ${
              toast.bad ? 'bg-[#8e261f]' : 'bg-[#2f6f25]'
            }`}
          >
            {toast.text}
          </button>
        )}
      </div>
      {confirm && (
        <ConfirmAttack
          {...confirm}
          busy={attack.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            attack.mutate({ targetClanId: confirm.target.clanId, size: confirm.size })
          }}
        />
      )}
    </Dialog>
  )
}
