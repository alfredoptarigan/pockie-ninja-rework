# Reborn UI audit (2026-10-14)

**Milestone closed 2026-10-15**, pending one final server test run on macOS: see
[9. Closing checks](#9-closing-checks-2026-10-15).

Static reverse engineering of Pockie Ninja Reborn's shipped bundle (`static/js/main.03c73510.js`,
locale `locales/en/translation.json`), live DOM reads of the logged-in client, and an inventory of
our client. The raw per-window specs (offsets into the bundle, layouts, labels, events) stay in the
gitignored `data/reborn-raw/audit-2026-10-14/` (`reborn-windows-A-L.md`, `reborn-windows-M-Z-hud.md`,
`ours-ui-inventory.md`, the compare-tooltip DOM capture). This file is the gap list and the order of
fixes. Reborn's canonical look is its "original" theme (`newUI` is forced off on load).

Status: **match** = same layout and behaviour; **gap** = exists but differs; **missing** = not in our
game; **system** = needs a whole game system we do not have (listed, not part of the UI fixes).

## 1. Inventory (window, items, tooltip, menu)

| Reborn                                                                                                                                                                                                                                                                                                                                               | Ours                                                                                                                  | Status              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------- |
| I-V bar = equipment sets (loadouts); IV-V need VIP; click `setActiveLoadout`                                                                                                                                                                                                                                                                         | equipment sets I-V (`POST /api/game/sets/active`), IV-V need VIP                                                      | match               |
| Outfit slot shows the active outfit as an item `+N` (red when under its level); right-click "Manage" opens Manage Outfit (visual outfit 250 gold)                                                                                                                                                                                                    | always empty (outfits are a character column)                                                                         | gap                 |
| Weapon slot art by the outfit's weapon type (Sharp/Fists/Blunt)                                                                                                                                                                                                                                                                                      | always Weapon2                                                                                                        | gap                 |
| Pose scaled 0.65 bottom-centred; active bloodline background rotating behind it                                                                                                                                                                                                                                                                      | pose 124x208 bottom-centred; slot-1 bloodline art rotating (9 s) behind it; BP under it                               | match               |
| Title plate is a title `<select>` (`setTitle`); hover lists title stats                                                                                                                                                                                                                                                                              | title `<select>` over the title art; hover lists stats and time left                                                  | match               |
| Talent disabled under level 60                                                                                                                                                                                                                                                                                                                       | always enabled (our talents have no level gate)                                                                       | keep (rules differ) |
| Hide = privacy, hides your stats from others (`setCharacterPrivacy`)                                                                                                                                                                                                                                                                                 | hides tooltip stats                                                                                                   | gap                 |
| Bag: 10 tabs x 60 tiles, items 1x1 / 2x2 / 2x3, **positions stored server-side**                                                                                                                                                                                                                                                                     | client-side first-fit layout                                                                                          | gap                 |
| Left click picks an item up; click a cell / item / slot to move / swap / equip; dragging also works; hover a tab 300 ms to switch; green/red slot highlight                                                                                                                                                                                          | click opens the menu                                                                                                  | gap                 |
| Double-click or right-click opens the menu; equipped items have no menu (drag back to unequip) except the Outfit slot                                                                                                                                                                                                                                | click/right-click menu, worn items have Unequip                                                                       | gap                 |
| Menu: Equip, Enhance Wing, Use, Use Multiple, Split, Melt, Melt Multiple, Sell (confirm), Lock/Unlock, Link in Chat, Remove Gems                                                                                                                                                                                                                     | Equip/Use/Unequip, Appraise, Repair; most gear shows "No actions" (client equip list is the M2 slice: 145 of 617 ids) | gap (bug)           |
| Cell: tier glow (0-6 colours), `x{n}` stacks, red `Lv:N` when over level, `+N` on outfit/pet, lock icon (click to toggle), rental timer, Quest label                                                                                                                                                                                                 | border colour, `+N`, count                                                                                            | gap                 |
| Tooltip: label EQUIPPED/INVENTORY ITEM (compare), name by refine lines, gold rule, BOUND/UNBOUND chip, Synthesis Value (14/22/31/39/46), Item Type, then REQUIREMENTS, CORE ATTRIBUTES (arrows), INSCRIPTION, SPECIAL ATTRIBUTES, REFINEMENT (`+roll (min - max) Tn`), ENHANCEMENTS (n/16), SOCKETED GEMS, SET BONUSES; footer details / locked line | our GearDetails list                                                                                                  | gap                 |
| Compare tooltip automatically when the active set has a different item in that slot; ▲ green / ▼ red / ● equal                                                                                                                                                                                                                                       | none                                                                                                                  | missing             |
| No success toast after equip/use/unequip; failures as a 3 s centred toast ("Invalid Swap", "Inventory is full! ...")                                                                                                                                                                                                                                 | inline "Equipped X." notices                                                                                          | gap                 |
| Side buttons: Compose = Portable Function (Synthesis / Recast / Inscribe / Impress); Multi Sell (grade filter, Sell/Clear); Collection (Avatars / Pets / Gear Sets / Wings); Wardrobe (4x5 outfits); Reroll (pets); Sort Inventory (Current Tab / All Tabs, stack)                                                                                   | Compose = forge, Collection = wings, Sort = client toggle, others disabled                                            | gap                 |
| Sockets / gems / enchantments                                                                                                                                                                                                                                                                                                                        | none                                                                                                                  | system              |

