# Plan: World & Economy (Milestone 3)

**Project**: Pockie Ninja Remastered
**Status**: draft; user decisions of 2026-10-12 recorded under "Decisions" (four questions still open)
**Complexity**: Large

## Goal

A ninja who finished the village tutorial can leave the village, travel the whole world map
(all 21xx-28xx fields, Angel City 161, Demon City 171), fight every field monster and task boss,
follow the main chain to level 90, buy and sell at the town shops, refill pouches, improve gear
at the blacksmith (appraise, refine, enhance, inscribe, repair), collect equipment sets whose
bonuses show in the stats, and play the Demon City instances (solo toll gates with the card flip,
Las Noches floors) and the neutral-field pub fights. Everything is in English.

## Ground rules

Same as milestone 2: English only, TDD for game logic and anything that spends currency, small
conventional commits, `pnpm typecheck && pnpm lint && pnpm test` before every commit. Data and
formulas are ported 1:1 from the original server; known original bugs are listed per spec and
decided per case (default: port the behaviour, fix only money/item exploits). Raw SWFs never
enter the repo. Parallel agents work in their own worktree with a private `TEST_DATABASE_URL`
(name contains `test`) and only in the folders their task owns.

## Specs (read before the matching task)

| Topic                                                          | Spec                                      |
| -------------------------------------------------------------- | ----------------------------------------- |
| NPC shops, refresh shops, Mysterious Merchant, selling, pouches | `docs/original-data/shops.md`             |
| Enhance, appraise/refine, inscribe, durability, equip props    | `docs/original-data/blacksmith.md`        |
| Equip slots, property names, set bonuses                       | `docs/original-data/equipment-sets.md`    |
| Travel, Angel/Demon City, toll gates, Las Noches, pub fights, energy | `docs/original-data/toll-gates.md`  |
| Fields 26xx-28xx (and 21xx-25xx xx02/xx03), quests, assets     | `docs/original-data/fields-26xx-28xx.md`  |
| Existing basics                                                | `world.md`, `quests-items.md`, `characters.md`, `battle.md` |

## Scope

In: everything in the goal. Out (later milestones): the Gold mall (`VirtualShopSystem`), player
trade and market (`ExchangeSystem`, `MartSystem`, M4), teams in toll gates and pub fights and the
captain bonus (M4), the weekly toll gate ranking (M4), sockets, gems, enchant, synthesis, ring
exchange and engraving (later forge work), Christmas maps xx04 (no art for 2204-2504), the
Gold top-up and payment gateway (later). Daily quests (`DayTaskSystem`) are IN scope (decision 5).

## Folder ownership

| Area                     | Folders                                                                    | Owner task |
| ------------------------ | -------------------------------------------------------------------------- | ---------- |
| Data import              | `tools/game-data/`, `server/data/game/`, `server/src/game/data.ts`         | 1          |
| DB schema and migrations | `server/src/db/`, `server/drizzle/`                                        | 2          |
| Asset export             | `tools/assets/`, `client/public/assets/game/`, `client/src/generated/`     | 3          |
| Equipment rules          | `game-core/src/equipment/`, `game-core/src/stats.ts`                       | 4          |
| Translation review       | `tools/i18n/`, `client/src/i18n/`                                          | 5          |
| Shops                    | `server/src/modules/shop/`, `client/src/game/shop/`, `shared/src/schemas/shop.ts`, `game-core/src/economy/` | 6 |
| Forge and gear stats     | `server/src/modules/forge/`, `client/src/game/forge/`, `shared/src/schemas/forge.ts`, `server/src/game/` | 7 |
| World and fields         | `server/src/modules/game/`, `client/src/game/` top-level files (WorldMap, SceneView, Hud, NpcDialog) | 8 |
| Demon City instances     | `server/src/modules/gates/`, `client/src/game/gates/`, `shared/src/schemas/gates.ts`, `game-core/src/gates/` | 9 |
| Verification             | `e2e/`, `docs/`                                                            | 10         |

Shared touch points, kept to one line each and merged by the coordinator: route registration in
`server/src/app.ts`, opening a new window from `client/src/game/GameApp.tsx` / `Hud.tsx` (task 8
owns these files; tasks 6, 7 and 9 export a window component plus an `open` hook and ask for the
one-line wiring), and the `shared/src/index.ts` re-export.

