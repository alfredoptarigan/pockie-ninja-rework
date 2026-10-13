# M3 security review

Reviewed on 2026-10-12 against `abaf0a5e` (M3 waves 1 and 2 merged) on `test/m3-verification`.
The review covers every route that spends or grants currency or items: `server/src/modules/shop/*`,
`server/src/modules/forge/*`, `server/src/modules/gates/*` (toll gates, card flip, exchange, Las
Noches, pub fights), `server/src/modules/daily/*`, and in `server/src/modules/game/` explore
(search, peek, pick), pouch refills, revive, rest, field and ticket boss fights, item use and travel.

Checked per route: authentication, the character row lock before any read, idempotency of
repeated or concurrent requests, zod bounds on counts and ids, races on shared stock (refresh shop
slots, the Mysterious Merchant), card takes and peeks, full-bag paths, and the rate limit entry.
Each fixed finding has a failing test written first in
`server/src/modules/security-m3.api.test.ts`, then the smallest change in the route file.

| Severity | Count | Findings                                                                             |
| -------- | ----: | ------------------------------------------------------------------------------------ |
| Critical |     0 | None identified                                                                      |
| High     |     0 | None identified                                                                      |
| Medium   |     1 | Unbounded wholesale count holds the character lock for seconds                       |
| Low      |     6 | Toll gate duel while defeated; appraise-all double charge; daily id 500; 3 open ones |

## Status (2026-10-12)

| Finding                                                            | Status                                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Medium: wholesale buy of 10000 items                            | Fixed (`fix: wholesale buys are capped at one stack`): one purchase is at most `ItemMaxFoldNum`, like the original client; `invalid_count` otherwise.     |
| 2. Low: toll gate duel while defeated skips the revive cost        | Fixed (`fix: refuse toll gate duels for a defeated ninja`): `/gates/run/fight` calls `requireAlive` like Las Noches; the run waits for a revive.          |
| 3. Low: appraise-all charges a repeated id per repeat              | Fixed (`fix: appraise-all charges a repeated item id once`): ids are de-duplicated before pricing.                                                        |
| 4. Low: daily routes return 500 for ids past int range             | Fixed (`fix: daily quest routes answer unknown quest ids with 400`): unknown quest ids stop before SQL with `not_offered`.                                |
| 5. Low: shop routes do not check the scene or NPC                  | Fixed (`fix: shop routes need a shop NPC in the scene`): every shop route except the Mysterious Merchant answers `not_here` without a shop NPC.           |
| 6. Low: fight and box drops ignore the bag size                    | Fixed: fight loot that needs a new row in a full bag is lost (`rewards.lost`); a box does not open into a full bag (`bag_full`, the box stays).           |
| 7. Low: a won pub fight is rolled back when its combo does not fit | Fixed: the pull after a win is fight loot, so combo items that do not fit are lost; the hourly pull still refuses a full bag.                             |
| 8. Info: choices already listed in the plan (wave 2 notes)         | Decided: a full bag keeps refusing a card take; exchange output is bound when any crystal used was bound; appraising without an identify list stays free. |

All limits remain per process; several server instances need shared state (unchanged from M2).

## Findings

### 1. Medium: an unbounded wholesale count holds the character lock for seconds

**Location:** `server/src/modules/shop/routes.ts` (`POST /shop/wholesale/buy`).

`wholesaleBuySchema` allows `count` up to 10000 and the route granted the items one at a time
(`grantItems`: a select and an update per unit) inside the locked transaction. A 10000-unit buy of
i160006 (38 Stone, stacks of 100) took about 6.8 s on the test database, holding the character row
lock and one pool connection. At the 30 per minute rate limit, one IP could keep a connection busy
almost all the time; a few IPs could starve the pool. The original client caps one purchase at one
stack (`UI_ItemBuy.as`, `docs/original-data/shops.md`), and our client already does the same.

**Fix:** the route refuses `count > ItemMaxFoldNum` with `invalid_count`. Test: `wholesale buy`.

### 2. Low: a defeated ninja could duel in a toll gate and skip the revive cost

**Location:** `server/src/modules/gates/toll-gates.ts` (`POST /gates/run/fight`).

A run survives travel, so a ninja could enter a gate, walk out, lose a field fight (0 HP) and then
fight the next toll gate point. The route had no `requireAlive` check (Las Noches has one): a lost
duel set HP to 1, which is the home revive without its 5% EXP loss, and a win restored 20% HP.