## 2. Stats window

| Reborn                                                                                                                                                                                              | Ours                                                                                                               | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| 328x448: title plate, Name / Level, Village ("Fire") / Rank (rank art, e.g. "PREP III"), EXP bar "cur / next (pct%)", 4 stat groups, footer "Hover over stats for details"; per-stat hover tooltips | adds Honor instead of Rank, "Fire Village", an avatar preview, a pouch refill strip and a Training row; scrollbars | gap    |

## 3. HUD

| Reborn                                                                                                                                                                                                              | Ours                                                                                          | Status  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| Bottom bar 706x33: Inventory, Character, Skills, Tasks (toggles Quest Navigation), Ninja House, Social (glows on requests/mail), Rankings, Bankai (Lv 30), Clan (Lv 30); EXP strip left of it                       | Bag, Character, Skills, Quests (Quest Log window), Friends, Rankings, Market, Shop (disabled) | gap     |
| Top-right event icons in villages (Impel Down, Zanpakuto, Dungeons, Ninja Mall, Konoha Boutique, Akatsuki, Hashirama, Tsunade Pub, Ninja Diary, Tailed Beast, Shichibukai, Sannin Test; seasonal) + Market and Home | Events drop-down and Arena button in the top bar                                              | gap     |
| Top bar: Stones / Gold / Gift certificates (K/M/B over 10,000), Patreon, server clock, ping, sound toggle, Welcome, Discord, Settings, Referal, Website                                                             | currencies, Arena, Events, Settings drop-down, coupon button                                  | gap     |
| Portrait: Battle Power number (flashes ±N), VIP badge (perks tooltip), village icon, HP/MP %, VP cur/200, refill icons open Carrier Bag (HP/MP) and Energy Refill (VP); CLAIM 20-minute reward                      | no BP, refill icons inert, no VP, coupon button elsewhere                                     | gap     |
| Map plaque                                                                                                                                                                                                          | same pieces                                                                                   | match   |
| Monster cards: left-click Monster Information, right-click Fight / Chain Attack / Drops; Quest pill                                                                                                                 | click fights, hover drops                                                                     | gap     |
| Chat: tabs All, World, Village, Party, Trade, Clan, System, PM tabs; channel drop-down, 54 emoji, item links `[Name]` with tooltip, `n/250`                                                                         | All, World, Scene, Team, Whisper; no emoji or item links                                      | gap     |
| Party portraits left-middle with mini bars, crown, kick/leave X                                                                                                                                                     | TeamHud under the card                                                                        | gap     |
| Toasts: one at a time, centred, 3 s, `ui/notice/bg.png`; server `notice` and `announcement` marquee                                                                                                                 | inline notices                                                                                | missing |

## 4. Other windows

