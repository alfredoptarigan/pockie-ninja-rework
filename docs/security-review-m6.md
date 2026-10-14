# M6 security review

Reviewed on 2026-10-14 against `f38514cf` (M6 tasks 1-14 merged). The review covers every M6 route:
`server/src/modules/pets/*` (the Pet Kennel: adopt, feed, finish now, skills, slots, evolve,
release, kennel slots, active pet), `server/src/game/pets.ts` (the pet fighter, the fight EXP share
and the explore pet grant), `server/src/modules/kennel/*` (Pet Tracing and the Kennel shop),
`server/src/modules/wings/*` and `server/src/game/wings.ts` (enhancement, destroy, the Wing
Collection, the Wing slot bonus), `server/src/modules/cards/*` and `server/src/game/card-boxes.ts`
(box opening through `POST /items/:id/use`, collection prizes, the five box drop sources), the
wing offers M6 added to the Team Stone Battle Coin shop and the Tailed Beast Essence shop, and the
arena defence snapshot with its pet and wing. It also checked the older routes that now see M6
items: equip and unequip of the Wing slot, item use for pet items and card boxes, fight wear and
the forge.

Checked per route: authentication, the rate limit entry, zod bounds on ids, counts and enums, the
lock order (character row first, then the feature rows by id), dupes and double claims under
concurrent requests, daily cap races, every Gold, Stone, Gift Coupon, Feather, Battle Coin and
Essence path (can it go negative, can it be minted), full-bag handling, the Pet Tracing board
(can any response tell the client where the pet is), wing destroy outcomes, and IDOR on every id a
client sends. Each fixed finding has a failing test written first, then the smallest change.
Concurrency cases the review verified live in `server/src/modules/security-m6.api.test.ts`.

| Severity | Count | Findings                                                                                         |
| -------- | ----: | ------------------------------------------------------------------------------------------------ |
| Critical |     0 | None identified                                                                                  |
| High     |     0 | None identified                                                                                  |
| Medium   |     0 | None identified                                                                                  |
| Low      |     2 | A worn wing broke after one won fight; the forge took Stone and seals to inscribe a wing         |
| Info     |     4 | Tracing bag-full refusal; collection per ninja; locking GET polls; dev rows already worn to zero |

## Status (2026-10-14)

| Finding                                                       | Status                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Low: a worn wing broke after one won fight                 | Fixed (`fix: keep wings and auras out of fight wear`): items without `MaxHardiness` never wear.                                                                                                                           |
| 2. Low: the forge inscribed wings for nothing                 | Fixed (`fix: keep wings and auras out of the forge`): every forge action refuses a Wing slot item with `wrong_item`.                                                                                                      |
| 3. Info: a full bag refuses a Pet Tracing find before it pays | Accepted: the refusal only answers the cell the player already chose; the attempt and the board's pet roll stay the same.                                                                                                 |
| 4. Info: the Wing Collection pays each ninja once per id      | Accepted (decision 25): the Plume Shards are bound, so a wing passed between ninjas farms nothing tradeable.                                                                                                              |
| 5. Info: `GET /pets` and `GET /kennel/tracing` lock the row   | Accepted: they write only when food finished digesting or the day changed; the read limit (120 per minute) bounds them.                                                                                                   |
| 6. Info: wings worn to 0 before fix 1 stay broken             | Open (data): no production data yet. A dev database can run `update inventory_items set durability = null where durability = 0 and (item_id between 'i218000' and 'i218018' or item_id between 'i218200' and 'i218207')`. |

All limits remain per process (unchanged from M2-M5).

## Findings

### 1. Low: a worn wing broke after one won fight

**Location:** `game-core/src/equipment/durability.ts` (`wearDurability`), reached through
`server/src/game/gear.ts` (`wearEquipped`).

