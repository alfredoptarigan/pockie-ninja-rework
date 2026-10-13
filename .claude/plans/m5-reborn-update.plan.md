# Plan: Reborn Update (Milestone 5)

**Project**: Pockie Ninja Remastered
**Status**: Planned (2026-10-13). Nothing started; waiting for the user's answers to the open questions.
**Complexity**: Large
**Reference (primary source)**: `m5-reborn-reference.md`, normalized data in
`data/reborn-raw/re/normalized/{talents,bloodlines,skills,quests,events}.json`, raw
`data/reborn-raw/re/serverConfig.json`, art under `data/reborn-raw/assets/` (manifest
`data/reborn-raw/re/assets-manifest.json`). All of `data/reborn-raw/` stays gitignored.

## Goal

A ninja past level 50 trains up to 3 of 8 talents, which narrow an enemy's stat lead in fights. The
ninja hands in pub-fight loot at the Ninja House to unlock up to 44 bloodlines, activates 3 for flat
and bonus stats, and discovers, synthesizes, refines and sockets souls that feed prayer. The ninja
learns 12 scroll skills from 7-day or permanent scrolls (max 2 slotted). Outfit ultimates ("Secret
Technique") play with Reborn's full-screen effect art, including the 19xx0 "new ultimate" variants.
A new tutorial and story chain, daily login, weekly rewards, Dice of Fate, the twenty-minute reward,
the weekly Tailed Beast event and ranked Team Stone are playable. Everything is English.

## Ground rules

Same as M2-M4: English only, no emojis; TDD for game logic and for anything that moves currency or
items; small conventional commits; `pnpm typecheck && pnpm lint && pnpm test` before each commit.
Every currency/item action is one Postgres transaction that locks the character row first, then
feature rows by id, and checks state inside the transaction. Parallel agents (max 3 at once) get
their own worktree and branch, a private `TEST_DATABASE_URL` whose name contains `test`, and only
their task's folders; they never push or merge `main`. The coordinator merges one branch at a time
and does the shared one-line wiring.

## Specs (read before the matching task)

| Topic | Source |
|---|---|
| Talents | reference §1, `talents.json`, `serverConfig.TALENT` |
| Bloodlines, souls, prayer | reference §2, `bloodlines.json`, `serverConfig.bloodline` |
| Scroll skills, secret technique | reference §3, `skills.json`, avatar `data.json` files |
| Quests | reference §4, `quests.json`, `docs/original-data/quests-items.md` |
| Events | reference §5, `events.json` |
| Existing engine | `docs/original-data/battle.md`, `characters.md`, `toll-gates.md` (pub fights) |

## Scope

**In (M5, in this order):** talents; bloodline limits; scroll skills; secret technique playback;
bloodline souls and prayer; tutorial (subset) and story chain; events: Daily Login, Weekly Rewards,
Dice of Fate, Twenty-Minute Reward, Slot Machine (= our pub fight), then Tailed Beast and Team Stone.

**Out (later):** outfit stars star-up (decision 9); bloodline and skill presets; skill 1809 Balsam
(no learning source); Pet Tracing and Planting (pets, M6); Sannin Test; seasonal and admin-started
events (Summer, Christmas, Hashirama vs Madara, Akatsuki); Fortune Wheel, Championship, Squad/Team
Arena, Arena Boss, Shichibukai; all clan systems and Bankai; Kage rental gear (items missing from our
data); Team Stone top-10 weekly bonus; tutorial quests for systems we lack; secret-technique art for
the 51 outfits nobody can fight with yet and the 34 Reborn-only outfits (M6 with outfit collection);
after M5: fetch audio, pets, wings, auras, general effects and card art (roadmap).

## Decisions

### User (2026-10-13)

1. **Import 1:1.** Reborn data (numbers from `serverConfig.json` and the normalized files) and
   Reborn art may be imported 1:1. Art is converted to WebP and committed under
   `client/public/assets/reborn/**`, tracked by Git LFS (`.gitattributes` done). Import only what M5
   uses. Reborn sentences (quest text, tooltips) are still not copied (roadmap); names are the
   glossary default.
2. **Scope order** as in the reference: talents, limits, scroll skills, secret technique plus outfit
   stars, souls, quests, events (cheap dailies including the Slot Machine first, then Tailed Beast
   and Team Stone). Seasonal, clan and Bankai later.
3. **Server-only unknowns get our own design.** Each one is a decision below with a proposed value,
   kept in one constants file per feature so it can be tuned.
4. **After M5:** fetch audio, pets, wings, auras, general effects and card art.
5. **Level cap** stays 90 (Reborn uses 70). Decisions 6 and 13 cover the effect on talents and
   bloodlines.

### Design (proposed by the planner; change on request)

6. **Talent cap:** `talentLevel <= max(0, level - 50)`, kept 1:1. Talents unlock at 51 and reach 40
   at our cap 90; `expNeeded[1..40]` comes from serverConfig (60 entries exist).
7. **Talent EXP:** every upgrade (Normal or Gold) gives **100 EXP**, with a **10% crit** for 3x
   (300). Cost and attempts are 1:1: `costNeeded[n]` for the n-th attempt of the day, 40 attempts
   shared by all talents, at most 3 active, level 1+ to activate. Cost entries 41-80 are unused.
8. **Talent combat rule, one formula for all 8:** when the enemy's stat X beats the stat that
   counters it, the enemy's effective X becomes `X - (X - mine) * L / 100`, applied at the roll where
   X is read, against the current opponent only. Reborn's ratio wording for talents 1, 6 and 7 is
   replaced by the same narrowing, so a talent never pushes past parity.

   | # | Talent | Narrows |
   |---|---|---|
   | 1 | Pierce | enemy `pierce` vs my `parry` |
   | 2 | Block | enemy `parry` vs my `pierce` |
   | 3 | Armor Break | enemy `neglectDefense` vs my `defense` |
   | 4 | Defense | enemy `defense` vs my `neglectDefense` |
   | 5 | Critical | enemy `crit` vs my `tough` |
   | 6 | Constitution | enemy `tough` vs my `crit` |
   | 7 | Hit | enemy `hit` vs my `dodge` |
   | 8 | Dodge | enemy `dodge` vs my `hit` |

9. **Secret technique (10000) is Reborn's name for the outfit ultimate.** `execute.ts` already
   implements Reborn's rule at an avatar-level gap of 0 (`executeOdds`: below 15% HP, 10% chance), so
   no new skill is added; the UI calls the ultimate "Secret Technique". Outfit stars need outfit
   tiers +31 and duplicate outfits, which arrive with M6's outfit collection. M5 ships only an
   optional `secretThreshold` on `FighterInput` (default 15, 20 at 5 stars); star-up, the +1 slot at
   2 and 5 stars and the 1-star and 4-star bonuses move to M6 (open question 1).
10. **Variant art:** skill 19xx/22xx plays the outfit's `secret_technique` atlas; the new ultimate
    `id*10` plays `secret_technique-ru-<id*10>-v1` plus its `-back` concurrent layer. No in-scope
    outfit has two variants for the same skill, so the FNV-1a pick is not needed.
11. **Bloodline stat aggregation:** sum over the up to 3 active limits of base Str/Agi/Sta (x100 into
    our `strength`/`agility`/`stamina`; our attributes are Reborn's x100, `isv 1.2` matches
    `StrengthUp 120`), bonus stats, socketed soul values and the prayer bonus. Sum first, then
    truncate, into `Bonuses` like equipment.

    | Reborn stat ids | Our field |
    |---|---|
    | 1, 2, 3 | attributes (x100) |
    | 4 | `defense` |
    | 5 | `neglectDefense` |
    | 6 | `dodge` |
    | 7 | `hit` |
    | 9 | `hpMul` (already per-mille) |
    | 11 | `attackMul` |
    | 12 | `atkTimeMul` |
    | 16 | `critAttach` |
    | 17 | `tough` |
    | 18 | `defenseMul` (value / 10) |
    | 19 | `pierce` |
    | 31-40 | `skillAdd0..9` (+N, read by `skillChance` as +N%) |

    Combat ratings are 1:1 (Reborn's live stats use the 2011 engine scale, e.g. `SkillAdd4: 1500`).
    Task 1 checks ids 18 and 31-40 against `skill-adds.json` element names before relying on them.
12. **Bloodline turn-ins:** `itemsPerDay = 10` counts turn-ins (40 items a day); reading it as 10
    items would make limit 41 take 75 days (open question 2). Required level gates turn-in and
    activation. `bg` is ignored.
13. **Level-84 limits are reachable** at our cap 90. Soul levels 9-10 (which need 91) are clamped to
    90.
14. **Limit item source: the Slot Machine is our pub fight.** Reborn's roll uses the same
    n8000001-series NPCs and hourly pull; its bands (Lv16/26/31/41/61/71) are our pub-fight scene
    levels 2601, 2605, 2602, 2604, 2704, 2802. Each pub-fight win has a **30%** chance to give 1
    random limit item whose band is at or below the scene level; a matched combo pull adds **4** of
    one such item. The window keeps the name "Pub Fight".
15. **Souls:** discover 10 a day (30 with VIP); type uniform over 1-13; level odds **70% L1, 25% L2,
    5% L3**. Inventory 250; a limit has 5 sockets with one soul per type. Synthesis: 3 souls of the
    same level always give 1 soul one level higher. Refine: each fuel soul rerolls the target to a
    different type. Values from `valueByLevel` 1:1; Life maps to `hp`, Energy to `mp`, Sharp and
    Edge to flat `minAttack`/`maxAttack`, Speedy to `atkTimeMul`.
16. **Prayer:** points to next level `5000 x 2^level`, each soul gives `100 x 3^(soulLevel-1)`, max
    level 9, switching attribute resets (all 1:1). `bonusStats` is ours: **8 x prayerLevel** Reborn
    points (x100 internal) on the chosen attribute, 72 at level 9.
17. **Scroll skill scripts** are written from the tooltips at skill level 1 (Reborn only showed
    level 1). `probability` is the low end of the tooltip range; `skilladdtype` is the skill's
    element, with the SkillAdd bonus capped at the high end. Chakra `((x))` multiplies the
    level-based MP amount the ninjutsu scripts already use. New fight buffs use ids **15001-15099**.
18. **Scroll skill rules:** items 540001-540012 last 7 days; reuse extends from
    `max(now, expiresAt)`; using one is refused if the skill is already permanent. Items
    540101-540112 are permanent. At most 2 scroll skills per skill-bar tree. Expired skills drop out
    of fights at once and are deleted lazily.
19. **Scroll sources:** 7-day scrolls from pub-fight combo prizes (5% weight) and the Tailed Beast
    Essence shop (300 Essence); permanent scrolls from the S-Rank Secret Technique Scroll treasure
    pool (i159000, 1% weight).
20. **Quest ids** are `800000 + rebornId` (820001-820022, 830001-830118), because the 20xxx and 30xxx
    ids collide with 2011 ids and the 8xxxxx range is unused. Rows use the Task.ini/SubTask.ini
    shape, so `quests.ts` runs them unchanged.
21. **Tutorial subset:** the 9 quests whose system exists (20001, 20002, 20003, 20004 identify,
    20005, 20009, 20016, 20017, 20018). The other 12 wait for their systems.
22. **Story chain** (118 quests) is a side chain ("Reborn Story", its own Quest log group), levels
    1-70, using existing NPCs and field monsters per level band. Step types: KILL, COLLECT, TALK, plus
    new COMMAND ids for Reborn types 9 (enhance), 13 (arena fight), 14 (Las Noches floor) and 15
    (bloodline unlock). Rewards are **50%** of the 2011 main-line EXP and Stone at the same level so
    the two chains do not double progression. Quest 30022's capture (level 21; kill 8 x 33010 and
    6 x 33020; 3060 EXP, 36000 Stone) is the calibration point. Text is ours (AI-assisted with the
    glossary, reviewed in task 15).
23. **Resets:** daily 00:00 UTC, weekly Monday 00:00 UTC (M4 decision 14), monthly on the 1st
    00:00 UTC. Europe/Lisbon is not used.
24. **Daily Login and Weekly Rewards** keep Reborn's rewards 1:1 (all items exist). Weekly
    activities we have: arena duel 40, duel a friend 10, Slot Machine (pub fight) 50, Las Noches 45,
    twenty-minute reward 20, global chat 10, mission (daily quest) 20; Valhalla is replaced by "Clear
    a toll gate" 50, so 245 points are reachable. The Daily Login cycle advances only when a day is
    claimed.
25. **Dice of Fate 1:1:** 10 rolls a day; replenish (10k Stone) only after all rolls are used; curse
    clear 5k Stone; 6 fair dice; net lucky dice decide the tier (4+, 2-3, -1..1, -2..-3, -4 or less).
    Buffs 80101, 80102, 80201, 80202 with Reborn's values become non-fight buffs; "Con" maps to
    `tough`, the other 7 stats 1:1.
26. **Twenty-Minute Reward:** 20-minute cooldown (the captured 5 minutes looks like tuning), 10 Gift
    Coupons per claim, 6 claims a day.
27. **Tailed Beast (weekly world boss):** beasts 1-9, two a day; day d (Monday = 1) has beasts
    `((2d-2) mod 9) + 1` and `((2d-1) mod 9) + 1`. Level `25 + 5(id-1) + 25·mode` (client formula);
    the fighter is built from the closest-level Las Noches boss row with HP shared per beast and
    difficulty (750M normal, 1B hard, 1.25B rampage). 10 free tickets a day; a fight costs 1, 3 or 5.
    Honor = damage / 100k; Essence = Honor. Boxes at 5, 10, 20 fights (items 500001-500003 exist).
    The weekly Kage is the top Honor per village; the Kage pick is limited to existing items (Seal
    Breaker, Recast Talisman, Level 10 Stone Bag, Kage Title item 159140). The shop has Reborn's
    three existing items (150, 80, 200 Essence, the last limited to 5) plus decision 19.
28. **Team Stone:** level 50+, 25 attempts a day, teams of 3; the queue fills empty spots with arena
    snapshots of similar score after 15-30 s. The fight runs as sequential duels (like team toll
    gates). Score moves ±18..22 (+22/-18 vs a 20% stronger team, 20/20 even, +18/-22 vs a 20% weaker
    one, linear between). 8 leagues pay Battle Coins 1:1 by system mail if at least one fight was
    played that week; full monthly reset. The BC shop sells the Honor shop list at the Honor price,
    paid in BC.

## Patterns to mirror

| Need | Mirror (file:line) |
|---|---|
| Register a skill script | `game-core/src/battle/skills.ts:47-59` (`SKILL_SCRIPTS` spread per script file) |
| Script with buffs, MP cost, level numbers | `game-core/src/battle/scripts/ninjutsu-attack.ts:1-40`, `ninjutsu-buffs.ts` |
| Ultimate threshold and chance | `game-core/src/battle/scripts/execute.ts:71-93` (`executeOdds`, `executeChance`) |
| Hit, crit, parry, defense roll sites (talent hook) | `game-core/src/battle/fight.ts:269,273,281-285`; `scripts/parry.ts:15` |
| Fighter input to runtime fighter | `game-core/src/battle/fight.ts:67-119` (`toFighter`), `types.ts:33-76` |
| Bonus terms into stats | `game-core/src/stats.ts:32-77` (`Bonuses`), `:120-174` (`deriveStats`) |
| Pure rules plus tests in game-core | `game-core/src/arena/rules.ts`, `gates/pub-fight.ts` (+ `.test.ts`) |
| Player fighter from DB | `server/src/game/combat.ts:96-176` (`playerFighter`, `passiveBonuses`, `playerFighterFrom`) |
| Summing effect bonuses | `server/src/game/nonfight-buffs.ts:39-63` (`buffBonuses`, `sumBonuses`) |
| Arena snapshot refresh and staleness key | `server/src/modules/arena/snapshot.ts:23-49,59` |
| Item use dispatch | `server/src/modules/game/actions.ts:270-319` |
| Item-specific action route (treasure) | `server/src/modules/game/treasure.ts:30-60` |
| Lazy daily and weekly reset | `server/src/modules/daily/routes.ts:40-75` |
| Skill bar rule and fight skill loading | `server/src/game/skill-bar.ts:56-96`, `:98-125` |
| Learned skills tables and migrations | `server/drizzle/0019_skill_learning.sql`, `0020_skill_bars.sql`, `server/src/db/schema.ts:1204-1256` |
| Data files and lookups | `server/src/game/data.ts:24-33` (`load`), `tools/game-data/import.ts:188-234` (`write`) |
| Pub-fight pull and drops | `server/src/modules/gates/pub-fights.ts:90-100,154`, `game-core/src/gates/pub-fight.ts` |
| Quest steps and command ids | `server/src/game/quests.ts:7-60,140-170` |
| Non-fight buff rows | `server/src/game/nonfight-buff-data.json`, `nonfight-buffs.ts:100` (`useBuffItem`) |
| Sequential team fights | `server/src/modules/teams/runs.ts:201` (`teamGateFight`) |
| Score delta, weekly ranking, system mail | `game-core/src/arena/rules.ts:29-40`, `server/src/modules/rankings/toll-gate-weekly.ts`, `server/src/game/system-mail.ts` |
| Periodic jobs | `server/src/jobs.ts` |
| Route registration | `server/src/app.ts:64-83` |
| Feature window and HUD entry | `client/src/game/windows.tsx:56-72`, `client/src/game/Hud.tsx:337-346` |
| Extra name table | `client/src/game/text.tsx:5-9` (`skills-and-titles.json` merged into `table`) |
| Phaser preload and timeline strike | `client/src/game/phaser/battle-scene.ts:90-106`, `timeline.ts:221-262`, `motion.ts:88-100`, `game.ts:32` |
| Asset WebP export | `tools/export-assets.ts:75-90` (sharp `.webp`), `tools/assets/*.ts` + tests |
| Reborn fetch | `tools/fetch-reborn-assets.ts:127-160` (`fetchAtlas`, avatar loop) |

## Folder ownership

| Area | Folders | Task |
|---|---|---|
| Reborn data import | `tools/game-data/import-reborn.ts`, `server/data/game/reborn/`, `server/src/game/data.ts`, `client/src/i18n/reborn.json` | 1 |
| Schema and migrations | `server/src/db/`, `server/drizzle/` | 2 |
| Reborn asset import | `tools/fetch-reborn-assets.ts`, `tools/assets/reborn*.ts`, `client/public/assets/reborn/`, `client/src/generated/reborn-*.json` | 3 |
| Fight engine (talents, stats, threshold) | `game-core/src/battle/fight.ts`, `types.ts`, `scripts/parry.ts`, `scripts/execute.ts`, `game-core/src/reborn/` | 4 |
| Scroll skill scripts | `game-core/src/battle/scripts/scroll-*.ts` (+ one line in `skills.ts`) | 5 |
| Talents | `server/src/modules/talents/`, `shared/src/schemas/talents.ts`, `client/src/game/talents/` | 6 |
| Bloodlines (limits, souls, prayer) | `server/src/modules/bloodlines/`, `shared/src/schemas/bloodlines.ts`, `client/src/game/bloodlines/` | 7, 10 |
| Scroll skills feature | `server/src/game/skill-bar.ts`, `server/src/modules/game/skills.ts`, `client/src/game/SkillsWindow.tsx`, `shared/src/schemas/skills.ts` | 8 |
| Secret technique playback | `client/src/game/phaser/` | 9 |
| Quests | `tools/quests/`, `server/data/game/reborn/tasks*.json`, `server/src/game/quests.ts`, `client/src/game/QuestLog.tsx` | 11 |
| Daily events | `server/src/modules/events/`, `shared/src/schemas/events.ts`, `client/src/game/events/` | 12 |
| Tailed Beast | `server/src/modules/tailed-beast/`, `game-core/src/events/tailed-beast.ts`, `client/src/game/tailed-beast/` | 13 |
| Team Stone | `server/src/modules/team-stone/`, `game-core/src/events/team-stone.ts`, `client/src/game/team-stone/` | 14 |
| Translation review | `tools/i18n/`, `client/src/i18n/` | 15 |
| Verification | `e2e/`, `docs/` | 16 |

**Coordinator wiring** (one line each, merged by the coordinator; feature tasks export the function
and ask for the wiring): route registration in `server/src/app.ts`; windows in
`client/src/game/windows.tsx` and HUD entries in `Hud.tsx`; `shared/src/index.ts` re-exports;
`characterEffects(tx, id)` in `server/src/game/combat.ts` (buffs + bloodlines) and the `talents`
field on the player fighter, used by `playerFighter` and by `arenaFighter` in `snapshot.ts`, with
talent and bloodline state in the snapshot `source` key; the pub-fight drop hook in
`modules/gates/pub-fights.ts`; weekly-activity hooks (`recordWeeklyActivity`) in arena, pub fights,
Las Noches, toll gate clear, chat and daily quests; new timers in `server/src/jobs.ts`.

## Files to change

**New:** `tools/game-data/import-reborn.ts` (+ test);
`server/data/game/reborn/{talents,bloodlines,souls,scroll-skills,skills,fight-buffs,items,events,tasks,sub-tasks}.json`;
`game-core/src/reborn/{talents,bloodlines,souls}.ts` (+ tests);
`game-core/src/battle/scripts/scroll-skills.ts`, `scroll-buffs.ts` (+ tests);
`game-core/src/events/{dice,tailed-beast,team-stone}.ts` (+ tests);
`server/src/modules/{talents,bloodlines,events,tailed-beast,team-stone}/` (routes, rules,
`*.api.test.ts`); `shared/src/schemas/{talents,bloodlines,events,tailed-beast,team-stone}.ts`;
`client/src/game/{talents,bloodlines,events,tailed-beast,team-stone}/`;
`client/src/game/phaser/secret-technique.ts` (+ test); `tools/assets/reborn.ts` (+ test);
`client/src/generated/reborn-assets.json`, `reborn-secret-techniques.json`;
`client/src/i18n/reborn.json`; `server/drizzle/0021-0026` and meta snapshots.

**Changed:** `game-core/src/battle/{fight.ts,types.ts,skills.ts,scripts/parry.ts,scripts/execute.ts}`,
`game-core/src/index.ts`;
`server/src/game/{combat.ts,data.ts,skill-bar.ts,quests.ts,nonfight-buff-data.json,treasure-data.json}`;
`server/src/modules/game/{actions.ts,skills.ts}`, `modules/gates/pub-fights.ts`,
`modules/arena/snapshot.ts`; `server/src/{app.ts,jobs.ts}`, `server/src/db/schema.ts`;
`client/src/game/{windows.tsx,Hud.tsx,SkillsWindow.tsx,QuestLog.tsx,text.tsx}`;
`client/src/game/phaser/{battle-scene.ts,timeline.ts}`; `tools/fetch-reborn-assets.ts`,
`package.json` (scripts `game-data:reborn`, `assets:reborn`).

## Tasks

### Task 1: Reborn data import
- **Action**: `node tools/game-data/import-reborn.ts` reads the normalized files and serverConfig and
  writes `server/data/game/reborn/*.json`: talents (costs, `expNeeded`); 44 limits with stat ids
  mapped by decision 11; 13 soul types with `valueByLevel` and level limits clamped to 90; scroll
  skill rows in skill.ini shape for 1831, 1833-1836, 18041-18046, 18091 (probability, skilladdtype,
  decmp per decision 17); item rows 540001-540012 and 540101-540112 in item.ini shape (`CanUse 1`,
  our `reborn_*` name keys, Reborn icon path); dice buffs 80101-80202 in non-fight buff shape; event
  constants (daily login, weekly, leagues, Tailed Beast shop). `data.ts` merges the overlay into
  `skill()`, `item()`, `task()`, `subTasks()` and validates each file with zod. Names (talents,
  limits, souls, skills, scroll items, Ninja House NPCs 81001-81044) go to
  `client/src/i18n/reborn.json` and the glossary.
- **Mirror**: `tools/game-data/import.ts:188-234`, `server/src/game/data.ts:24-33`.
- **TDD**: counts (8 talents, 44 limits, 13 souls, 12 scroll skills, 24 scroll items, 80 cost rows);
  the stat-id map covers all 24 bonus ids, with 18 and 31-40 checked against `skill-adds.json`; no
  overlay id collides with an original id (skills, buffs, items, tasks).
- **Validate**: `pnpm --filter @pockie/tools test -- import-reborn && pnpm --filter @pockie/server test -- data`

### Task 2: Schema and migrations (all M5 tables; see Migrations)
- **Action**: Drizzle tables and checks for 0021-0026. No feature logic.
- **Mirror**: `schema.ts:1204-1256`, `server/drizzle/0019/0020`, `server/src/db/m4-tables.test.ts`.
- **TDD**: `server/src/db/m5-tables.test.ts`: talent level 0-60, at most 3 active talents and limits
  (partial unique index on slot), soul level 1-10, at most 250 souls, nullable `expires_at`,
  non-negative currency.
- **Validate**: `pnpm db:reset && pnpm --filter @pockie/server test -- migrations m5-tables`

### Task 3: Reborn asset import (WebP, LFS)
- **Action**:
  1. Extend `fetch-reborn-assets.ts` with the small missing groups: `icons/items/<path>.png` for the
     24 scroll items and 18 limit items; `dailylogin/reward.png`, `dailylogin/20min.png`.
  2. Add `tools/assets/reborn.ts` (`pnpm assets:reborn`): read the manifest, convert with sharp to
     WebP (lossy q80, alpha q90; icons lossless if smaller), rewrite multiatlas JSON `image` names to
     `.webp`, write `client/public/assets/reborn/<group>/...`, and generate
     `client/src/generated/reborn-assets.json` and `reborn-secret-techniques.json` keyed by skill id:
     `{ clothing, atlas, pages, damageFrame, motionFrame, offset, transforms, concurrent?,
     concurrentOffset?, concurrentOrigin?, targetAnimation?, holdDeathUntilReaction? }`.
  3. **Gate**: convert outfit 1 first and report the ratio. Stop and ask if the projected total goes
     over 150 MB.

  | Group | Source (PNG) | Estimated WebP |
  |---|---|---|
  | Secret techniques of the 49 outfits that fight today (10 creation + 52 `people` NPC outfits; 49 have art) | 358 MB | 90-110 MB |
  | Scroll-skill effects `entities/skills/core/{1831,...,18091}` | 10.9 MB | ~3 MB |
  | Skill icons (12 scroll skills + 10000) | 0.1 MB | <0.1 MB |
  | Talent UI | 0.3 MB | 0.1 MB |
  | Bloodline bg, limits, souls, menu | 1.9 MB | 0.6 MB |
  | Ninja House NPC icons 81001-81044 | 1.9 MB | 0.6 MB |
  | Tailed Beast art (`events/tailedBeast`, `ui/buttons/topui/tb.png`) | 6.7 MB | ~2 MB |
  | Scroll/limit item icons, daily login icons | <0.5 MB | <0.2 MB |
  | **Total** | ~380 MB | **~100-120 MB in LFS** |

  Deferred to M6: the other 51 outfits up to 120 (637 MB PNG, ~160-190 MB WebP) and the 34
  Reborn-only outfits.
- **Mirror**: `tools/export-assets.ts:75-90`, `tools/assets/sheet.ts` (+ `sheet.test.ts`),
  `tools/assets/manifest.test.ts`.
- **TDD**: atlas rewrite (frame rects unchanged, page names .webp); manifest maps every 19xx/22xx and
  19xx0 skill of the 49 outfits; reproducible (second run writes 0 files).
- **Validate**: `pnpm --filter @pockie/tools test -- reborn && pnpm assets:reborn && du -sh client/public/assets/reborn && git lfs ls-files | wc -l`

### Task 4: Fight engine: talents, Reborn stat bonuses, threshold
- **Action**: `game-core/src/reborn/talents.ts` (`narrowGap(enemy, mine, level)`, `talentCap(level)`,
  `upgradeCost(n)`, `rollUpgrade(random)` per decision 7, `canActivate`);
  `FighterInput.talents?: Partial<Record<1|...|8, number>>` (active only, levels capped); apply
  `narrowGap` at the 4 roll sites (decision 8); `game-core/src/reborn/bloodlines.ts`
  `limitBonuses(activeLimits, souls, prayer): Partial<Bonuses>` (decision 11); `execute.ts`
  `hpCondition` base reads `self.secretThreshold ?? 15`.
- **Mirror**: `fight.ts:269-285`, `parry.ts:15`, `stats.ts:32-77`, `execute.ts:71-93`.
- **TDD**: each talent changes only its roll and only when the enemy leads; at L = 100 parity, never
  past; a seeded replay without talents is byte-identical to today's; `limitBonuses` for limits 1 +
  41 with 2 souls and prayer 3 gives the expected terms; threshold 20 executes at 18% HP, 15 does
  not.
- **Validate**: `pnpm --filter @pockie/game-core test`

### Task 5: Scroll skill scripts
- **Action**: 12 scripts in `scroll-skills.ts`, buffs 15001+ in `scroll-buffs.ts`, per decision 17:

  | Skill | Effect |
  |---|---|
  | 1831 Izanagi | 50% damage reduction |
  | 1833 Rinne | cleanse or 10% heal |
  | 1834 Izanami | delayed 70% restore plus revive |
  | 1835 Kirin | dizzy 6 s, +50% lightning |
  | 1836 Sprenger | damage and heal down, no revive, 2 stacks |
  | 18041 | 25%: ignore 25% defense, ignore blessings |
  | 18042 | speed -60%, +15% earth, 10% lifesteal |
  | 18043 | 3 gates x multiplier |
  | 18044 | +7% enemy max HP, dizzy 12 s, no rebound |
  | 18045 | defense break +15% of dodge |
  | 18046 | per-debuff damage, cleanse, at most 3 per fight |
  | 18091 | stacking fire vulnerability, undispellable burn |

  Register in `SKILL_SCRIPTS`; extend the `slice-skills.test.ts` guard so every overlay skill row has
  a script.
- **Mirror**: `ninjutsu-attack.ts`, `ninjutsu-buffs.ts`, `ninjutsu-trigger-a.ts` (+ tests).
- **TDD**: one seeded test per skill: trigger moment, Lv 1 damage formula, buff add/expire, MP-fail
  fallback, limitation (dizzy/charm block, 3 uses).
- **Validate**: `pnpm --filter @pockie/game-core test -- scroll slice-skills`

### Task 6: Talents feature
- **Action**: routes `GET /api/game/talents`, `POST /talents/:id/upgrade {useGold}`,
  `POST /talents/:id/active {active}` with lazy daily reset, cost by attempt index, cap check, EXP and
  level-ups, 3-active rule; `talentFighterInput(tx, id)` for the coordinator; arena snapshot refresh
  on change. Client: Talents window (8 cards, EXP bar, Normal/Gold upgrade, activate toggle,
  attempts left, "Talents unlock at level 51"), opened from the Character window.
- **Mirror**: `modules/daily/routes.ts:40-75`, `modules/game/treasure.ts:30-60`,
  `client/src/game/SkillsWindow.tsx`.
- **TDD (API)**: below 51 refused; cost of 1st/10th/17th attempt; 41st refused; stones or gold
  short; level cap; 4th active refused; concurrent upgrades never overspend; UTC day reset.
- **Validate**: `pnpm --filter @pockie/server test -- talents && pnpm --filter @pockie/client test -- talents`
- **Depends on**: 1, 2, 4.

### Task 7: Bloodline limits plus the pub-fight item source
- **Action**: routes for the Ninja House list (44 limits, amity, target, required level, owned, items
  held), `POST /bloodlines/:id/turn-in` (4 items, +30 amity, decision 12 daily count, unlock at
  target), `POST /bloodlines/:id/active {active}` (3 slots); `bloodlineBonuses(tx, id)` on top of
  `limitBonuses`; the pub-fight drop rule (decision 14) as `limitItemDrops(sceneLevel, random)` for
  the hook. Client: Ninja House window (NPC grid with Reborn icons) and Bloodline panel (3 slots,
  limit stats, bonus list).
- **Mirror**: `server/src/game/progress.ts:92` (`removeItems`), `modules/gates/pub-fights.ts:90-100`,
  `game-core/src/gates/pub-fight.ts`.
- **TDD**: turn-in with fewer than 4 items, at target, below level, over the daily count; unlock on
  the exact turn-in; 4th active refused; fighter stats rise by the expected terms; seeded pub-fight
  drop band; race of two turn-ins.
- **Validate**: `pnpm --filter @pockie/server test -- bloodlines pub-fights`
- **Depends on**: 1, 2, 4.

### Task 8: Scroll skills feature
- **Action**: item use of 540xxx inserts or extends the `character_skills` row with `expires_at`
  (decision 18); `setSkillSlot` accepts scroll skills (max 2 per tree, `not_slottable` otherwise);
  `characterSkillInputs` filters expired rows; decision 19 sources (treasure pool row, pub-fight combo
  drop entry); Skills window "Scroll Skills" tab with Permanent or time left.
- **Mirror**: `actions.ts:270-319`, `skill-bar.ts:56-125`, `server/src/game/treasure-data.json`.
- **TDD**: 7-day then 7-day extends; 7-day after permanent refused; 3rd scroll skill in a tree
  refused; expired skill absent from fighter and snapshot; item consumed once under concurrency.
- **Validate**: `pnpm --filter @pockie/server test -- skill-bar skills treasure`
- **Depends on**: 1, 2, 5.

### Task 9: Secret technique playback
- **Action**: `phaser/secret-technique.ts` resolves the effect for (clothing, skillId) from
  `reborn-secret-techniques.json`; `battle-scene.ts` preloads its multiatlas pages
  (`this.load.multiatlas`) only for ultimates in the replay; `timeline.ts` turns an ultimate strike
  into an overlay pose (frames sorted numerically, offset, per-frame caster transforms, concurrent
  layer with origin `source` or stage side, impact at `damageFrame`; target holds death until the
  reaction when the manifest says so). Read the playback rules in `main.js` near "Incomplete
  secret-technique atlas". Reborn's stage is also 1000 wide (`isOnOffense ? 1e3 : 0`), so no scaling.
  Fallback: today's motion when there is no art.
- **Mirror**: `battle-scene.ts:90-106`, `timeline.ts:221-262`, `motion.ts:88-100`,
  `phaser/weapon.ts` (+ `weapon.test.ts`).
- **TDD (pure)**: impact time = `damageFrame / fps`; a defender mirrors the offset; a missing atlas
  falls back; 19010 resolves to the `ru-19010` variant.
- **Validate**: `pnpm --filter @pockie/client test -- secret-technique timeline` plus a manual
  Playwright screenshot of an arena replay.
- **Depends on**: 3.

### Task 10: Bloodline souls and prayer
- **Action**: discover (decision 15, VIP 30), soul inventory (250), bind/unbind (one per type, 5
  sockets, level gate), destroy, synthesis (3 to 1, batch), refine, prayer (decision 16, bulk, reset
  on attribute switch). Souls and prayer feed `bloodlineBonuses`. Bloodline panel gets Souls and
  Prayer tabs.
- **Mirror**: task 7 module; pure rules in `game-core/src/reborn/souls.ts`.
- **TDD**: discover cap per UTC day and VIP; synthesis needs the same level and gives level + 1;
  refine changes type and consumes fuel; socketed duplicate type refused; prayer level-up math incl.
  multi-level; reset wipes progress; full inventory refuses discover.
- **Validate**: `pnpm --filter @pockie/game-core test -- souls && pnpm --filter @pockie/server test -- bloodlines`
- **Depends on**: 7.

### Task 11: Tutorial subset and story chain
- **Action**: author the 9 tutorial and 118 story quests (decisions 20-22) as Task.ini/SubTask.ini
  rows in `server/data/game/reborn/`. A generator `tools/quests/reborn-story.ts` assigns NPCs and
  monsters by level band from `scene-npcs.json`, keeping `requires/unlocks` order from 30001. New
  COMMAND ids record arena fight, Las Noches floor, enhance and bloodline unlock (exported for the
  coordinator hooks). Text keys go into `client/src/i18n/reborn.json` (our text). Quest log gets a
  "Reborn Story" group.
- **Mirror**: `server/src/game/quests.ts:140-170` (`recordCommand`), `tasks.json` row shape,
  `client/src/game/QuestLog.tsx`.
- **TDD**: every quest's NPCs, scenes, monsters and items exist; the chain is acyclic and reachable
  by level 70; rewards at most 50% of the main line at that level; 30022 matches the calibration;
  command steps complete.
- **Validate**: `pnpm --filter @pockie/server test -- quests reborn-quests`
- **Depends on**: 1.

### Task 12: Daily events
- **Action**: Daily Login (7-day cycle + bonus); Weekly Rewards (activity counters, decision 24
  points, milestones 50/100/200, weekday reward from 50 points, bonus after 7; exports
  `recordWeeklyActivity(tx, id, activity)`); Dice of Fate (decision 25, non-fight buff path);
  Twenty-Minute Reward (decision 26). Client: Ninja Diary window (Login and Weekly tabs), Dice of
  Fate window, HUD timer button for the twenty-minute reward.
- **Mirror**: `modules/daily/routes.ts:40-75`, `nonfight-buffs.ts:100`, `requireBagRoom` in
  `server/src/game/bag.ts:59`.
- **TDD**: double claim refused; full bag refuses and keeps the claim; cycle wrap; Monday 00:00 UTC
  week boundary; weekday reward only on its day; seeded dice tier boundaries; replenish only at 0;
  curse clear cost; cooldown and daily cap; concurrent claims.
- **Validate**: `pnpm --filter @pockie/server test -- events && pnpm --filter @pockie/game-core test -- dice`
- **Depends on**: 1, 2.

### Task 13: Tailed Beast event
- **Action**: weekly state, beast rotation, tickets, fights against the shared HP pool (one locked
  update per fight), Honor and Essence, village Honor, fight boxes, Kage pick per village per week,
  Essence shop, top-10 leaderboard (decision 27), weekly reset job.
- **Mirror**: `modules/gates/las-noches.ts`, `rankings/toll-gate-weekly.ts`, `server/src/jobs.ts`.
- **TDD**: rotation per weekday; ticket cost per mode; two fights racing on the last HP leave exactly
  one kill; box thresholds; one Kage claim; week rollover.
- **Validate**: `pnpm --filter @pockie/server test -- tailed-beast`
- **Depends on**: 2, 3, 8 (the shop sells scrolls).

### Task 14: Team Stone
- **Action**: queue table, matchmaking job with snapshot bot fill after 15-30 s, 3v3 fight through
  the team-run duel code, score rule (decision 28) in game-core, attempts, leagues, weekly BC mail and
  monthly reset, BC shop, client queue/league/leaderboard window.
- **Mirror**: `modules/teams/runs.ts:201`, `modules/arena/snapshot.ts`,
  `game-core/src/arena/rules.ts:29-40`, `server/src/game/system-mail.ts`.
- **TDD**: score delta at 0.8/1.0/1.2 power ratios; queue below 50 refused; attempt spent only when
  the fight starts; bot fill never uses a queued player twice; weekly pay once and only with 1+
  fights; monthly reset.
- **Validate**: `pnpm --filter @pockie/server test -- team-stone && pnpm --filter @pockie/game-core test -- team-stone`
- **Depends on**: 2.

### Task 15: Translation review
- **Action**: review every string in the M5 windows, the scroll-skill tooltips (ours) and the 127
  quest texts; apply the glossary (Reborn names). Light work: Sonnet.
- **Depends on**: 6-14.

### Task 16: Verification
- **Action**: Playwright journeys (level-51 seed: upgrade and activate a talent; turn in limit items
  and activate a bloodline; use and slot a 7-day scroll; win an arena fight showing a secret
  technique; claim daily login and dice). `docs/security-review-m5.md` for every M5 route (locks,
  dupes, daily-cap races, gold paths, shared boss HP).
- **Validate**: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`, coverage 80%+ on new modules.
- **Depends on**: all.

## Parallel waves (max 3 agents, disjoint folders)

| Wave | Agents | Notes |
|---|---|---|
| 1 | T1 data import, T2 schema, T3 assets | T2 merges first; T3 stops at the size gate for the user's OK |
| 2 | T4 engine, T5 scroll scripts, T9 playback | T4 owns `fight.ts`/`types.ts`; T5 adds one line to `skills.ts` (coordinator merges); T9 only `client/src/game/phaser/` |
| 3 | T6 talents, T7 limits, T8 scroll skills | Coordinator wires `combat.ts` + `snapshot.ts` (one `characterEffects`), `app.ts`, windows, pub-fight hook after each merge |
| 4 | T10 souls, T11 quests, T12 daily events | T10 after T7 merges (same module) |
| 5 | T13 Tailed Beast, T14 Team Stone, T15 translation | T15 once 6-12 are merged |
| 6 | T16 verification | after everything is merged |

## Migrations (task 2, in order)

| # | Name | Content |
|---|---|---|
| 0021 | `talents` | `character_talents` (character, talent 1-8, level, exp, active); `characters.talent_day`, `talent_attempts_used` |
| 0022 | `bloodlines` | `character_bloodlines` (character, limit 1-44, amity, unlocked_at, active_slot 0-2 null, unique (character, active_slot)); `characters.bloodline_day`, `bloodline_turn_ins` |
| 0023 | `souls_scrolls` | `character_souls` (uuid, character, type 1-13, level 1-10, limit null, socket 0-4 null); `character_bloodline_prayer` (character, limit, attribute, level 0-9, progress); `characters.soul_day`, `souls_discovered`; `character_skills.expires_at` |
| 0024 | `daily_events` | `character_daily_login` (completed_days, claim_day, bonus_day); `character_weekly_rewards` (week, counters jsonb, claimed milestones, claimed weekdays); `characters.dice_day`, `dice_used`, `dice_bought`, `twenty_min_at`, `twenty_min_day`, `twenty_min_count` |
| 0025 | `tailed_beast` | `tailed_beast_pools` (week, beast, mode, hp_left); `tailed_beast_players` (week, character, village, honor, essence, fights, ticket_day, tickets_used, boxes_claimed); `tailed_beast_kages` (week, village, character, claimed) |
| 0026 | `team_stone` | `team_stone_players` (character, score, attempts_day, attempts_used, week, played_this_week, month); `team_stone_queue`; `team_stone_matches`; `characters.battle_coins` |

## Risks

| Risk | Mitigation |
|---|---|
| Git LFS size and bandwidth (secret techniques are most of it) | Size gate in task 3 (150 MB); only the 49 fighting outfits now; lossy WebP; per-replay lazy load |
| Wrong stat scale makes bloodlines or talents trivial or useless | Decision 11 map checked in task 1; task 4 test pins a level-60 fighter's totals; constants in one file per feature |
| Power creep trivializes 2011 content past 50 | Talents only narrow gaps (never past parity); story rewards at 50%; measure arena win rates after M5 |
| Reborn ids collide with 2011 ids (quests, buffs, skills) | 8xxxxx quest ids, 15xxx buffs; task 1 collision test |
| Scroll skills built from tooltips feel off | Seeded per-skill tests; numbers in the script header for tuning |
| Shared boss HP and Team Stone queue races | One locked update per fight; idempotent jobs keyed by week/month (M4 pattern) |
| Reborn sentences copied by accident | Task 15 review; only names come from Reborn |
| Arena snapshots stale after talent or bloodline changes | `source` key includes both; refresh in the same transaction |

## Acceptance

- [ ] A level-51+ ninja can upgrade (stones or gold, correct cost per attempt, 40 a day) and activate
      up to 3 talents; talents change seeded fights only when the enemy leads.
- [ ] Pub-fight wins drop limit items by band; turn-ins unlock limits; 3 active limits add the mapped
      stats in the Character window, live fights and arena snapshots.
- [ ] 7-day and permanent scrolls teach the 12 skills; max 2 per tree; expiry removes them from
      fights.
- [ ] Ultimates of the 49 fighting outfits play Reborn's effect art; 19xx0 plays its `ru-` variant;
      clean fallback without art.
- [ ] Souls: discover, synthesis, refine, sockets and prayer work within their caps.
- [ ] The 9 tutorial and 118 story quests can be accepted and finished by level 70; every referenced
      NPC, scene and monster exists.
- [ ] Daily Login, Weekly Rewards, Dice of Fate and the twenty-minute reward reset at UTC boundaries
      and refuse double claims.
- [ ] A Tailed Beast week plays end to end; Team Stone queues, bot-fills, fights, scores and pays
      weekly.
- [ ] Every new route is in `docs/security-review-m5.md`; `pnpm typecheck && pnpm lint && pnpm test
      && pnpm e2e` is green.
- [ ] `client/public/assets/reborn/**` is at most 150 MB and fully in LFS.

## Open questions for the user

1. **Outfit stars.** Earning a star needs outfit tiers +31 and duplicate outfits (M6 outfit
   collection). The plan ships only the threshold field now and moves star-up to M6 (decision 9).
   Alternative: a temporary star-up path in M5 (e.g. paying Seal Breakers).
2. **Bloodline daily cap.** The plan reads `itemsPerDay = 10` as 10 turn-ins, not 10 items
   (decision 12).
3. **Secret-technique art.** Import the 49 fighting outfits now (~100 MB), or all 100 outfits up to
   120 (~300 MB) so M6 needs no further import.
4. **Story chain size.** All 118 story quests in M5, or acts 1-2 (~40) now and the rest in M6?