Present in both, to be re-laid out against the raw specs: Skills (done), Quest Navigation, Rankings,
Settings, Ninja Diary / Daily Login / Weekly Rewards, Card Room, Kennel / Pet Shop / Pet Tracing,
Bloodline Limits / Soul Synthesis / Soul Refine, Talent, Las Noches Tower, Dice of Fate, Tailed Beast
(+ Leaderboard, Rewards), Arena (+ weekly rewards), Collection (wings part), Wing Enhancement, Storage
(our Market warehouse), Task Board (our daily quests), Village Elder (our NPC dialog).

Missing windows that only need UI over systems we have: Carrier Bag, Energy Refill, Multi Sell, Sort
Inventory, Manage Outfit (visual outfit), Monster Information, Player List (Area / Friend / Apprentice),
View Character, Notice / Warning / Success prompts, Use Multiple.

Missing systems, all built on 2026-10-15 except the parts listed in section 8: outfits as items and
Wardrobe, gems / enchantments / Portable Function (Synthesis, Recast, Impress), Bankai, Clans (Clan,
Browser, Wars, Protection, Applications, Contribution), Ninja House, Dungeons / Impel Down /
Zanpakuto / Shichibukai / Sannin Test / Akatsuki / Hashirama, Ninja Mall / Konoha Boutique / Tsunade
Pub (lazy chunks, content unknown), Hunt / Chain Attack, Cleromancy / Fortune Wheel / Jar Shop /
Hero Coins / Championship / Festival / Dungeon shops, Ninja Garden / Ninjutsu Garden / Picnic,
Adventure with Jiraiya, Kage Level Ninja, trading, Squad Arena, Tournament, pet Reroll, Apprentice.

## 5. Fix order

1. **Items and bag** (the reported bugs): item facts from the server for every item (type, slot,
   usable, level, sell price, stack size, bound, locked); stored bag positions with move / swap /
   equip-by-click and drag; double-click / right-click menu with Equip, Use, Use Multiple, Split, Sell,
   Lock / Unlock, Link in Chat, Enhance Wing; Reborn's tooltip and compare tooltip; cell visuals; no
   success notices, failure toasts; Multi Sell and Sort Inventory windows; Outfit slot as the outfit
   item with Manage; Hide as a privacy setting.
2. **Stats and HUD**: Stats window; toasts; portrait (Battle Power, refills → Carrier Bag / Energy
   Refill, VP); bottom bar with Reborn's nine icons (Ninja House, Bankai and Clan disabled with their
   level gates until those systems exist; Tasks toggles Quest Navigation); top-right feature icons for
   what we have; top bar; monster card click / right-click and Monster Information; chat tabs, emoji
   and item links.
3. **Windows we share**: re-lay each one out against its raw spec.
4. **Systems**: one milestone each, in an order to agree.

## 6. Decisions agreed with the user

Where Reborn keeps a number on its server or the spec leaves a rule open, these are the values we use:

- **Repair all** repairs worn gear in every equipment set (I–V), not only the active one.
- **Clans**: a second clan costs 500 Gift Certificates. Donation points: 15,000 Stone = 1 point,
  1 Gift Certificate = 1.5 points, 1 Gold = 75 points. Only the leader can withdraw from clan storage.
- **Bankai**: unlocking a weapon is free; one Upgrade press raises one level.
- **Scroll Dungeons**: 25 shared attempts a day, reset at 00:00 UTC (Reborn: midnight Lisbon); boss
  builds and stats are ours; drops are our 7-day and permanent scrolls (no 3-hour scrolls).
- **Outfits**: a set without an outfit falls back to set I's outfit; set I's outfit cannot be
  unequipped. The Wardrobe opens as a panel inside the Inventory.
- **Impel Down gates** open at levels 61, 67, 73, 79, 85 and 90 (Reborn: 61-111 in steps of 10),
  because our level cap is 90. Raise them back when the cap rises.
- **Boss weapons**: Scroll Dungeons bosses and Impel Down enemies always carry at least a same-level
  weapon's attack (`BOSS_WEAPON_PER_LEVEL`), so taking off your weapon does not disarm them.
- **Gems**: removing gems costs no Gold, as in Reborn (2011 charged 4-191 Gold by gem level).

## 7. Values to confirm (Reborn keeps them on its server)