Reborn wings and auras are `EquipItem` rows without `MaxHardiness`. `durabilityOf` treats a null
durability column on such an item as 1 so it counts as active, but `wearDurability` then took the
kill loss off that 1. The first won field fight wrote durability 0 on the worn wing. The wing kept
its stats (`wingBonuses` does not read durability), but once taken off it could not be put on again
(`broken`), and the forge repair refused it (`not_damaged`, a repair of a 0-max item costs 0). Not
an exploit, but a player lost the use of a wing, including a +20 one.

**Fix:** `wearDurability` keeps the durability of items without `MaxHardiness`. Tests: the
game-core `wearDurability` case and `a worn wing` (fight wear, unequip, equip again).

### 2. Low: the forge inscribed wings for nothing

**Location:** `server/src/modules/forge/routes.ts` (`equipmentOf`).

The forge accepts any `EquipItem`. Enhance and refine refused wings by their base type and identify
list, but inscription only needs an `EquipItem`: it spent Stone and seals and raised an
`inscribeLevel` that gives a wing no stat (`inscriptionProps` reads weapon and armour only). No
gain, only a currency sink a player could fall into.

**Fix:** `equipmentOf` refuses an item whose `EquipType` is the Wing slot, so appraise, refine,
enhance, inscribe and repair all answer `wrong_item` before any spend. Test: `the forge`.

### 3. Info: a full bag refuses a Pet Tracing find before it pays

A find pays 10 Feathers and, 5% of the time, a pet; a miss pays 1 Feather. `requireBagRoom` runs
before the attempt is counted, so with a bag that fits 1 Feather but not 10 (or not the pet) the
right cell answers `bag_full` while a wrong one succeeds. The player learns nothing they did not
already choose, the attempt is not spent, and the pet roll comes from the board's stored seed, so a
retry after freeing room pays the same reward. No leak and no reroll.

### 4. Info: the Wing Collection pays each ninja once per wing id

Registering keeps the wing (decision 25). An unbound wing traded through several ninjas registers on
each, but every payout is bound Plume Shards, so the alts gain nothing they can move back.

### 5. Info: two GET routes lock the character row

`GET /pets` settles finished digestion (appetite and pet EXP) and `GET /kennel/tracing` creates the
day's board, so both run inside the character lock. They write only when something changed, and the
read limit bounds them.

### 6. Info: dev rows worn before fix 1

Fix 1 stops new wear; it does not repair rows that already hold durability 0. There is no
production data. A dev database can clear them with the statement in the status table.

## Checked without findings

