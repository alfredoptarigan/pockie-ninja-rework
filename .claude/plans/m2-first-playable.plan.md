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
