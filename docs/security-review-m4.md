# M4 security review

Reviewed on 2026-10-13 against `46a5480a` (M4 waves 1 and 2 and the translation review merged).
The review covers every M4 route: `server/src/modules/teams/*` (lifecycle, boards, runs and the
team hooks in `server/src/modules/gates/`), `server/src/modules/social/*` (friends, blocks, mail,
mail reports), whispers, team chat and chat reports in `server/src/modules/realtime/*`,
`server/src/modules/market/*`, `server/src/modules/arena/*` (fights, tries and Gold, refresh,
revenge, boss promotion, duels, Honor shop, Honor -> EXP, the defence snapshot),
`server/src/modules/rankings/*`, `server/src/game/system-mail.ts` and
`server/src/game/text-filter.ts`.

Checked per route: authentication, the character row lock before any read that decides a spend
or a grant, idempotency of repeated and concurrent requests, zod bounds on counts, ids, strings and
prices, item and currency dupes (Market buy vs. cancel vs. expiry, wallet claims, a full
warehouse), concurrent arena attacks on one defender, Honor shop overspend, team join and run-start
races, block bypasses (decision 17), mail rate limits and a full inbox, the rate limit entries, the
text filter on chat, whispers and mail, and error messages that could leak data. Each fixed finding
has a failing test written first in `server/src/modules/security-m4.api.test.ts`, then the
smallest change.

| Severity | Count | Findings                                                                                           |
| -------- | ----: | -------------------------------------------------------------------------------------------------- |
| Critical |     0 | None identified                                                                                    |
| High     |     0 | None identified                                                                                    |
| Medium   |     1 | The arena defence snapshot never followed gear, level or skill changes                             |
| Low      |     3 | Periodic jobs never started; mail send limit counts surviving rows; chat reports carry client text |
| Info     |     2 | Friend notices can push Market notices out of the system pool; Market sale push not wired          |

## Status (2026-10-13)

| Finding                                                           | Status                                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Medium: stale arena defence snapshot (borrowed gear kept)      | Fixed (`fix: rebuild a stale arena defence snapshot before the fight`): the snapshot records what it was built from and is rebuilt when that changed. |
| 2. Low: Market expiry, mail purge and team sweep never scheduled  | Fixed (`fix: run the Market expiry, mail purge and team sweep jobs`): `server/src/jobs.ts`, started by `index.ts`, stopped on close.                  |
| 3. Low: the per-sender mail limit counts mails the recipient kept | Open: needs a send log or a `deleted_at` column (a migration); block and report cover a harasser meanwhile.                                           |
| 4. Low: a chat or whisper report stores the text the client sends | Open: the M6 admin view must treat chat report text as a claim, or the server keeps recent message ids to check it against.                           |
| 5. Info: friend notices share the 25-mail system pool with Market | Accepted: one notice per sender per day, blocked players cannot add; the wallet and the warehouse do not depend on the mails.                         |
| 6. Info: `onSale` push of the Market is not wired in `app.ts`     | Open (not security): the seller still gets the sale mail; the live notice needs the coordinator's wiring.                                             |

All limits, presence and job timers remain per process; several server instances need shared
state (unchanged from M2 and M3).

## Findings

### 1. Medium: the arena defence snapshot never followed gear, level or skill changes

**Location:** `server/src/modules/arena/fights.ts` (`playerOpponent`), `snapshot.ts`.

Decision 9 says the snapshot is refreshed on every gear, level or skill change, and the plan left
the hook (`refreshArenaSnapshot` after equip and level-up) to the coordinator. It was never wired:
the only caller was Honor -> EXP. A defender therefore fought, in every arena fight and duel, as
they were when they first opened the arena. Borrowing strong gear (Market, a friend) for one
`GET /arena` kept that defence for good, so the defender won Elo they should not; the opposite case
left a levelled ninja defending as a level 1 copy. This is the "snapshot drift" risk of the plan.

**Fix:** the snapshot stores its `source` (name, gender, level, avatar, outfit and the equipped
rows). `playerOpponent` rebuilds the fighter from the locked character row; a stored snapshot is
used only when its source still matches, otherwise the new one is stored and used. This covers
every gear, level or skill path at once instead of wiring a hook into a dozen routes. Test:
`the arena defence snapshot`.

### 2. Low: the Market expiry, mail purge and team sweep jobs were never started

**Location:** `server/src/index.ts`; the jobs are `expireListings` (market), `purgeExpiredMail`
(social) and `sweepTeams` (teams).

The jobs were exported with their intervals but nothing scheduled them. No dupe: every query
already filtered `expires_at`, and a seller could take an expired listing down by hand. But expired
items stayed on the Market until then (no return to the warehouse, no expiry mail, M13 of the
original), expired mail rows were never deleted, and a team nobody read kept members past the 60 s
grace.

**Fix:** `server/src/jobs.ts` starts one interval per job (60 s, 1 h, 5 s) from `index.ts` only
(tests build the app without them) and stops them when the server closes. Each job is idempotent,
so an overlapping or late run is harmless. Test: `periodic jobs`.