Every feature built from this audit takes Reborn's numbers where its client, `serverConfig.json` or
our 2011 data has them. Where Reborn's server decides, the value is ours and sits in one marked
constant. Confirm or replace them here; each row names the file to change.

| Feature                | Constant                          | File                                           | What is ours                                                          |
| ---------------------- | --------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Scroll Dungeons        | `BUILDS`, `BOSS_WEAPON_PER_LEVEL` | `server/src/modules/dungeons/bosses.ts`        | boss builds and stats, 25 attempts a day                              |
| Impel Down             | `IMPEL_DOWN_PLACEHOLDERS`         | `server/src/modules/impel-down/floors.ts`      | enemies, EXP, crystal drop chances                                    |
| Zanpakuto              | `ZANPAKUTO_REFINE_RANGES`         | `game-core/src/zanpakuto/zanpakuto.ts`         | stat ranges per tier (crystals add nothing to combat until confirmed) |
| Tsunade Pub            | `TSUNADE_PUB_PLACEHOLDERS`        | `server/src/modules/tsunade-pub/config.ts`     | tier weights, prize pool, sell values                                 |
| Konoha Boutique        | `BOUTIQUE_PLACEHOLDERS`           | `server/src/modules/konoha-boutique/config.ts` | level table, symbol weights, line values, coin prices, rewards        |
| Ninja Mall             | `MALL_DAILY_LIMIT_PLACEHOLDERS`   | `server/src/modules/mall/catalogue.ts`         | daily limits (catalogue is the 2011 Mall)                             |
| Market Board           | 2011 values                       | `game-core/src/economy/market.ts`              | level 25, 5 listings, 8/12/24 h, listing fee, max price               |
| Gems                   | `GEM_PLACEHOLDERS`                | `server/src/modules/forge/gems.ts`             | enchant Gold (removing gems is confirmed free)                        |
| Portable Function      | `PORTABLE_FUNCTION_PLACEHOLDERS`  | `server/src/game/portable-function.ts`         | Synthesis Stone and Impress Gold fees, recast cap                     |
| Akatsuki               | `AKATSUKI_PLACEHOLDERS`           | `server/src/modules/akatsuki/config.ts`        | hunt level, ambush chance, pair stats                                 |
| Hashirama vs Madara    | `HASHIRAMA_PLACEHOLDERS`          | `server/src/modules/hashirama/config.ts`       | leader stats, cooldown, spins, Fortune Wheel pools                    |
| Shichibukai            | `SHICHIBUKAI_PLACEHOLDERS`        | `server/src/modules/shichibukai/config.ts`     | attempts, tile odds, boss strength, rewards                           |
| Sannin Test            | `SANNIN_PLACEHOLDERS`             | `server/src/modules/sannin-test/config.ts`     | dice, title ranks, examiners, Perfect cost                            |
| Home, Garden, Picnic   | `HOME_PLACEHOLDERS`               | `shared/src/schemas/home.ts`                   | seeds, rest, Random Level odds, warehouse, boxes                      |
| Hunt                   | `HUNT_PLACEHOLDERS`               | `shared/src/schemas/hunt.ts`                   | hunts a day, reward, level range                                      |
| Adventure with Jiraiya | `ADVENTURE_PLACEHOLDERS`          | `shared/src/schemas/hunt.ts`                   | hourly rewards, special item                                          |
| Trade                  | `TRADE_CONFIG`                    | `game-core/src/economy/trade.ts`               | tax rates, request expiry                                             |
| Arena Weekly Rewards   | `WEEKLY_REWARD_PLACEHOLDERS`      | `server/src/modules/arena/config.ts`           | reward tables                                                         |
| Squad Arena            | `SQUAD_ARENA_PLACEHOLDERS`        | `server/src/modules/arena/config.ts`           | free tickets, match format, Exchange                                  |
| Championship           | `CHAMPIONSHIP_PLACEHOLDERS`       | `server/src/modules/arena/config.ts`           | schedule, shop                                                        |
| Festival Shop          | `FESTIVAL_SHOP_PLACEHOLDERS`      | `server/src/modules/festival-shop/config.ts`   | offers, costs (no token source yet)                                   |
| Pet Reroll             | `REROLL_CONFIG`                   | `game-core/src/pets/reroll.ts`                 | Stones per roll, odds                                                 |
| Master and Apprentice  | `APPRENTICE_CONFIG`               | `game-core/src/social/apprentice.ts`           | all rules (Reborn has none in its client)                             |
| Clan Protection        | `PROTECTION_PLACEHOLDERS`         | `shared/src/schemas/clan-activities.ts`        | rewards, boss level                                                   |
| Clan Missions          | `CLAN_MISSION_PLACEHOLDERS`       | `shared/src/schemas/clan-activities.ts`        | costs, bosses, rewards                                                |
| Clan Wars              | `CLAN_WAR_PLACEHOLDERS`           | `shared/src/schemas/clan-wars.ts`              | reward scaling outside +-10% BP                                       |
| Energy, Battle Power   | `REBORN_SERVER_PLACEHOLDERS`      | `shared/src/schemas/energy.ts`                 | starting energy, Battle Power formula                                 |

