# Plan: First Playable (Milestone 2)

**Project**: Pockie Ninja Remastered
**Status**: approved by the user on 2026-10-11 (grilling session, see `roadmap.md` for decisions)
**Complexity**: Large

## Goal

A logged-in player creates a ninja (name, gender, starting outfit, village), lands in their
village, follows the village tutorial chain, explores the first field zone, fights monsters in
server-simulated auto-battles shown as replays, completes talk/kill/collect quests, gains EXP and
levels, earns copper and items, equips the class weapon, and sees other players in the same scene
and in world/scene chat. Everything is in English.

## Ground rules

Same as milestone 1 (English only, commit and push after every change, TDD for game logic and
security-sensitive code, validation before each commit). Original data and formulas are ported
1:1 (see roadmap). Raw SWFs and raw Reborn files never enter the repo; only exported assets,
imported data and the name glossary do.

## Reference data (read-only)

G = `~/Privates/game-pockieninja`, RES = `G/app/code/props/serv/game/Resource`,
J = `G/local-run/.runtime/decompiled/service/com/d2/serv/game`,
C = `G/local-run/.runtime/swf/LittleNinjasClient/scripts`.

| Topic | Source |
|---|---|
| Character creation | `C/Login/GameLogin/CreatRoleBase.as`, `J/RoleModule/CreateRoleSystem.java`, `apache/source/binary/datatable/creatrole.*.tab` |
| Starting values | `RES/javascript/player/firstset.js` |
| Villages / scenes | `RES/scene/logicscene.ini`, `RES/scene/sceneswitchrule.ini`, `apache/source/movieclip/scene/*` |
| NPC placement | `RES/npc/RefresNpc.ini`, `RefresHeartNpc.ini`, `apache/source/binary/datatable/scenepos.*.tab` |
| Explore spots | `RES/role/RoleOutSearch.ini` |
| Monsters | `RES/npc/npc.ini` |
| Quests | `RES/task/Task.ini`, `RES/task/SubTask.ini`, `J/TaskModule/RookieTaskSystem.java` |
| Battle | `J/FightModule/FightSystem.java`, `Damage.java`, `FightConfig.java`, `SkillSystem.java`, `RES/skill/skill.ini`, `RES/javascript/skill/*.js` |
| Stats / levels | `J/RoleModule/RefreshSystem.java`, `RES/role/RoleInitProperty.ini`, `RES/role/LevelExp.ini`, `LevelPoint.ini` |
| Outfits | `RES/item/item.ini` (`i2900NN`), `RES/Equip/AvatarAddSkill.ini` |
| Language | `apache/source/binary/keyvaluetable/language.s53464.kv` (Indonesian, zlib + AMF3), `binary/lg/language.lg` (Chinese) |
| Reborn names | `data/reborn-raw/` (`pnpm reborn:fetch`) |

## Tasks

### Task 1: Game data import pipeline
- **Action**: `tools/import-game-data.ts` reads the original INI/tab/kv files (zlib + AMF3
  decoder) and writes typed JSON to `server/data/game/` (scenes, buildings, explore spots, NPCs,
  monsters, quests and sub-quests, items needed by the slice, outfits with base stats, growth and
  skills, skills, level/EXP table, creation table). Zod schemas for every file in `game-core`.
- **Validate**: import re-runs deterministically; schema tests; spot checks (n33017 level 2,
  15 HP; quest 90000 rewards; Naruto growth 140/120/120; level cap 90).

### Task 2: English translation pipeline and glossary
- **Action**: extract the Indonesian table to `tools/i18n/source.id.json` (original keys kept);
  build `tools/i18n/glossary.json` from Reborn names (scenes, NPCs, items, outfits, skills,
  monsters, quests, titles) mapped to original ids, canon names for characters; AI-assisted
  batch translation script (glossary enforced, placeholders such as `{@0:...}` preserved,
  resumable, cached) writing `client/src/i18n/en.json` plus a review status per key. Hand-review
  every string used by the M2 slice.
- **Validate**: placeholder and glossary checks pass for all keys; no Indonesian left in the
  strings the slice shows.

### Task 3: Asset export for the game
- **Action**: extend `tools/export-assets.ts`: all motions for all 92 original outfits and the
  slice's monsters as sprite strips + manifest; village and field scene backgrounds; building and
  NPC art; redrawn UI skin pieces that mirror the 2011 UI without baked-in text.
- **Validate**: export re-runs cleanly; manifest covers every outfit and monster the data
  references; spot-check renders.