| Area                     | What holds                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, CSRF, rate limits  | Every M6 route calls `requireUser` (directly or through `lockCharacter` and `characterOf`); POSTs pass the double-submit CSRF and origin checks; each route has a `RATE_LIMITS` entry (`read` for views, `item` for pet, Tracing, Kennel shop, collection and card claims, `forge` for wing enhance, `shopBuy` for the BC and Essence shops).                                                                                                                   |
| Input bounds             | zod: pet id and wing row id uuid, skill id positive int (only compared in memory), skill kind 1-3, active boolean, 6 food slots of `i` + 6 digits or null, finish-now currency `gold`/`giftCoupon`, evolve form optional item id, Tracing board id uuid and cell 0-8, refill currency `gold` only, Kennel shop count 1-20, card collection 1-10, all bodies strict. Every item id is then looked up in the server catalog (food, book, stone, talisman, offer). |
| Lock order               | Pets: character, then every pet row of the character (`settlePets`), then the pet (`lockPet`, by id and owner), then its skills and the inventory stacks. Kennel: character, then the Tracing row or the purchase row, then the Feather stacks. Wings: character, then the wing row, then the material stacks. Cards: character, then the card rows. No path takes a feature row first.                                                                         |
| Pets                     | Adoption uses one pet item through the item-use transaction and `consumeOne`; a full kennel refuses before anything moves. Feeding spends each food under the lock and refuses while digesting or full. Finish now refuses when nothing is digesting (finished food settles first, so it is never paid twice). Learning spends a full appetite; books, Skill Locks (1, then 2, at most 2) and removers are counted before they are removed.                     |
| Pet currencies           | Kennel slot 100 Gold up to 5 (`slot_cap`, check constraint 1-5), skill slot Stone from `PetActCapital` (only priced slots open), finish now 8 Gold or Gift Coupons, evolve 50 Feathers at level 30. Every price is checked against the locked balance before the update; none can go negative, and no pet action mints currency.                                                                                                                                |
| Pet EXP and the fighter  | The share is 50% of the master's paid EXP from field, toll gate and Las Noches fights, applied inside the fight transaction after the master's row; the pet's level never passes its master's or 50. A level gain, skill change, evolve or active change rebuilds the arena snapshot in the same transaction, and the snapshot source includes the pet, so stale ones rebuild.                                                                                  |
| Pet Tracing board        | The board (`petCell`, `opened`, `seed`) is stored server-side only. Views return the board id (a random uuid), the arrows of opened cells, attempts, the refill flag and Feathers (test: no response carries the pet cell or the seed). The pet reward is rolled from the hidden seed, so it cannot be rerolled. A stale board id, an opened cell or a found board is refused.                                                                                  |
| Tracing caps             | 10 attempts a day plus one 10-Gold refill of 10, counted on the Tracing row under the character lock, reset lazily on the UTC day (test: two flips on the last attempt use it once). Refill checks Gold first. Rewards are bound and pass `requireBagRoom` before the attempt is written.                                                                                                                                                                       |
| Kennel shop              | Level gate, daily limit and the Feather spend run under the character lock with the purchase row `FOR UPDATE` (existing race test); the bag check runs before the grant inside the same transaction, so a full bag rolls the spend back. Items are bound.                                                                                                                                                                                                       |
| Wing enhance and destroy | The stone and each talisman (one per family, matched by family) are removed with `consumeOne` under the lock, on every attempt (test: two enhances with one stone spend it once). Odds sum to 100; levels stay 0-30 (check constraint). Destroy happens only from level 20 and deletes the row, even when worn, then the arena snapshot is rebuilt.                                                                                                             |
| Wing Collection          | The wing must be in the bag (worn counts). A repeat is refused before the bag check, and the insert is `on conflict do nothing` under the character lock (test: two registrations pay once). The shards are bound and pass `requireBagRoom` first.                                                                                                                                                                                                              |
| Cards                    | A card box is used up with `consumeOne` and adds one card by upsert inside the item-use transaction. A claim needs every card, is refused when already claimed, checks the bag first and records the prize under the character lock and the primary key (test: two claims pay once). Cards are not spent by a claim (decision 30).                                                                                                                              |
| Card box sources         | Field win 1% Green, pub fight win 5% Blue, every 10th Las Noches floor 10% Red, the Tailed Beast 10-fight box (once a week) Purple, Team Stone weekly leagues 7-8 Gold. Rolls use server-side crypto seeds after the win is decided; every box is bound. Fight loot is lost on a full bag as before; the weekly mail names only what arrived.                                                                                                                   |
| Shop additions           | BC shop wings, Plume Shards and [D] talismans at fixed prices with no rank gate (decision 26) and no identify roll; Essence shop wings and +3/+4 stones, any count 1-99. Both check the locked balance and the bag before the grant; items are bound.                                                                                                                                                                                                           |
| Wing slot                | Equip and unequip run under the character lock and rebuild the arena snapshot for the Wing slot; one item per slot. `wingBonuses` reads only the worn bag row of the character.                                                                                                                                                                                                                                                                                 |
| Bag full                 | Refused before anything moves: adoption (kennel full), Tracing rewards, the Kennel shop, collection shards, card prizes, the BC and Essence shops. Lost as fight loot: field, pub and Las Noches card boxes. Lost and left out of the mail: the Team Stone weekly card box.                                                                                                                                                                                     |
| IDOR                     | Pets are locked by id and owner (`no_pet` 404 for another ninja's pet); wing rows, materials, cards and the Tracing row are always filtered by the locked character's id; item use and equip only find bag rows of the caller. Arena replays show only the pet species and avatar and the wing look.                                                                                                                                                            |