**Fix:** `requireAlive(character, 'fight')` first; the run stays. Test: `toll gate fights`.

### 3. Low: appraise-all charged a repeated item id once per repeat

**Location:** `server/src/modules/forge/routes.ts` (`POST /forge/appraise-all`).

`appraiseAllSchema` does not reject duplicate ids, and the route built one target per listed id:
the same item was priced (and rolled) once per repeat. This is a loss for the player rather than a
gain, but it spends currency without a result.

**Fix:** ids are de-duplicated before pricing. Test: `forge appraise-all`.

### 4. Low: daily routes returned 500 for ids past the integer range

**Location:** `server/src/modules/daily/routes.ts` (`POST /daily/:taskId/accept`, `/hand-in`).

`dailyTaskParamsSchema` has no upper bound; `hand-in` sent `99999999999` to an `integer` column and
PostgreSQL's range error became a 500. No state changed (the transaction rolled back), but the
error path is noisy and logged as a server fault.

**Fix:** unknown quest ids (`task(id)` missing) answer `not_offered` before any query. Test:
`daily quest routes`. The shared schema could also bound the id; that file is outside this task.

### 5. Low (open): shop routes do not check the scene or the NPC

`/shop/open`, `/shop/buy`, `/shop/sell`, `/shop/refresh` and `/shop/pouches/refill` work anywhere,
so a player can sell loot or buy potions in the middle of a field. The forge does the same on
purpose ("like the original, none of them checks the scene"); the Mysterious Merchant and the toll
gate guard do check. Needs a decision: either accept it (the original client gates the window, not
the server) or require a shop NPC in the current scene.

### 6. Low (open): fight and box drops ignore the bag size

Field fights (`game/combat.ts`), toll gate point kills, pub fight kills and opened boxes call
`grantItems` without a bag check, so the bag can exceed `BAG_SLOTS` rows (M2 behaviour). Card
takes, shop buys, exchanges, daily hand-ins and explore picks do check. Needs a decision on what a
full bag does with a drop (lose it, hold it, or refuse the fight).

### 7. Low (open): a won pub fight is rolled back when its combo does not fit

`/gates/pub/fight` pulls a new line-up after a win; a combo whose items do not fit throws
`bag_full`, which rolls back the whole transaction including the fight, its rewards and the daily
count. No gain for the player, but a win turns into an error. Options: skip the combo items on a
full bag, or check bag room before the fight.

### 8. Info (open): choices already listed in the M3 plan

From the wave 2 notes, unchanged: a full bag refuses a toll gate card take and keeps the cards (the
original loses it); toll gate exchange output is unbound even when the crystals were bound; an item
without an identify list appraises for free with no properties.

## Checked without findings

| Area                         | What holds                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locks                        | Every mutating route takes `lockCharacter` (`SELECT ... FOR UPDATE`) before its checks; the merchant spawn row is locked `FOR UPDATE` and lazy spawn creation uses an advisory lock.    |
| Refresh shop slots           | Stock is per character and bought under the character lock (existing race test `shop.api.test.ts`).                                                                                     |
| Mysterious Merchant stock    | Shared across characters; two ninjas buying the last unit at once get one 200 and one `stock_empty` (new test).                                                                         |
| Card take and peek           | Two takes grant one card (existing test); two peeks at one card charge once and the second gets `card_revealed` (new test). Peek, show all and re-deal charge per currency.             |
| Explore                      | Pending search and peeks persist in `explore_searches` under the character lock; duplicate peeks and picks pay once (existing test). Item cards check bag room before granting.         |
| Amounts                      | zod bounds: shop slot 0-99, counts 1-10000 (now per stack for wholesale), sell count limited by the row, pouch refill -1 to 10000, card index 0-4, sell-all ids unique and at most 150. |
| Currency checks              | Every charge compares the locked balance per currency (not the original's Stone-only check); quest rewards and selling add to the locked row.                                           |
| Daily hand-in                | `completeQuest` claims ready -> completed atomically; a bag overflow after granting rolls the whole hand-in back (existing tests).                                                      |
| Auth, CSRF, rate limits      | Every route calls `requireUser`; POSTs pass the double-submit CSRF check and the origin check; every route has an entry in `RATE_LIMITS`.                                               |
| GET routes with side effects | `/shop/open` (restock, tutorial command), `/shop/merchant` (spawn), `/daily` (board) and `/gates/pub` (line-up) change state on GET, but none spends or grants currency or items.       |
