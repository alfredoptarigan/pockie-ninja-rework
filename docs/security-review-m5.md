# M5 security review

Reviewed on 2026-10-14 against `63d11920` (M5 tasks 1-14 merged). The review covers every M5 route:
`server/src/modules/talents/*`, `server/src/modules/bloodlines/*` (limits, turn-ins, souls and
prayer), scroll skills (`server/src/modules/game/skills.ts`, `server/src/game/skill-bar.ts` and
the item-use path in `modules/game/actions.ts`), `server/src/modules/events/*` (Daily Login,
Weekly Rewards, Dice of Fate, Twenty-Minute Reward), `server/src/modules/tailed-beast/*`,
`server/src/modules/team-stone/*`, the M5 jobs in `server/src/jobs.ts`, and the hooks M5 added to
older routes: the limit item and scroll drops of the pub fight (`modules/gates/pub-fights.ts`), the
Reborn quest commands (forge, arena, Las Noches, bloodline unlock) and the Weekly Rewards activity
counters (arena, duels, pub fights solo and team, Las Noches, toll gates, daily quests, world chat,
twenty-minute reward).

Checked per route: authentication, the rate limit entry, zod bounds on ids, counts and enums, the
lock order (character row first, then the feature rows by id), dupes and double claims under
concurrent requests, daily and weekly cap races, every Gold, Stone, Gift Coupon, Battle Coin and
Essence path (can it go negative, can it be minted), full-bag handling (refused before anything
moves, or lost and reported), the shared Tailed Beast HP pool, two overlapping runs of each M5 job,
and IDOR on every id a client sends. Each fixed finding has a failing test written first in
`server/src/modules/security-m5.api.test.ts`, then the smallest change.

| Severity | Count | Findings                                                                                              |
| -------- | ----: | ----------------------------------------------------------------------------------------------------- |
| Critical |     0 | None identified                                                                                       |
| High     |     0 | None identified                                                                                       |
| Medium   |     1 | The Team Stone Battle Coin shop skipped the Honor shop's arena rank gate                              |
| Low      |     2 | The weekly league mail named items a full bag dropped; a mid-week month change pays a week twice      |
| Info     |     4 | Essence is weekly; no Tailed Beast level gate; team pub fights drop no limit items; locking GET polls |

## Status (2026-10-14)

| Finding                                                           | Status                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Medium: the BC shop sold rank-gated Honor shop items to anyone | Fixed (`fix: gate the Team Stone Battle Coin shop by arena rank`): the buy checks the arena tier like the Honor shop.          |
| 2. Low: the weekly league mail listed items lost to a full bag    | Fixed (`fix: name only the delivered items in the Team Stone weekly mail`): the mail counts what `grantItems` kept.            |
| 3. Low: a month change mid-week can pay that week a second time   | Open: needs a paid-week column (a migration). Bounded to one extra league pay per ninja per month; marked `ponytail:` already. |
| 4. Info: unspent Essence is lost when the week ends               | Open (design): Essence lives on the weekly row. Confirm with decision 27 or move it to the character.                          |
| 5. Info: Tailed Beast has no level gate                           | Accepted: rewards are bound, tickets are per ninja; nothing moves between accounts.                                            |
| 6. Info: team pub fights give no limit items or 7-day scrolls     | Open (not security): only the solo pub fight calls `limitItemDrops`; parity is the coordinator's call.                         |
| 7. Info: `GET /events` and `GET /skills` lock the character row   | Accepted: they write only when a day changes or skills are learned; the read rate limit bounds them.                           |

All limits and job timers remain per process (unchanged from M2-M4).

## Findings

### 1. Medium: the Team Stone Battle Coin shop skipped the arena rank gate

**Location:** `server/src/modules/team-stone/routes.ts` (`buy`).

Decision 28 makes the BC shop "the Honor shop list at the Honor price, paid in BC". Every Honor
shop offer carries a minimum arena tier (`rank`: 32 of the 36 items need tier 5, 9 or 12), and
`POST /arena/shop/buy` refuses a lower tier. The BC shop checked only the coins, so any level-50
ninja could buy the top-rank items with the 250 Battle Coins the lowest league pays each week for
a single fight. No dupe, but it skipped a progression gate the Honor shop enforces.

**Fix:** the buy reads the tier with the Honor shop's `tierOfCharacter` (now exported) and refuses
with `tier_too_low` before the bag check and the spend. Tests: `the Team Stone Battle Coin shop`.
If the decision meant the BC shop to be open to every rank, revert this one check.

### 2. Low: the weekly league mail named items a full bag dropped

**Location:** `server/src/modules/team-stone/store.ts` (`payWeek`).

The Master and Champion leagues add items. The job cannot refuse, so the items go through
`grantItems` with `dropOverflow` (a full bag loses them, as fight loot), but the system mail still
listed the full count. A player with a full bag was told they got items they never had.

**Fix:** the mail uses the list `grantItems` returns and names the item only when at least one
landed. The coins are always paid. Test: `the Team Stone weekly pay`.

### 3. Low (open): a mid-week month change can pay that week twice

`settle` pays the running week early when the month changes mid-week, so its score is paid before
the reset. A fight later in that same week sets `playedThisWeek` again, and the next weekly run
pays the week a second time with the post-reset score (at least the 250 BC of the Academy league).
At most one extra pay per ninja per month. The code marks it (`ponytail:` in `store.ts`); a real
fix needs a `paid_week` column so a paid week is never paid again.

### 4. Info: unspent Essence is lost when the week ends

