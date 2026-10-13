# Plan: Social & Competition (Milestone 4)

**Project**: Pockie Ninja Remastered
**Status**: In progress. Wave 0 and wave 1 merged; wave 2 tasks 5, 7, 8, 9 merged (server, routes wired in `app.ts`) on 2026-10-13. Tasks 1-10 merged (2026-10-13): team lifecycle, team runs, invite by name, Team and Arena windows, arena replays draw player defenders, translation review. Open: task 11 verification (Playwright journeys, security review)
**Complexity**: Large

## Goal

Players can play together and against each other. A ninja can form a team of 2-3 in the neutral
fields 26xx-28xx and clear toll gates and pub fights as a team (captain bonus, a card flip per
member), climb the 22 arena tiers against other players' saved fighters, challenge any tier 2+
player to a Ninjutsu Duel, spend Honor in the Honor shop or on EXP, check the Rankings window and
the weekly toll gate ranking, list and buy items on the Market, keep friends and a blocked list,
whisper, and read mail. Everything is in English.

## Ground rules

Same as milestones 2 and 3: English only, TDD for game logic and anything that moves currency or
items, small conventional commits, `pnpm typecheck && pnpm lint && pnpm test` before every commit.
Data and formulas are ported 1:1 from the original server unless a decision below says otherwise;
original bugs are fixed where they touch money, items, ranks or abuse. Raw SWFs never enter the
repo. Parallel agents work in their own worktree with a private `TEST_DATABASE_URL` (name contains
`test`) and only in the folders their task owns. Every action that moves currency or items is one
Postgres transaction that locks the rows it touches in a fixed order (characters by id, then the
listing / mail / team row), checks state inside the transaction and writes an audit row.

## Specs (read before the matching task)

| Topic                                                | Spec                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| Teams: lifecycle, boards, team fights, captain bonus | `docs/original-data/teams.md`                        |
| Arena, duels, rankings, weekly toll gate ranking     | `docs/original-data/pvp-rankings.md`                 |
| Market (and the dormant direct trade, not built)     | `docs/original-data/trade-market.md`                 |
| Friends, blocking, whispers, mail                    | `docs/original-data/friends-mail.md`                 |
| Existing basics                                      | `battle.md`, `toll-gates.md`, `shops.md`, `world.md` |

## Scope

In: everything in the goal.

Out (later): direct player trade (switched off in the original; decision 1), Market buy orders
("Collect"), mail attachments, the arena row chests and card peeks, the Fortune Cat fight, jar
smashing, the Challenge Zone, the World Tournament, the National League, the Enemy List and its
"Go to enemy" teleport, home servants in teams (M6), top-up and spending rankings (never), the
paid "Show in chat" Market advert, an admin view for reports (M6).

## Decisions (user, 2026-10-13)

1. **Trade**: Market only. No direct trade window in M4.
2. **PvP**: arena, Ninjutsu Duels, core Rankings lists and the weekly toll gate ranking. The
   Challenge Zone, World Tournament and National League are deferred.
3. **Mail**: text only. Systems (Market, arena, friends) send typed system mails
   (`{ templateKey, params }`); nothing is attached.
4. **Teams**: faithful scope (26xx-28xx, toll gate lobby, toll gates, pub fights); not in field
   fights or explore. Fix the original holes: every member must be in the same scene on every join
   path, and every member must meet the toll gate's level range.
5. **Market currency**: Stone and Gold prices, as in the original.
6. **Buy orders**: deferred.
7. **Market delivery**: 15-row market warehouse and a market wallet, claimed by hand.
8. **Market rules**: 1:1 (level 25 to open, fee `floor((12.5 + 0.25 × level) × hours)` Stone,
   8/12/24 h, 5 listings, per-unit price ≤ 1,000,000, 10% tax with a minimum payout of 1,
   equipment needs 2-4 identified properties), without the 06:00-09:00 daily closure.
9. **Arena snapshot**: refreshed automatically on every gear, level or skill change.
10. **Arena costs**: 1:1 (20 free fights a day, then 8 Gold each, at most 15 bought; 20 Gold list
    refresh; duels 10 free a day, then 2 Gold).
11. **Arena extras**: the Honor shop and Honor → EXP only.
12. **Arena bugs**: fixed (one symmetric tie rule, one promotion score cap, Honor as displayed).
    Each fix is noted in `pvp-rankings.md`.
13. **Rankings**: level, Stone, arena, Las Noches best floor, weekly toll gate. Top 100, 10 per
    page, "find me". No top-up, spending or Gold lists.
14. **Weekly reset**: Monday 00:00 UTC.
15. **Team disconnect**: 60 s grace to reconnect, then the member leaves (a 2-member team
    disbands).