### Task 4: game-core battle engine (TDD)
- **Action**: new workspace package `game-core/` with a deterministic, seeded port of
  `FightSystem`/`Damage`/`SkillSystem` (sequential 1v1 duels, `AtkTime` timeline, hit/dodge,
  defence, crit, parry, ignore-defence, rebound, life-steal, 60-action cap) and the skills used
  by the 92 outfits and slice monsters. Output: a typed replay (fighters, stats, events).
- **Validate**: unit tests per formula against values computed from the Java code; golden replays
  from fixed seeds; a sample original `.fight` file reproduces the same outcome where possible.

### Task 5: Character and progression model
- **Action**: Drizzle tables `characters` (user_id unique, name + name_lower unique, gender,
  village, outfit, level, exp, copper, hp, mp, scene, created_at), `inventory_items`,
  `character_quests`; stats derived from outfit base + growth per level (`RefreshSystem`);
  level-up with cap 90; starting values from `firstset.js`.
- **Validate**: DB constraint tests; stat/level tests against original tables.

### Task 6: Game API
- **Action**: `server/src/modules/game/*`: create character (name rules, gender, outfit from the
  creation table, village with the least-populated suggestion), get state, travel (scene switch
  rules), use building, explore spot (cooldown, loot, EXP), fight a listed monster (server
  simulation → replay, rewards, HP carry-over), quests (accept, progress talk/kill/collect/use,
  submit, rewards, village tutorial chains), inventory (use HP items, equip class weapon).
  All actions validated server-side; rate limited.
- **Validate**: endpoint tests for each action, including invalid and cheating attempts.

### Task 7: Realtime presence and chat
- **Action**: Socket.IO on the Fastify server, authenticated with the session cookie; one room
  per scene; per-scene player list (join/leave/scene change); world and scene chat with length
  limits, rate limits, and HTML-safe rendering.
- **Validate**: socket tests (auth required, room membership, chat limits).

### Task 8: Game client
- **Action**: `/play` mounts Phaser for the scene picture (clickable buildings, explore spots,
  monster list portraits) and the battle replay player (sprite strips, damage numbers, skill
  effects, skip/replay); React HUD in the 2011-style skin: character creation flow, character
  panel, quest log and tracker, dialogs, inventory, world map, player list, chat.
- **Validate**: component tests for React UI; Playwright journey create character → tutorial
  quest → first fight → level up → chat visible to a second browser.

### Task 9: Copy fixes and verification
- **Action**: fix landing copy that says level cap 100 and other names now set by the glossary;
  coverage ≥ 80%; security review of game API and sockets.