Essence is a column of `tailed_beast_players`, which is keyed by week. A new week starts a new row
with 0 Essence, and the weekly job deletes rows older than last week. Decision 27 does not say
whether Essence carries over. Not a dupe; confirm the design.

### 5. Info: Tailed Beast has no level gate

Any living ninja can fight the beast. Honor, Essence, boxes and shop items are per ninja and bound,
so an alt farms nothing transferable; it can only add Honor to its village and contend for its
village's Kage pick (also bound).

### 6. Info: team pub fights give no limit items

`limitItemDrops` and `scrollComboPrizes` run in the solo pub fight only; a team pub fight
(`teams/runs.ts`) pays the 2011 loot alone. Not a security issue; noted for parity.

### 7. Info: some GET routes lock the character row

`GET /events` runs the lazy daily reset and `GET /skills` learns skills through the level, so both
take the character lock. They write only when something changed (existing test for events), and
the read limit (120 per minute) bounds them.

## Checked without findings

| Area                           | What holds                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, CSRF, rate limits        | Every M5 route calls `requireUser` (directly, through `lockCharacter`, `characterOf` or `withCharacter`); POSTs pass the double-submit CSRF and origin checks; each route has a `RATE_LIMITS` entry (`read`, `item`, `gateFight`, `shopBuy`).                                                                  |
| Input bounds                   | zod: talent id 1-8, limit id 1-44, soul ids uuid (1-250 per batch, duplicates refused), discover 1-30, prayer attribute 1-3, milestone 50/100/200, weekday 1-7, beast 1-9, mode 0-2, box 5/10/20, shop count 1-99, Kage and shop items checked against the config list, match id uuid.                         |
| Lock order                     | Every action locks the character row first (`lockCharacter`, `withCharacter`, `lockCharacters` sorted by id), then talent, limit, soul (by id), prayer, weekly, login, Tailed Beast player and pool, Team Stone player and queue rows. No path takes a feature row before a character row.                     |
| Talents                        | The attempt count, Stone or Gold cost and talent EXP are read and written under the character lock (existing race test); the level cap (`level - 50`) and the 3 active slots are checked inside the transaction.                                                                                               |
| Bloodline turn-ins             | 10 turn-ins a day and 4 items each, counted and removed from unequipped bag stacks under the lock; an unlocked limit refuses more turn-ins, so the unlock quest command fires once (existing race test).                                                                                                       |
| Souls and prayer               | Discoveries cap at 10/30 a day and 250 held (race test); synthesis, refine, destroy and prayer lock the listed souls by id and owner, refuse socketed ones and spend each once (race tests); bind keeps one soul per type and 5 sockets per limit (race test). Prayer at level 9 refuses.                      |
| Scroll skills                  | `learnScrollSkill` runs under the character lock and the item row is consumed with a count guard (race test); a permanent skill refuses 7-day scrolls before consuming; at most 2 scroll skills per tree; expired ones leave fights and the arena snapshot at once.                                            |
| Events                         | Login, bonus, milestones, weekday rewards and the weekly bonus check their claimed state under the character, login and weekly row locks and refuse a full bag before writing (race and rollback tests). Dice: 10 rolls, 1 replenish a day, Stone checked first. Twenty-minute: 20-minute cooldown, 6 a day.   |
| Currency paths                 | Every spend compares the locked balance first (Gold and Stone for talents, Stone for dice, BC, Essence); no M5 path can make a balance negative. Mints are the configured rewards only: 10 Gold per week (200-point milestone), 10 Gift Coupons x 6 a day, league BC once per played week (finding 3 aside).   |
| Tailed Beast shared HP         | The pool row is created and locked `FOR UPDATE` for the whole fight; damage is capped by `hpLeft` and the update requires `hp_left > 0`, so one fight lands the last hit (race test). Tickets are spent only when the fight is stored; a dead beast refuses before any spend.                                  |
| Tailed Beast boxes, Kage, shop | Boxes once per threshold per week, one Kage pick per village and week, the Stone Bag limit of 5 and Essence spends, all under the player or Kage row lock (race tests each). Kages are named idempotently (`on conflict do nothing`), also from the claim, so a late job loses nothing.                        |
| Team Stone queue and fights    | Joining needs level 50 and an attempt; the attempt is spent when the match starts, after re-locking every queued ninja and bot and re-checking queue rows and attempts. A bot that queued after the job read the queue cancels the plan (existing test).                                                       |
| Job races                      | New tests run each M5 job twice at once: Team Stone matchmaking starts one match and spends one attempt; the weekly pay pays once; the Tailed Beast reset names one Kage per village. Each job locks the character before its feature rows, so a job and a route on the same ninja serialize.                  |
| Bag full                       | Refused before anything moves: login and weekly rewards, Tailed Beast boxes, Kage pick and shop, BC shop, the hourly pub pull. Lost and reported (`lost`): pub-fight win loot, including limit items and the combo pulled after a win. Lost silently: the league items of the weekly pay (finding 2).          |
| Hooks on older routes          | Weekly activity counters lock the character, cap at each activity's max and only count actions that already passed their own checks (a toll gate only when cleared). World chat counts after delivery in its own transaction, bounded by the chat limiter. Reborn quest commands only advance accepted quests. |
| IDOR                           | Souls, talents, limits and prayer rows are always filtered by the locked character's id; a soul of another ninja answers `no_soul` (test). Team Stone replays need the caller in one of the teams (404 otherwise). Leaderboards and Kage lists return names, levels and villages, never character or user ids. |