16. **Friends**: one-sided add, the target does not need to be online and gets an add-back prompt
    (and a system mail); 100 slots for everyone, no paid expansion. Mutual friends get the
    "home friend" flag (stored now, used in M6).
17. **Blocking**: a separate Blocked list. A block stops whispers, player mail, friend adds, team
    invites and duels from that player.
18. **Mail lifetime and limits**: 7 days for player mail, 30 days for system mail, purged by a
    periodic job; a full inbox refuses new player mail (no eviction); per-sender rate limits;
    level 10 to send player mail.
19. **Filtering**: a server-side English profanity filter masks words in chat, whispers and mail;
    players can report a whisper, a mail or a chat line (stored for the M6 admin view).

### Defaults chosen by the coordinator (change on request)

- Whispers: online only ("The player is offline."), same limiter as world chat, level 10.
- Mail to an unknown name answers "There is no ninja with that name." (names are public in the
  player list and rankings anyway).
- Team invites and applications: one pending prompt per sender and target, 60 s expiry.
- A member reconnecting within the grace period still counts toward the captain bonus.
- Weekly toll gate rank entries are written for every member when the team clears the gate.
- Team boards (team stone) show level and arena tier.
- Arena results reach the defender as a system mail in the battle category; duels stay unrewarded
  and need tier 2 on both sides.
- Market: name search and sort by price or time left (cheap, not in the original); the 10
  tradable quest items stay listable; sale, expiry and purchase notices by system mail.
- English terms: "Team" (never "party"), "Honor" (never "medals"), "Market", "Ninjutsu Duel".

## Folder ownership

| Area                                                       | Folders                                                                                                                         | Owner task |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Data import                                                | `tools/game-data/`, `server/data/game/`, `server/src/game/data.ts`                                                              | 1          |
| DB schema, migrations, system mail and text filter helpers | `server/src/db/`, `server/drizzle/`, `server/src/game/system-mail.ts`, `server/src/game/text-filter.ts`                         | 2          |
| Realtime                                                   | `server/src/modules/realtime/`, `shared/src/schemas/realtime.ts`, `client/src/game/Chat.tsx`                                    | 3          |
| Asset export                                               | `tools/assets/`, `client/public/assets/game/`, `client/src/generated/`                                                          | 4          |
| Friends, blocks, mail, reports                             | `server/src/modules/social/`, `client/src/game/social/`, `shared/src/schemas/social.ts`                                         | 5          |
| Teams                                                      | `server/src/modules/teams/`, `client/src/game/teams/`, `shared/src/schemas/teams.ts`, team hooks in `server/src/modules/gates/` | 6          |
| Market                                                     | `server/src/modules/market/`, `client/src/game/market/`, `shared/src/schemas/market.ts`, `game-core/src/economy/market.ts`      | 7          |
| Arena and duels                                            | `server/src/modules/arena/`, `client/src/game/arena/`, `shared/src/schemas/arena.ts`, `game-core/src/arena/`                    | 8          |
| Rankings                                                   | `server/src/modules/rankings/`, `client/src/game/rankings/`, `shared/src/schemas/rankings.ts`                                   | 9          |
| Translation review                                         | `tools/i18n/`, `client/src/i18n/`                                                                                               | 10         |
| Verification                                               | `e2e/`, `docs/`                                                                                                                 | 11         |

Shared touch points, one line each, merged by the coordinator: route registration in
`server/src/app.ts`, window registration in `client/src/game/windows.tsx`, HUD buttons in
`client/src/game/Hud.tsx` (Friends, Rankings, Market; Mail and Whisper as minimap buttons), the
`shared/src/index.ts` re-export, the arena snapshot hook after equip and level-up
(`server/src/modules/game/actions.ts`, `server/src/game/combat.ts`) and the weekly ranking hook
on a toll gate clear. Feature tasks export the function and ask for the wiring.

## Tasks

### Wave 0 (running): M3 leftovers on Codex

- **A** `fix/bag-capacity`: one bag capacity rule from the original `ContainerModule` (rows or
  cells), used by every caller; then identify rolls on explore item cards and shop gear. Must
  merge before wave 2 (the Market warehouse, mail and team card flips all check bag room).
- **B** `feat/las-noches-auto`: Las Noches auto mode and floor broadcasts on migration 0011.

### Task 1: Data import for M4