- **Validate**: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e` green.

## Risks

| Risk | Mitigation |
|---|---|
| Rhino skill scripts are numerous (474) | Port only the skills the 92 outfits and slice monsters use; data-driven where possible |
| AMF3 decoding edge cases | Small decoder with tests against known keys |
| Translation volume (about 51k keys) | Resumable cached batches; review only slice strings now |
| Battle parity with the original | Golden tests from the Java formulas and sample `.fight` files |
| Realtime load | Single process for now; rooms per scene; limits on chat |

## Progress (updated 2026-10-12)

Legend: [x] done, [~] partly done, [ ] not started. Every item is committed and pushed to `main`.

- [x] **Task 1 — data import.** `tools/game-data/import.ts` → `server/data/game/*.json` (31 files,
      original field names). Specs: `docs/original-data/{world,quests-items,characters,battle}.md`.
- [~] **Task 2 — translation** (all 51k strings translated; review and client wiring left).
  - [x] Indonesian source extracted (`tools/i18n/source.id.json`).
  - [x] Name glossary, 7,150 names (`tools/i18n/glossary.json`).
  - [x] Sentences: 51/51 batches; `tools/i18n/en.json` merged with 0 problems
        (`pnpm i18n:sentences status`, `pnpm i18n:sentences merge`).
  - [ ] Hand-review the slice strings (tutorial chains 90000-94015, first main quests, 21xx-25xx
        NPCs and monsters, common UI) and serve en.json to the client (Task 8).
- [x] **Task 3 — asset export.** `pnpm assets:export` (`tools/export-assets.ts` + `tools/assets/*`;
      full run about 35 min, cached re-run about 12 s, cache in `node_modules/.cache/pockie-assets`).
      91 MB under `client/public/assets/game`: 87/92 outfits with about 40 motions each, 6 monster
      art sets (every 2101-2501 monster), 10 scenes (layers + fight backgrounds), 45 village
      buildings, 52 placed NPCs. `tools/assets/manifest.test.ts` guards coverage.
  - Gaps: outfits 25/38/41/68/71 have no art in the backup; 43/59 only have motion 52; weapons
    (separate `motion/weapon` layer) not exported; motions 60/800 (+18 upgrades) skipped
    (`HIGH_TIER_MOTIONS`); animated sky/effect layers are first frame only; N21001/N21002 stand
    animations have a baked-in "Genin" label.
- [x] **Task 3b — original UI skin.** `pnpm assets:export ui` (`tools/assets/ui.ts`) decodes the
      client's `BaseSource` bundle (`UI_LookAndFeel`, `UI_RoleIcon`, `UI_BottomMenu`, `UI_TopGuide`)
      into 37 text-free pieces (148 KB) under `client/public/assets/game/ui/` with 9-slice insets in
      `client/src/generated/game-ui.json`; the HUD (`skin.tsx`, `index.css`) uses them. Gaps: item
      icons not exported; small-button skin approximated; full-screen HUD layout is Task 8c.
      Layout references (Reborn screenshots, gitignored): `data/reborn-raw/screenshots/`.
- [x] **Task 3c — item icons, weapon layers, world map.** `pnpm assets:export extra`
      (`tools/assets/extra.ts`, spec in `tools/assets/EXTRA.md`): 206 item icons (`gameItems`), one
      weapon-layer runtime file per outfit under `client/public/assets/game/weapons/<outfit>/` (21k
      sheets, about 77 MB; index `gameWeapons`), text-free 768x426 world map with original button
      bounds (`gameWorldMap`), all from `client/src/generated/game-extra.ts`. Not used by the client yet.
- [~] **Task 4 — battle engine** (`game-core/src/battle`).
  - [x] Timeline, sequential duels, 60-action cap, priority strike, hit/crit/parry/defence,
        counters, parry skill 7777, typed replay, golden test from an original replay.
  - [x] Skill/trigger/buff engine following the Java flow (`battle/skills.ts`, `buffs.ts`,
        `scripts/*`): 7777/8888 parry, the 10 starting outfits' execute ultimates (aoyi), monster
        skills 40023/40027/40031/40033/40036, buffs 8888/11811/11824/11841/11843/11851, MP costs.
        Replay events gained optional `selfDamage`, `decMp`, `attackCount`, `addBuffs`, `delBuffs`;
        event 9 (buff tick/expiry) is now emitted; fighters carry `maxMp`/`startMp`/`mp`.
  - [x] Server wiring (`server/src/game/combat.ts`): `POST /fight` and explore fight cards use
        outfit skills (`avatar-skills.json`) and monster skills (`npc-records`), MP is saved after
        fights. Starting-outfit skills cost no MP, so MP does not drop in M2 fights yet.
  - [ ] Other 48 aoyi scripts (avatar level 9+), recast skills, rebound/absorb/vampire/shields,
        stun/seal, regeneration auras; import `FightBuff.ini` to `fight-buffs.json` (6 buffs are
        hard-coded in `buffs.ts` for now).
- [~] **Task 5 — character model.**
  - [x] Tables `characters`, `inventory_items`, `character_quests`; stats (`game-core/src/stats.ts`),
        EXP/level-up and drops (`game-core/src/progression.ts`).
  - [ ] Equipment bonuses beyond attack/defence, HP/MP pouch auto-heal, revive rules
        (a lost fight currently leaves 1 HP).
- [~] **Task 6 — game API** (`server/src/modules/game/*`, all under `/api/game`).
  - [x] `GET creation`, `POST characters`, `GET character`, `GET scene`, `POST fight`,
        `GET quests`, `POST quests/:taskId/accept`, `POST npcs/:npcId/talk`, `GET inventory`,
        `POST items/:id/use`, `POST items/:id/equip`, `POST travel`. The Fire Village tutorial
        (90000 → 90002) plays end to end in `actions.api.test.ts`.
  - [x] Explore spots: `GET /explore`, `POST /explore/:spotId` (300 s cooldown, `7 + level/10` per
        UTC day, key items, stars with bonus, five cards, row lock), migration
        `0002_explore_spots.sql`. Not done: paid card peeks, "senior" search, bag-space checks;
        monster factories 18/20/22/24/26/28 are missing from the data (fight cards become nothing).
        `docs/original-data/world.md` says item cards are 50%; the Java gives 50% to pet eggs.
  - [x] All five village tutorials (90000-94015) play to the end in `tutorials.api.test.ts`;
        fights now complete quests, collect quests remove their items.
  - [x] Rate limits on every game route (`rate-limits.ts`, guarded by a test).
  - [x] Available quests (`GET /quests/available`) and character stats in `GET /character`.
- [x] **Task 7 — realtime presence and chat.** `server/src/modules/realtime/realtime.ts`
      (Socket.IO on `app.server`, `pn_session` cookie + origin check, rooms `scene:<id>`, travel
      moves sockets after commit, logout disconnects the session), events and zod schemas in
      `shared/src/schemas/realtime.ts`, client helper `client/src/lib/socket.ts`. Chat: 200 chars,
      control characters stripped, 5 messages per 5 s per character (in memory, single process).
- [~] **Task 8 — game client.**
  - [x] 8a: `/play` + `/play/create`, React HUD (character panel, quest log/tracker, bag, NPC
        dialogs, fight summary, travel list, player list, world/scene chat), static text slice
        (`pnpm --filter @pockie/client game-text` -> `client/src/i18n/en.json`), 747 slice strings
        hand-reviewed in `tools/i18n/en.json` (re-running `i18n:sentences merge` would revert them).
  - [x] 8b: Phaser (`client/src/game/phaser/`, lazy chunk): scene picture with building signs,
        hover/click hotspots, field NPCs, monster portrait row; full-screen battle replay (VS HUD,
        motions, damage/crit/parry/dodge, skills, buffs, Skip/Replay/x2) then the result window.
  - [x] 8c: full-screen layout like the original (scene fills the stage, HUD overlays: portrait
        and bars top left, currencies top strip, monster row top centre, scene name + Village/World
        Map top right, chat bottom left, EXP bar bottom centre, menu icons bottom right, Quest
        Navigation window). References: `data/reborn-raw/screenshots/` (gitignored).
  - [x] Item icons (`ItemIcon.tsx`: bag, fight drops, quest rewards, hand-ins), World Map painting
        with clickable places (`WorldMap.tsx`, `world-map.ts`), equipped weapon over the player in
        battle (`phaser/weapon.ts`), Drops menu on monster portraits (`MonsterDrops.tsx`, drops in
        `GET /scene`), quest rewards in `GET /quests` and the talk response.
  - [x] Explore UI (`ExploreWindow.tsx`, `explore.ts`): Explore button by the scene plaque and the
        field's explore tree, spot list with key cost, stars, quota and cooldown, confirm, fight
        replay, result cards. Server gaps: no Stone cost, `ClipName` or cooldown length in
        `GET /explore`; explore monster variants mapped to base monsters client-side.
  - [x] Chat messages for `too_many_connections`, ended sessions and refused connections.
  - [x] "0 damage" was fighting without the newbie fists (i270100); the original gives 0 too.
        Defeat/revive now follow the original: a loss leaves 0 HP and state dead (no fight, travel
        or explore), `POST /api/game/revive {mode: home|gold}` (relive.ini). Explore losses keep 1 HP.
  - [x] Revive window, disabled actions while defeated, combat stats + pouches in the Character
        window/HUD, Quest Navigation "Available" from `GET /quests/available`, tutorial nudges
        (Go opens the bag and marks the pack/weapon; warning before fighting unarmed).
  - [x] Server: HP/MP pouches (size `9000 + level*1000`, start at 0, refill after won fights and
        every explore fight; migration 0003), `GET /character` returns `{ character, stats }`,
        `GET /quests/available`, `fitsOutfit` on inventory, `revive` terms in `GET /scene`.
  - [x] Pouch refills (`POST /pouches/buy`), hand-in rewards from every path, quest level-ups in
        fight results. Equipment wear moves to M3 (durability column in 0004).
  - [ ] **8d: UI fidelity to the original.** 8a was marked done on behaviour alone; its windows
        use the generic BaseSource skin, not the original window layouts. Reopened 2026-10-12.
        - Creation screen mirrors `creatrolenew.swf` / `CreatRoleBase.as`: original layout and
          art (text-free export), animated preview of the chosen outfit and gender, outfit cards
          with portraits, village choice; behaviour unchanged.
        - Compare every M2 window (Character, Bag, Quest log/Navigation, NPC dialog, Revive,
          Explore, World Map, fight result) with its original SWF/AS and the Reborn screenshots;
          list each gap here and fix it.
        - Acceptance: side-by-side screenshots (original vs ours) checked per window.
- [~] **Task 9 — copy fixes and verification.**
  - [x] Landing seed copy: level cap 90 and glossary names (`server/scripts/seed-data.ts`); run
        `pnpm db:seed` to refresh an existing database.
  - [x] Reviewed translations survive `i18n:sentences merge` (`tools/i18n/overrides.json`, required).
  - [x] Security review: `docs/security-review-m2.md` (status table at the top). Fixed: game
        actions serialized on the character row, sockets end with their session, socket cap,
        login budget per account, chat bucket cleanup. Open: register email enumeration (product
        decision), per-IP socket limits at the proxy.
  - [ ] Coverage >= 80%, Playwright journey (create -> tutorial -> fight -> level up -> chat).

### Notes for Task 8 (client)

- **Assets:** import `gameMotions`, `gameScenes`, `SKILL_MOTIONS_URL` from
  `client/src/generated/game-assets.ts`. Sheets are Phaser spritesheets (`frameWidth`/`frameHeight`,
  cells left to right wrapping after `columns`); cell i lasts `durations[i]` ticks at 14 ticks/s in
  battle and 12 in scenes; `labels.Attacking` is the hit tick; sprite origin = `anchor` (Flash
  registration point, about waist height). Original fighter spots: (300,455) and (700,455) on a
  1000x600 stage. Action -> `motions[actions[actionId]]` ("999" = stand); skill -> fetch
  `skill-motions.json` (about 1 MB, runtime only) and read `[outfitId or artKey][skillId]`;
  monsters -> `monsters[npcId]` gives the `mobs` key. Scene draw order: background,
  backgroundeffect, element, characters, skybox; `hotspots` are the clickable buildings (English
  names from `NameFlag`); NPC dialog picture = `npcs.art[key].photo`.
- **Realtime:** `createGameSocket()` (same origin, cookie auth, path `/socket.io`; Vite dev needs
  `'/socket.io': { target: 'http://127.0.0.1:3000', ws: true }`). Listen to `scene:players`
  (replace the list), `chat:message` (append, plain text only), `connect_error` (`err.data.code`:
  `unauthenticated`, `no_character` -> creation, `bad_origin`). Send with
  `emitWithAck('chat:send', { channel, text })`; on `ok: false` show `error.message`; do not append
  from the ack (the sender gets the broadcast too). After travel the server moves the sockets.
- **Parallel agents:** run server tests with a private `TEST_DATABASE_URL`
  (name must contain `test`), otherwise concurrent runs reset each other's schema.

## Next steps for another assistant (can run while the translation finishes)

Read `CLAUDE.md`, `.claude/plans/roadmap.md` and this file first. Conventions: English only,
TDD for game logic, `pnpm typecheck && pnpm lint && pnpm test` before every commit, small
conventional commits pushed to `main`. Tests use the `pockie_remastered_test` database.

1. **Task 7 — realtime (Socket.IO).** Add `socket.io` to the Fastify server (same process),
   authenticate with the `pn_session` cookie (`findSession` in
   `server/src/modules/auth/sessions.ts`), one room per scene (character `sceneId`), a per-scene
   player list (join, leave, travel), world and scene chat (length limit, rate limit, plain text
   only). Shared event types in `shared/src/schemas/`. Tests with `socket.io-client`.
2. **Task 3 — asset export.** Extend `tools/export-assets.ts`: every motion of the 92 base outfits
   (`server/data/game/avatar-clothing.json`) and the slice monsters (`npcs.json` `ResourceID`)
   as sprite strips + manifest; village backgrounds 111/121/131/141/151 and first fields
   2101/2201/2301/2401/2501 (`apache/source/movieclip/scene/*`); building clips
   (`scene-buildings.json`); NPC art. Raw SWFs stay in the backup.
3. **Task 6 — explore spots** as described above (spec in `docs/original-data/world.md`).
4. **Task 4 — scripted skills** for the starting outfits (`creation-outfits.json` →
   `avatar-skills.json`) and the 2101-2501 monsters (`npc-records.json` →
   `npc-record-values.json`), each ported with a test, in `game-core/src/battle`.
5. **Task 8 — client.** `/play` mounts Phaser (scene picture with clickable NPCs/buildings,
   explore spots, monster portraits; battle replay player) with a React HUD in a 2011-style skin:
   creation flow (`GET /api/game/creation`), character panel, quest log, inventory, world map,
   player list, chat. Text comes from `tools/i18n/en.json` keys (`nameKey`, `descriptionKey`).
6. **Task 9.** Landing copy says level cap 100 (should be 90) and uses old names (e.g. the sprite
   manifest's "Uzumaki Naruto" → "Naruto Uzumaki"); coverage ≥ 80%; security review of the game
   API and sockets; Playwright journey (create → tutorial → fight → level up → chat).