### 3. Low (open): the per-sender mail limit counts mails the recipient kept

`sendPlayerMail` counts the sender's player mails of the last hour (10 in total, 3 per recipient)
from the `mails` table. A recipient who deletes a mail frees the sender's slot, so a spammer who
writes to many players who delete quickly sends more than 10 an hour. The code already marks this
(`ponytail:` in `mail.ts`). A real fix needs a send log or a soft delete (a migration); until then
the route rate limit (30 per minute per IP), level 10, the full-inbox refusal, blocks and reports
limit the damage.

### 4. Low (open): chat and whisper reports store the text the client sends

`chatReport` (realtime) stores the reported line as the reporter sends it; only the sender id is
checked to exist. A player can file a report that quotes something another player never said. Mail
reports copy the stored mail and are not affected. Nothing acts on reports yet (M6 admin view), so
the open item is for M6: show chat report text as a claim, or keep recent message ids (each
`ChatMessage` has one) and check the report against them.

### 5. Info: friend notices share the 25-mail system pool

`sendSystemMail` keeps the newest 25 system mails per ninja, so many different players adding a
ninja as a friend can push older Market or arena notices out. One notice per sender and day is
sent, a block stops the adds, and the Market wallet and warehouse do not depend on the mails, so
nothing of value is lost.

### 6. Info (open, not security): the Market `onSale` push is not wired

`marketRoutes` accepts an `onSale` hook for a live "item sold" notice; `app.ts` does not pass one.
The seller still gets the sale mail. Left to the coordinator, outside this review's files.

## Checked without findings

| Area                        | What holds                                                                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, CSRF, rate limits     | Every route calls `requireUser` (or `characterOf` / `lockCharacter` with it); POSTs pass the double-submit CSRF and origin checks; every route has a rate limit entry. Sockets check the session cookie on the handshake and on every chat send.                     |
| Market locks and dupes      | Buy locks buyer and seller by id, then the live listing and the item row `FOR UPDATE`; cancel and expiry lock the seller first, so buy, cancel and expiry of one listing settle once (existing race tests). Splits use a count guard.                                |
| Market items out of the bag | A listed or warehoused row keeps its owner but leaves `location = 'bag'`; every item route (`ownedItem` in actions and forge, shop sell, `grantItems`, `takeItems`, bag checks) filters on the bag, so a listed item cannot be equipped, used, sold or stacked onto. |
| Market wallet and warehouse | Wallet claims run under the character lock and cap at 100,000,000 per currency (new race test: two claims pay once). A full warehouse refuses buys and take-downs before any money moves; expiry may overfill it so items never get stuck.                           |
| Market bounds               | zod: uuid ids, counts 1-10,000 (and at most the row), prices 1-1,000,000 per unit in either currency, page 1-10,000, at most 500 item ids; totals are `bigint` columns; listing needs level 25, a bag row, tradable and unbound.                                     |
| Arena fights                | Attacker and defender characters, then both arena rows, are locked in id order; the slot or log is re-read under the locks; the try or Gold is taken after every check (existing test: two attackers on one defender keep the scores zero-sum).                      |
| Arena Gold, tries and Honor | `takeTry` caps bought tries at 15 a day; refresh, revenge and duel costs compare the locked Gold. The Honor shop and Honor -> EXP run under the character lock (new race test: two buys spend once); Honor shop items are bound.                                     |
| Arena boss and revenge      | The boss needs `endscore` and gives the tier Honor once per promotion; revenge needs an own lost defence log against that ninja and charges a try plus 10 Gold per use that day (as the original).                                                                   |
| Teams                       | Every action locks the teams involved, then every member and target by id, and retries when a membership changed between the look-up and the locks; accept re-checks captain, scene, size, runs and blocks (existing concurrent-accept test).                        |
| Team runs                   | Only the captain enters or fights; entry checks every member's scene, online state, level range (both ends), tries, item, weapon and HP under the team lock; solo gate routes refuse team members (`requireNoTeam`) under the character lock.                        |
| Blocks (decision 17)        | Whispers, player mail, friend adds, team invites, applications and accepts, and duels check blocks in both directions with one neutral line (new duel test; existing tests for the rest).                                                                            |
| Mail                        | Level 10, both characters locked, inbox cap 50 checked under the recipient's lock, subject 20 and body 200 characters after control characters are stripped, filtered on send; read, delete and report check the owner.                                              |
| Text filter                 | `filterText` runs on world, scene, team chat and whispers before broadcast, and on mail subject and body before storing.                                                                                                                                             |
| Rankings                    | Read-only top 100 lists without user ids; the weekly toll gate claim locks the character and the claim row's primary key makes a repeat a no-op; gate ids outside the ranked list answer 404.                                                                        |
| Error messages              | Unknown names answer one line ("There is no ninja with that name.", names are public in rankings); block refusals never say who blocked whom; database errors stay behind the generic 500 handler.                                                                   |