Days and weeks reset at 00:00 UTC (Monday for weeks) everywhere; Reborn uses Lisbon time.

## 8. Left for a later milestone

Reborn parts not built in this milestone, by feature: the Xmas event (the Festival Token source),
Market Auction and Buy Orders, the Synthesis Recipes window and Auto Fill, outfit stars and Purify
Stones, Reborn's Storage window, outfit titles and Red outfits (absent from our data), Clan Wars item
packages (mail has no attachments), war replays, and the animations (Shichibukai and Sannin dice,
Akatsuki holograms, Tsunade Pub glows).

## 9. Closing checks (2026-10-15)

Run on a Windows 11 laptop (PostgreSQL 18), migrations up to `0059_energy`.

| Check             | Result                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate` | pass                                                                                                |
| `pnpm typecheck`  | pass (committed code)                                                                               |
| `pnpm lint`       | pass                                                                                                |
| `pnpm test`       | client, shared, game-core pass; tools 420 pass, 15 skipped (no game backup on this machine)         |
| server tests      | 1583 pass, 1 fail, 8 skipped of 1592; both causes fixed afterwards (below), final full run not done |
| `pnpm e2e`        | 63 pass, 1 fail (clan journey: the API restarted under `tsx watch` mid-test; passes alone)          |

Fixed while closing:

- `aae27580` the battle replay's Skip button sat under the chat panel (field fights now mount in the
  HUD layer).
- `6c6d0da9` e2e draws WebGL with the GPU on Windows (Direct3D 11); SwiftShader starved clicks.
- `9821e9d6` text files check out with LF on Windows too (byte-for-byte generator tests).
- `482540f6` the importer builds the Home crops into `pet-foods.json` (it was edited by hand).
- `f9c59340` asset tests that read the game backup skip when it is absent.
- `ceba9767` the Zanpakuto journey runs its grant script without `pnpm` (a `.cmd` on Windows).
- `768da64f` e2e seeding says psql must be on PATH.
- `e6968198` server tests read the repository `.env` (a password in `TEST_DATABASE_URL`).
- `c67927e6` the migrations scratch database is `pockie_remastered_migrations_test`.
- `48630fe8` stopping the job timers waits for running jobs (they outlived a test into the next
  truncate and deadlocked; on shutdown they raced the database close).
- `161678a0` the Team Stone attempts test no longer depends on winning a random fight (about 2%).

Still to do on macOS: one full `pnpm test` for the server to confirm 1592 green after `48630fe8`,
`c67927e6` and `161678a0` (each was verified alone: security-m4 3/3, migrations 9/9, team-stone 5/5).
The Windows run was stopped because PostgreSQL there fsyncs every truncated table at checkpoints
(over 150,000 files per checkpoint), which makes a full run take about 45 minutes.

Notes for Windows: e2e needs `psql` on PATH (`D:\PostgresSQL18\bin` here); set `E2E_PORT` /
`E2E_API_PORT` when `pnpm dev` holds 5173 / 3000. `pnpm typecheck` currently also checks another
session's untracked `tools/assets/reborn-skill-effects.ts`, which does not compile yet.