## Tasks

### Task 1: Data import for M3

- **Action**: extend `tools/game-data/import.ts` with the files below (original field names,
  `groupBy` for index-numbered files, trimmed section headers) and load them in
  `server/src/game/data.ts` with zod checks.
  - Shops: `npc-shops.json` (npcbox + npcboxitem), `refresh-shops.json` (refreshcontainer +
    refreshitems), `mystic-shop.json` (5 Mystic\*.ini), `sell-ask-items.json`.
  - Forge: `equip-config.json` (equipPropConfig + EquipDefine), `equip-props.json`
    (EquipPropDefine), `enhance-fail-rates.json`, `inscribe-levels.json` (+ SealOdds),
    `identify-lists.json`, `identify-groups.json`, `identify-props.json`.
  - Sets: `equip-suits.json` (SuitProp), `tollgate-suits.json` (`tollgoteequipsuit` tab).
  - World: `except-task-scenes.json` (ExceptTaskScene.ini), `level-scenes.json` (levelsceneid tab).
  - Instances: `toll-gates.json` (+ `Hard`/`BossName`/`PassCondition` from the client tab),
    `toll-gate-subs.json`, `toll-gate-points.json`, `toll-gate-groups.json`,
    `toll-gate-config.json`, `toll-gate-cards.json`, `toll-gate-exchanges.json`,
    `single-gate.json`, `pub-fights.json`. (`toll-gate-rank-rewards.json` waits for M4.)
- **Validate**: re-run is deterministic; spot checks from the specs (box 1001 = i160006 at
  38 Stone; FailRate[12] = 99; inscribe 11→12 BaseOdds 3, 1200 Stone; 61 set ids; 21 toll gates,
  360 monster groups; 170 floors; 13 pub fight scenes); every item id referenced by shop pools
  either exists in `items.json` or is listed as a known gap (i2x0119/i2x0120).
- **Depends on**: nothing (wave 1).

### Task 2: DB schema and all M3 migrations

- **Action**: one task writes every M3 migration so later waves never touch `server/src/db/`:
  see "Migrations" below. Drizzle schema, generated SQL, constraint checks, and a short comment
  per column naming the original field.
- **Validate**: `schema.test.ts` / constraint tests (enhance and inscribe 0-12, durability ≥ 0,
  identify count 0-4, energy 0-200, unique stock slot per character and shop); migrations apply
  on a fresh and on an M2 database (existing inventory rows get full durability via a backfill
  from `MaxHardiness`).
- **Depends on**: nothing (wave 1). Wave 2 tasks start after it merges.

### Task 3: Asset export for M3

- **Action**: extend `tools/assets/*` (see "Asset exports" below), regenerate
  `client/src/generated/*`, extend `tools/assets/manifest.test.ts` coverage to every M3 scene,
  monster, NPC and item icon the data references.
- **Validate**: cached re-run is clean; the manifest test lists zero unexplained gaps (known
  backup gaps are written down in the test).
- **Depends on**: nothing (wave 1).

### Task 4: game-core equipment rules (TDD)

- **Action**: `game-core/src/equipment/`: per-item property list (`GetEquipTotalProp` order:
  base, `OtherProp*`, identify rows, inscription rows; enhance attack/HP), the `PropType 0`
  summing step, set counting and stacked bonuses (`SuitEquipSystem`), active-item check
  (durability > 0, job bitmask, sex). Extend `Bonuses` in `stats.ts` with every type-0 prop the
  spec maps to `RefreshSystem` (pierce, tough, neglect defence, defence %, min/max attack %, hit
  and crit %, rebound, vampiric, absorb, damage reduction, priority, counter bomb, SkillAdd0-9,
  Exp/Cap/Drop multipliers) and feed them to the battle fighter. Pure functions for the forge:
  enhance roll and result, appraise cost, refine roll (common + gold property, no-duplicate
  names, ×100 floor for base stats), inscribe seals used / roll / fail level / bonus, repair cost,
  durability loss. Seeded RNG as in `random.ts`.
- **Validate**: one test per formula with the spec examples (i250104 34-41 → +1 35-43,
  +12 54-66; inscription +12 → +21/+25; appraise L30 = 19 Stone; repair L1 broken = 123); a
  2/4/7-piece set test; a broken item contributes nothing.
