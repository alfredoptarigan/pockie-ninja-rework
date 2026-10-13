# Plan: Skills gaps (M3/M4 cleanup + Ninjutsu milestone)

**Project**: Pockie Ninja Remastered
**Status**: A1, A2, A3, A6, B1 done on main. A4 in progress. A5 and B7 on Codex's branch, not merged. B2-B6 open.
**Source**: skills audit of 2026-10-13 (regular, ultimate/scroll and monster skills vs the original
server in `~/Privates/game-pockieninja/app/code/props/serv/game/Resource`, decompiled Java in
`local-run/.runtime/decompiled`).

## Findings

- **Silent wrong fights.** A skill whose `javascript` is not in `SKILL_SCRIPTS` returns `SKILL_LOSE`
  (`game-core/src/battle/fight.ts`): an attack skill becomes a normal attack, a trigger never fires.
  60 skill ids used by live monsters are unported: 2601-2605 field monsters (8 NPCs), 1062/1080
  toll gate NPCs, all 170 Las Noches and 186 pub-fight NPCs, and the 10 arena rank bosses.
- **The 18xx/38xx ids are the original's 40 learnable ninjutsu** (12 active, 28 trigger). Players
  learn them at random on level-up; monsters in instances use the same scripts. No milestone owns
  them. Porting them once fixes both sides.
- **Ultimates are complete**: all 120 outfits wired, 114 scripted (+114 "new ultimate" variants);
  2215-2220 have no script in the backup and fall back to the normal attack, as in the original.
  Missing: the 230 ultimate effect SWFs (`fighteffect/bigeffect/fighteffect_19xx*`).
- **Scroll skills do not exist in the 2011 game.** "Secret Technique Scroll" i159000-i159003 is a
  treasure box (Seal Breakers i100004 or gold, pick 1 of 5 cards; `OpenBoxSystem.java`,
  `active/Treasure*.ini`). It is sold and dropped today but cannot be opened. Skill books
  i180001-i180062 teach pet skills (M6). `data/reborn-raw/` has no scroll-skill material.
- **No player skill system**: no learning, no skill bar (3 trees x 6 slots), no reset, the HUD
  "Skills" button opens nothing. Type 3 passives (29 outfit element passives 2000-2092, nation
  skill, element passives 2801-2810) and the per-element SkillAdd chance are ignored.
- **Non-fight buffs** (194 rows in `UnFightBuff.ini`: food, EXP scrolls, pills, titles) are not
  usable; item use only handles HP/MP potions and pouches.

## Part A: M3/M4 cleanup (do now)

Each task: TDD, port 1:1 from the Rhino script, remove the ids from `unportedKnown` in
`game-core/src/battle/slice-skills.test.ts`.

- [x] **A1 Guard test.** `slice-skills.test.ts` "monster skills in live content" walks every spawn
      file (scene-npcs, scene-timed-npcs, explore-gost-factory, toll-gate-groups, single-gate,
      pub-fights, arena-tiers) and pins the unported list. Fails on any new gap or any fixed one.
- [x] **A2 Field 2601-2605.** Skills 40018, 40019, 40021, 40022, 40025, 40026, 40030 and buffs
      11837, 11838 in `scripts/monster-skills.ts` (same `mpStrike` shape as M2).
- [x] **A3 Instance basics.** Skill 2 Heavy Strike (x1, level-based MP; ~1060 NPCs) and skill 3
      Heavy Attack (x3, 10% MaxMP; Las Noches floors).
- [ ] **A4 Las Noches bosses.** 5, 6, 7, 8, 5000, 60001-60005 and buffs 11882, 11883, 11886.
      60003/60004/60005 reuse the 1815/40019/1830 scripts and already fight (done with A2 and B1).
- [ ] **A5 Secret Technique Scroll.** Either build the treasure box (open with Seal Breakers or
      gold, 5-card pick, server-side roll, test-first since it moves items) or pull i159000-i159003
      from the stone shop and explore drops until it exists. Decide before starting.
- [x] **A6 Lucky Cat 9999** (arena event NPC n310019) and buff 99999.

## Part B: Ninjutsu milestone (between M4 and M5)

Goal: players learn and slot the original's 40 ninjutsu; every instance and arena monster fights
with its real kit.

- [x] **B1 Port the 40 ninjutsu scripts** (1802-1839, 3802-3827) and their ~30 missing fight buffs
      (11804-11849, 11880). Split into batches by buff dependency. Closes the remaining
      `unportedKnown` ids.
- [ ] **B2 Learning.** Level-up learns one random learnable ninjutsu; every 10th level one element
      passive 2801-2810 (`SkillSystem.java`, `UpSkilCfg.ini`, `UpSkillLimit.ini`). DB table + API.
- [ ] **B3 Skill bar.** 3 trees x 6 slots, active tree switch, per-slot level pick, reset (8 gold or
      coupons, free resets). Arena snapshot refreshes on change (M4 rule).
- [ ] **B4 Skills window** behind the HUD "Skills" button, with English names from
      `tools/i18n/en.json`.
- [ ] **B5 Passives and SkillAdd.** Feed type 3 skills into stats: 29 outfit element passives,
      nation skill (+1 level of one element passive), per-element SkillAdd chance (`value % 100`)
      in `fight.ts`. Keep the original quirk that most chances come out as 0.
- [ ] **B6 Gear skill bonuses** (+skill level, granted skills; skipped in `sets.ts` today).
- [ ] **B7 Non-fight buffs**: food, EXP scrolls, pills, titles from `UnFightBuff.ini` via item use.

## Who does what (Claude / Codex)

Split by folder so the two never edit the same file. Both follow the parallel rules: own worktree
and branch, private test DB via `TEST_DATABASE_URL` (name contains `test`), no push or merge to
`main` (Claude's main session reviews and merges one branch at a time).

**Claude: fight engine** (`game-core/src/battle/**`, `game-core/src/equipment/**`)
Order: A2, A3, A6, B1 (in batches), A4, B5, B6.
- Only Claude edits `unportedKnown` in `slice-skills.test.ts`, `skills.ts`, `fight.ts`,
  `buffs.ts` and `scripts/*`.
- Exposes for Codex: `LEARNABLE_NINJUTSU` (the 40 ids) and `ELEMENT_PASSIVES` (2801-2810) from
  `game-core`, landed first with B1's first batch.

**Codex: server, client, items** (`server/src/**`, `server/drizzle/**`, `client/src/**`, `shared/**`)
Order: A5, B7, then B2, B3, B4.
- A5 needs the user's call first: build the treasure box or pull the scroll from shop and drops.
- B2/B3 own the DB tables, API, and loading the slotted skills into `server/src/game/combat.ts`.
  Import the id lists from `game-core`; never edit `game-core/src/battle/**`.
- B4 reads names from `tools/i18n/en.json`; no emojis, English only.
- Must not touch: `game-core/src/battle/**`, `server/data/game/skills.json`.

Hand-off points: Codex starts B2 once `LEARNABLE_NINJUTSU` is on `main`. A ninjutsu in the skill
bar whose script is not ported yet still fights as a normal attack, so B2-B4 do not wait for all
of B1.

## Moved or redefined elsewhere

- **M5 "scroll and secret-technique skills"**: ultimates are done; scroll skills have no source.
  M5 needs Reborn reference captures first, or drops the item. Ultimate effect SWF export and
  playback move into M5 as a visual task.
- **M6** keeps tailed-beast skills 40117/40119/40120, pet auras 11861-11863, pet skill books,
  recast skills.