- **Action**: extend `tools/game-data/import.ts` and `server/src/game/data.ts` (zod checks):
  `arena-tiers.json` (competerank + competenpc + HonorExp), `arena-config.json` (compete.ini),
  `arena-honor-shop.json` (scoreprize.ini), `toll-gate-rank-rewards.json`
  (Rank{Exp,Money,Item}Reward), `rankings.json` (gametop tab, our English labels, only the lists
  in decision 13), `market-categories.json` (martsellshow tree + item `MartType`), mail config
  (subject 20, body 200, categories), team constants (max 3, min 2; `CaptianMul` is already in
  `toll-gate-config.json`). Arena NPCs are already in `npcs.json`.
- **Validate**: import tests per file (counts: 22 tiers × 20 NPCs, 50 places × 16 gates).

### Task 2: Schema, migrations and shared helpers

- **Action**: write every M4 migration in the order of the table below, plus two helpers that
  wave 2 imports: `sendSystemMail(tx, characterId, category, templateKey, params)` (inserts a
  system mail and applies the caps) and `filterText(text)` (English profanity mask; check a
  maintained npm list such as `obscenity` first, or keep a reviewed word list in the repo).
- **Validate**: migrations run on a fresh DB and on a seeded DB; helper tests.

### Task 3: Realtime

- **Action**: whispers (by name, online only, blocked list respected, limiter, level 10), the team
  channel (channel 4, 5 s cooldown, members only), presence events for friends (online and
  offline) and push notices (new mail, team invite or application, team changed, Market sale),
  the text filter on every chat line, a report event. The 60 s team grace needs a disconnect hook
  that task 6 subscribes to: export `onCharacterOffline` and `onCharacterOnline`.
- **Validate**: socket tests for whisper delivery and refusal (offline, blocked, too fast), team
  channel membership, presence and the filter.

### Task 4: Asset export

- **Action**: text-free UI skin pieces for the team window and boards, Friends, Mail, Market
  (category tree, listing form, warehouse), Arena (tier badges, opponent rows, Honor shop),
  Rankings (`UI_GameTop`); portraits for the 374 arena NPCs; tier icons.
- **Validate**: the export script is reproducible; sizes measured before commit.

### Task 5: Friends, blocks, mail, reports

- **Action**: friends (one-sided add, add-back prompt, remove with notice, mutual flag, online
  status, 100 slots), the Blocked list (decision 17), mail (player and system, categories, read,
  delete by id, reply, block or add friend from a mail, lifetimes and the purge job, inbox caps,
  rate limits, level 10), reports. Client: Friends window (HUD), Mail window (minimap), whisper
  entry from the player list and friends.
- **Validate**: API tests for every refusal (blocked, full inbox, unknown name, rate limit, level),
  delete-by-id ownership, the purge across the 7 and 30 day boundaries.
- **Depends on**: tasks 2, 3.

### Task 6: Teams

- **Action**: team lifecycle (create, invite, apply, accept, refuse, kick, leave, captain transfer,
  fight order, disband) with the same-scene rule, the team boards at the team stone NPCs, the 60 s
  grace, team chat wiring; team runs in toll gates (lobby, every member in the level range,
  sequential duels in fight order, full rewards per member, captain bonus from `CaptianMul`, a
  card flip per member, weekly rank entries per member) and pub fights (the captain's line-up,
  the combo pull for the captain only). Actions a team member cannot take (travel, go home,
  explore, field fights) are refused.
- **Validate**: API tests for every lifecycle path and refusal, a 3-member toll gate clear with
  the captain bonus, a disconnect inside and after the grace, concurrent invite races.
- **Depends on**: tasks 1, 2, 3; wave 0 merged (gates and bag code).

### Task 7: Market

- **Action**: listings that keep the `inventory_items` row (moved out of the bag, so enhance,
  props and durability survive), browsing by category tree with name search and sorting, partial
  purchases, no self-buy, Stone and Gold prices, the fee on listing, the 10% tax, warehouse
  (15 rows) and wallet with claims, cancel, an expiry job that returns items to the warehouse,
  system mail notices, an audit table. Pure rules (fee, tax, eligibility) live in
  `game-core/src/economy/market.ts`.
- **Validate**: game-core tests for fee and tax; API tests for eligibility refusals, concurrent
  buys of the last unit, a buy during expiry, claims with a full bag, currency caps.
- **Depends on**: tasks 1, 2; wave 0 merged (bag rule).

### Task 8: Arena and Ninjutsu Duels

- **Action**: tiers and the NPC phase (tiers 0-1), 18 opponent slots in 3 rows, Elo
  (`delta = int(2000·(W − E))`, scale 100000), Honor per fight, boss promotion, tries and Gold
  costs, list refresh, revenge, streaks and win rate, fight log (15) with replays, the snapshot
  defence (refreshed by a hook, decision 9), the Honor shop and Honor → EXP, duels (list,
  friends, by name; 10 free then 2 Gold; tier 2 on both sides). The defender gets a battle
  system mail.