- **Depends on**: nothing (wave 1; uses the imported JSON shapes from the spec, not the server).

### Task 5: Translation review for M3

- **Action**: extend the game-text slice to 161, 171, 21xx-28xx (xx01-xx03), shop/forge/toll gate
  UI keys from the specs, field NPCs and monsters, and the main chain 10025-10193 plus its four
  mirrors; hand-review those strings in `tools/i18n/overrides.json`.
- **Validate**: placeholder and glossary checks pass; no Indonesian in the slice.
- **Depends on**: nothing (wave 1).

### Task 6: Shops, selling and pouch refills

- **Action**: `server/src/modules/shop/` under `/api/game`: open shop window (all four tabs, the
  player's band for Wholesale), buy from Wholesale (stacks, bound, bag check), refresh shops
  (per-character stock, 1800 s restock on open/countdown, instant restock paid or free,
  appraisal and binding per shop type, buy one, buy all), sell and sell all (`CanTrade & 1`,
  `Price × count` Stone, equipped items refused), pouch refill (`OnCustomBuy`, Gold or Gift
  Coupon, 1 per 1000 points, -1 fills), Mysterious Merchant (hourly 10-minute spawn in
  2601-2605, server-wide stock and price growth, per-player limits; dates treated as always on).
  Money checks per currency (not the original Stone-only check). Draw logic in
  `game-core/src/economy/`. Client: `client/src/game/shop/` shop window with tabs, countdown,
  buy dialog, sell by drag or button, sell-all confirm list, pouch refill dialog, merchant window.
- **Validate**: API tests per action including not enough Stone/Gold, full bag, selling an
  equipped or untradeable item, double-buy of the same stock slot (row lock), restock timing,
  merchant limit per spawn; component tests for the window.
- **Depends on**: tasks 1, 2, 4 (item instances for appraisal).

### Task 7: Forge and gear stats

- **Action**: `server/src/modules/forge/`: appraise (one, all on the page), refine (paid or
  talisman), enhance (paid or talisman, Gift Coupon binds), inscribe (seals, Stone, fail level),
  repair (one, all equipped), forge-NPC free-counter talismans if the counters exist (otherwise
  skip). Wire task 4 into `server/src/game/` so `GET /character` stats and every fight use full
  equipment props and set bonuses; durability loss (−1 per enemy killed in a won fight, −5% on
  revive home, which M2 skipped); unappraised gear cannot be equipped. Drops and boxes roll
  identify properties on grant (`IdentifyPropCount`). Client `client/src/game/forge/`: forge
  window (Enhance and Refine tabs), inscription window, bag Appraise/Repair actions, item border
  colour by property count, tooltips with properties, enhance and inscription levels, set
  progress.
- **Validate**: API tests (each action, missing currency, wrong item class, level caps,
  unappraised equip refused, durability reaching 0 removes stats and set bonus); a fight test
  where a set bonus changes the replay stats.
- **Depends on**: tasks 1, 2, 4.

### Task 8: World, travel and fields

- **Action**: `server/src/modules/game/`: split travel into link travel (`CanSwitchScene`:
  `scene-links`, nation unless `ExceptTaskScene` allows it) and map travel (`CanChangeScene`:
  rule section required, missing origin key = free, `RequireLevel`); go home / go out via
  `ToScene`; record `scenes_entered`. Fields: task-boss gate by `TaskID` (accepted or completed),
  subtask type 10 (boss + item), ticket bosses (i150078, level variant via `LevelAttackRec`,
  hourly schedule, expired dates not applied per decision 2), Stone Organization rest (no energy,
  decision 1), Angel/Demon City buildings and NPC menus that route to shop, forge
  and gate windows. Client: full world map (34 buttons minus 181, visited state), scene exits,
  the new field scenes, ticket boss timer, rest dialog, and the one-line window wiring for tasks
  6, 7 and 9.
- **Validate**: API tests: 2601 → every neighbour, nation-locked field refused unless the task
  allows it, level gate, go home from 161 lands in 2601; task boss refused without its quest;
  a ticket boss fight consumes one i150078; the Fire main chain plays from 10025 to 10045 in a
  test.
- **Depends on**: tasks 1, 2, 3 (world map and scenes).

### Task 9: Demon City instances and pub fights

- **Action**: `server/src/modules/gates/` (state machine in `game-core/src/gates/`):
  - Toll gates, solo: guard menu with tries left, entry checks (level, item, weapon, HP > 90%,
    3 tries per day), ordered points, 3-NPC sequential duels, restore 20% HP / 40% MP on a win,
    sub-gate and gate rewards, loss or exit ends the run, card flip (deal, show all, shuffle,
    re-deal, peeks with `LookAddMul`, take; disconnect grants a random card), crystal exchange.
  - Las Noches manual mode: entry modes (floor 1 for 1000 Stone, 50% start), floor duels, EXP
    pot, lives (1 free, `6 + 2n` Gold), end/withdraw, best floor. Auto mode only if the user
    pulls it in.
  - Pub fights in 26xx-28xx: line-up, hourly pull with combo rewards, 3 energy per fight.
  Client `client/src/game/gates/`: gate select, run progress, card flip, exchange, Las Noches
  window, pub fight window.
- **Validate**: game-core tests for run state transitions and card costs (100001 first peek after
  shuffle = 35); API tests for entry refusals, daily tries, loss ends the run, card take with a
  full bag, Las Noches pot halving.
- **Depends on**: tasks 1, 2, 3, 4 (weapon/HP checks use the stats); energy decision.

### Task 10: Verification

- **Action**: Playwright journeys (buy a potion and sell loot; appraise and enhance a weapon;
  travel 111 → 2101 → 2601 → 161; clear toll gate 100000 and take a card); security review of
  every currency-spending route (row locks, idempotency, negative or huge amounts, race on
  stock slots and card takes), appended to `docs/security-review-m3.md`; coverage ≥ 80%.
- **Validate**: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e` green.
- **Depends on**: tasks 6-9.

## Parallel waves

| Wave | Tasks (agents)                              | Notes                                                        |
| ---- | ------------------------------------------- | ------------------------------------------------------------ |
| 1    | 1 import, 2 schema, 3 assets, 4 game-core, 5 i18n | five disjoint folders; 2 merges first so wave 2 can start   |
| 2    | 6 shops, 7 forge, 8 world, 9 instances     | four disjoint feature folders; coordinator merges `app.ts` and window wiring |
| 3    | 10 verification                             | after wave 2 merges                                          |

Task 9 is the largest; if only three agents are free in wave 2, run 6 + 7 + 8 first and 9 alone.

## Migrations (serialized: all written by task 2, in this order)

| #    | Name               | Content                                                                                                                                                                                                                       |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0004 | `item_instances`   | `inventory_items`: `enhance_level`, `inscribe_level`, `durability`, `can_identify`, `identify_count`, `identify_times`, `props jsonb` (`[{propId, value}]`), `engraved_slot` (null); backfill durability from `MaxHardiness` |
| 0005 | `shops`            | `character_shop_stock` (character, shop type 1-3, slot, item, prices per currency, identify count, appraised, bound), `character_shops` (character, shop type, `last_refresh_at`, `free_restocks_used`), `mystic_spawns` (scene, until, stock per row, sold totals), `character_mystic_purchases` (spawn, item, count) |
| 0006 | `world`            | `characters`: `scenes_entered int[]`; daily quest state with its UTC day (no energy: decision 1)                                                                                                                             |
| 0007 | `instances`        | `characters`: `toll_gate_day`, `toll_gate_entries`; `toll_gate_runs` (one per character: gate, sub gate, point, passed point, state, card state, 5 cards, peeks); `single_gate` (best, current floor, pot, lives, bought, runs today, day); `pub_fight_lineups` (character, scene, 3 NPC ids, last pull, fights today, day) |

## Asset exports (input for task 3)

| Kind          | List                                                                                                                                                                                                           | Backup status                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Field scenes  | 2102, 2103, 2202, 2203, 2302, 2303, 2402, 2403, 2502, 2503, 2601-2605, 2701-2704, 2801-2804 (layers + fight background)                                                                                         | all present (`fields-26xx-28xx.md`)                                            |
| Town scenes   | 161, 171 with `clip_*` buildings                                                                                                                                                                                | present; check unclipped BuildTypes (4, 8, 9, 11; all of 171 but 20/21)        |
| Instance scenes | 3101, 3102, 5001 / 100000-100038, 61-64                                                                                                                                                                       | to verify in the export                                                        |
| World map     | re-export all `scene_<id>` buttons (161, 171, 2102-2503, 2601-2605, 2701-2704, 2801-2803; drop 181)                                                                                                             | present (`UI_WorldMap.swf`)                                                    |
| Monsters      | 104 field keys (list in `fields-26xx-28xx.md`), 1080 toll gate NPCs, n900001-170, n8000xxx pub NPCs                                                                                                             | field keys present; N3102120, N31032 lack `MapUserFace_` (use `UserFace_`); instance NPCs to verify |
| NPCs          | N21003, N21004, N26001-N26013, N27001, N27002, N28002-N28005, n28001 merchant, 161/171 building NPCs, `NpcPhoto_Build_16001-17003`                                                                              | N26100 has no stand animation (photo only)                                     |
| UI            | `UI_NpcShop_Xml`, `UI_ItemBuy` / `UI_MartBuySet_Xml`, `UI_MysticShop_Xml`, `UI_RoleUse`, `UI_EquipMakeRoom_Xml`, `UI_YYEquipCompose_Xml`, toll gate (`UI_TollGateSelect`, `…Challenge`, `…FightMenu`), card flip, `UI_ItemExchange_Xml`, `UI_SingleTollGate_Xml`, `UI_PubFightMonster` | probably in BaseSource; unconfirmed. Text-free skin pieces only, as in M2 |
| Item icons    | every item in shop pools, Wholesale boxes, mystic libs, forge talismans (i161001-i161009, `Icon_Debris136-139`, seals), set pieces, toll gate items and cards, crystals and exchange targets; simplest is all icons in `items.json` | 206 exported today; gaps to report                                            |

## Risks

| Risk                                                              | Mitigation                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Item instance model touches every inventory path (M2 code)        | Single migration with defaults that keep M2 behaviour; task 7 owns `server/src/game/` |
| Currency exploits (original Gold check bug, races on stock/cards) | Per-currency checks, row locks per character, tests for double spend                  |
| Gold has no in-game source until the top-up exists (decision 3) | Gold-only actions ship but stay unreachable for players without Gold; Gift Coupons where the original allows; an admin grant for tests |
| Toll gate scope (21 gates, 1080 NPCs, card flip, Las Noches)      | Solo only; ranking and teams to M4; auto mode optional                                |
| Asset volume (repo already about 170 MB of game assets)           | Export only referenced keys; WebP; measure before committing                          |
| 1,071 field quests, mostly unreviewed text                        | Review main chains only; rest stays marked unreviewed                                 |
| Original data holes (missing tasks 10150-10161, never-attackable bosses, set 8862 without items) | Port faithfully and list them in the UI notes; no invented content |

## Decisions (user, 2026-10-12)

1. **Energy**: not ported at all. Field fights, pub fights and rewards never check or spend energy.
2. **Expired schedules**: the ticket bosses and the Mysterious Merchant are included and active;
   their 2020 end dates are not applied (they would otherwise never spawn).
3. **Gold**: comes from a top-up through a payment gateway, built later (not M3). Gold prices and
   Gold-only actions are ported as in the original.
4. **Free shop restock**: daily (resets at 00:00 UTC), not once per character.
5. **Daily quests** (`DayTaskSystem`, 284 quests in the neutral fields): in M3, owned by task 8
   (`server/src/modules/game`), schema in task 2's migration 0006.
6. **Daily resets**: UTC midnight everywhere (explore, shop restock, toll gates, pub fights,
   daily quests).

## Open questions for the user

1. **World map**: unvisited places hidden but clickable (original) or dimmed and blocked?
   Angel City's "Village" button leads to 2601 (original `ToScene`): keep?
2. **Never-attackable task bosses** (n32025, n31025, n31026, n32030): show locked or hide?
3. **Original quirks**: SkillAdd set bonuses give 0 chance (`% 100`), Dragon Soul/Kage no-op
   bonuses, inscription on rings/amulets with no bonus, unclipped city NPCs. Port as is?
4. **VIP**: no VIP system; treat everyone as non-VIP (no +30% toll gate EXP, no 96.7% Las Noches
    start, no 80% pouch price)?