- **Validate**: game-core tests for Elo and the fixed tie rule; API tests for tries and costs, a
  promotion, a revenge, concurrent attacks on one defender, the snapshot refresh after equip.
- **Depends on**: tasks 1, 2.

### Task 9: Rankings

- **Action**: the lists in decision 13 as SQL queries with indexes (top 100, pages of 10, find
  me); the weekly toll gate ranking (8 gates, top 50, Monday 00:00 UTC, √rank reward tables, one
  claim for last week). Client: the Rankings window (HUD button).
- **Validate**: API tests for ordering and ties, the week boundary, one claim per week.
- **Depends on**: tasks 1, 2; the arena order from task 8 (query only).

### Task 10: Translation review

- **Action**: review every string shown in the M4 windows (team, friends, mail, Market, arena,
  rankings), fix the mistranslated team strings listed in `teams.md`, apply the terms above.
  Light work: Sonnet.
- **Depends on**: tasks 5-9 merged.

### Task 11: Verification

- **Action**: Playwright journeys with two browser contexts (form a team and clear toll gate
  100001; list an item and buy it from another account, claim the proceeds; add a friend, whisper,
  send mail, block; win an arena fight and spend Honor); a security review of every M4 route in
  `docs/security-review-m4.md` (locks, dupes, races, abuse limits, block bypasses).
- **Validate**: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e` green, coverage ≥ 80%.
- **Depends on**: tasks 5-9.

## Parallel waves

| Wave | Tasks (agents)                                     | Notes                                                            |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------- |
| 0    | Codex A bag capacity, Codex B Las Noches auto      | running; both merge before wave 2                                |
| 1    | 1 import, 2 schema + helpers, 3 realtime, 4 assets | four disjoint folders; 2 merges first                            |
| 2    | 5 social, 6 teams, 7 market, 8 arena, 9 rankings   | five feature folders; coordinator wires `app.ts`, windows, hooks |
| 3    | 10 translation review, 11 verification             | after wave 2 merges                                              |

If fewer agents are free in wave 2, run 5 + 7 + 8 first (they only depend on wave 1), then 6
and 9.

## Migrations (serialized: all written by task 2, in this order)

| #    | Name       | Content                                                                                                                                                                                                                                       |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0012 | `social`   | `friends` (owner, friend, home friend flag, created), `blocks` (owner, blocked), `mails` (uuid, recipient, sender or null, category, subject, body or template key + params jsonb, read, created, expires), `reports`                         |
| 0013 | `teams`    | `teams` (id, captain, scene, created), `team_members` (team, character, fight order, joined, offline since), `team_prompts` (invite or apply, from, to, team, expires); toll gate runs get a team id                                         |
| 0014 | `market`   | `market_listings` (id, seller, inventory item, count left, unit Stone, unit Gold, category, expires), `market_warehouse` (owner, inventory item), `characters.market_stone` and `market_gold` (wallet), `market_audit`                       |
| 0015 | `arena`    | `arena_players` (character, tier, score, streak, fights, wins, tries + day, bought tries, duel tries, refresh time, snapshot jsonb + updated), `arena_opponents` (18 slots, beaten), `arena_logs` (15 per player, replay)                    |
| 0016 | `rankings` | `toll_gate_weekly` (gate, week, character, schedule, time), `toll_gate_weekly_claims`; indexes for the ranking queries (level, Stone, arena order, Las Noches best floor)                                                                    |

## Risks

| Risk                                                                    | Mitigation                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Item or currency duplication on the Market (the original had several)   | One transaction per action, row locks in a fixed order, conditional updates, audit table, race tests |
| Gold on the Market becomes an RMT channel                               | Audit table from day one, report button; revisit when the Gold top-up ships                          |
| Teams need live state across sockets and processes                      | Teams in the DB, realtime only pushes; the grace timer is derived from `offline_since`               |
| Spam and harassment (whispers, mail, friend adds)                       | Blocked list, level 10, rate limits, server filter, reports                                          |
| Arena snapshot drift or exploits (sandbagging a weak copy)              | Automatic refresh on every change (decision 9), snapshot built by the same code as live fights       |
| Scheduled jobs (mail purge, Market expiry, weekly reset) in one process | Idempotent jobs keyed by time; queries also filter by `expires_at`, so a late job is harmless        |
| Wave 0 still touching `server/src/game/` and `modules/gates/`           | Wave 2 starts only after both Codex branches merged                                                  |

## Open questions for the user

None.
