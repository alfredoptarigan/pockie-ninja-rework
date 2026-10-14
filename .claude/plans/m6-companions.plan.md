# Plan: Companions & Collection (Milestone 6)

**Project**: Pockie Ninja Remastered
**Status**: Planned (2026-10-14). Task 1 (asset fetch) merged as `1133c13b`.
**Complexity**: Large
**Reference (primary sources)**:
- 2011 server (`~/Privates/game-pockieninja`):
  - `D` = `local-run/.runtime/decompiled/service/com/d2/serv/game`
  - `R` = `app/code/props/serv/game/Resource`
- Reborn capture (`data/reborn-raw/`, gitignored): `json_items.json`, `re/serverConfig.json`
  (`petFamilies`, `WING.Line`), `re/main.js`, `locales_en_translation.json`, art under `assets/`,
  inventory `re/m6-assets-report.md`.
- M5 conventions: `m5-reborn-update.plan.md` (decisions 1, 3, 11), `m5-reborn-reference.md`.

## Goal

A ninja adopts pets in the Pet Kennel, feeds them, teaches them Halo, Help and Pass skills, and
takes one into fights, where it attacks next to its master (PET_ATTACK) and casts its skills. Pet
Tracing pays Feathers, which buy pet food in the Kennel shop. The ninja equips a wing or an aura in
a new Wing slot, enhances it with Plume Shards and talismans, and registers wings for stones. Card
boxes fill 10 card collections that pay a prize when complete. Battles show pets, wings, auras,
buff visuals, damage numbers and status icons with Reborn art. Background music plays per scene,
with a mute and volume setting. Everything is English.

## Ground rules

Same as M5. English only, no emojis. TDD for game logic and for anything that moves currency or
items. Small conventional commits. Run `pnpm typecheck && pnpm lint && pnpm test` before each
commit.

Every currency or item action is one Postgres transaction. It locks the character row first, then
the feature rows by id, and checks state inside the transaction.

Parallel agents (max 3 at once):
- Each gets its own worktree and branch.
- Each gets a private `TEST_DATABASE_URL` whose name contains `test`.
- Each touches only its task's folders.
- Agents never push or merge `main`.

The coordinator merges one branch at a time and does the shared one-line wiring. Numbers that are
ours live in one `constants.ts` per feature so they can be tuned.

## Specs (read before the matching task)

| Topic | Source |
|---|---|
| Pet stats | `D/HomeModule/NewPetSystem.java:1368` (`RefreshPetProp`), `:410` (`OnPetItemCreate`) |
| Pet feeding | `NewPetSystem.java:777` (`OnCustomFeedFood`), `:1025` (`DigestFood`), `:1460-1500` (`GetFeedType`/`GetFeedMul`/`GetAddMul`) |
| Pet skills | `NewPetSystem.java:650` (`OnCustomActSkill`), `:719` (`OnCustomLearnSkill`), `:747` (skill book), `:867-990` (lock/remove), `:1290-1360` (learned skills, `MaxSkillCount`) |
| Pet configs | `R/pet/{PetCfg,PetGrow,PetFeedLib,PetSkillCnt,PetActCapital,NewPetCfg,PetSrcPro,PetSkillLib,PetSkillSrc,PetSkillDepot}.ini` |
| Pet skills in fights | `R/skill/skill.ini` rows with `ispet` 1-3 (`[40001]` at line 7906 points to `skill/skill_chonggong_40001.js`, not the `skill_40001.js` stub); `R/javascript/skill/skill_*_4xxxx.js`; `R/skill/skilladd.ini` |
| Pet in fights | `D/FightModule/FightSystem.java:996-1001` (pet passed with its master), `FightValue.java:15` (`IsPet` in the fight log) |
| Reborn pets | `json_items.json` pet items (`pets/<avatar>`, props `{avatar, nature, food}`), `serverConfig.petFamilies` (74 pairs), `assets/entities/pets/<avatar>/{data.json,avatar.json}`, `assets/icons/items/pets/` |
| Pet food, Kennel, Tracing | `json_items.json` 170113-170127 (`{hunger, type}`), locale `ui__kennel_shop*`, `ui__pet_tracing*`, `m5-reborn-reference.md` §5 |
| Wings and auras | `json_items.json` 218000-218054 and 218200-218207, `serverConfig.WING.Line`, wing offsets `main.js @1325191`, aura atlases `assets/entities/auras/<id>/` |
| Cards | `main.js @3331803` (collections `dx`), `@3330252` (card names), items 171001-171005 |
| Combat effects | `assets/entities/effects/offsets.json`, buff visuals `main.js @1358809` (table `we`), `assets/entities/numbers/{normal,heal}.json`, `assets/icons/effects.json` |
| Audio | `~/Privates/game-pockieninja/apache/source/music/*.mp3`, `data/reborn-raw/assets/audio/{playlist.json,*.mp3}` |

## Scope

**In (M6):**
- Pets: the Reborn catalog with 2011 rules, feeding, skills, the pet in battle, evolution.
- Pet Tracing and the Kennel shop.
- Wings and auras: Wing slot, stats, enhancement, Wing Collection.
- Cards: collections, boxes, completion prizes.
- Audio: BGM from both games, mute and volume.
- General combat effects: buff visuals, damage numbers, status icons.
- Quest steps EQUIP_PET and FEED_PET.

**Out (later):**
- M7 "Home & Launch": home and garden (crops, garden food types, the pet "slave" work bonus), admin
  panel, email verification and password reset, deployment.
- Backlog after M7:
  - card market and card synthesis;
  - outfit collection, recast and outfit stars (M5 decision 9), plus the 51 remaining and 34
    Reborn-only outfits' art;
  - seasonal events (their BGM `xmasevent`/`summerevent` is not imported);
  - SFX;
  - pet natures' "Nature Bonus" (server-side, unknown);
  - the 2011 pet "+N" grade rows;
  - clans and Bankai.

## Decisions

### User (2026-10-14)

1. **Pets are a hybrid.** 2011 rules are ported 1:1 where the server code or ini shows them. All
   190 Reborn pets supply the species list and art. Unknown numbers are ours, in one constants file
   per feature. The Reborn pet attack is PET_ATTACK 40001 (75% of basic damage, 21% cast chance).
   Pet Tracing and the Kennel shop are in scope; their rewards and the Feather sources are ours.
   Quest steps EQUIP_PET (7) and FEED_PET (8) are in scope.
2. **Wings and auras are Reborn stat items.** Wings are 218000-218018 with
   `{stat line, bonus level, wingSprite}`; `WING.Line` has 18 lines x 31 levels. The 8 auras
   (218200-218207) go in the wing slot and reuse the WING lines. Enhancement uses stones 218020-23
   and three talisman families with the outcomes fail, decrease, reset and destroy. Success rates
   are ours. The Wing Collection pays stones once per permanent wing. Visuals: the wing sprite on
   the avatar and the aura atlas in battle and on the character.
3. **Cards are collection plus boxes.** 74 cards in 10 collections, boxes 171001-171005 by rarity,
   and a completion prize. No card market and no synthesis. Drop sources and odds are ours.
4. **Audio uses both games.** 2011 BGM plays in the original scenes. Reborn BGM plays in Las
   Noches, Tailed Beast, Demon City, Valhalla and events. Mute and volume are saved. No SFX.
5. **General combat effects** play in battle: buff visuals, damage numbers, status icons.
6. **Out of M6:** home and garden, admin, email, deployment. They form milestone 7, "Home &
   Launch".
7. **Import 1:1 continues (M5 decision 1).** Reborn numbers and art may be imported. Art is WebP
   (audio MP3) under `client/public/assets/reborn/**` in Git LFS. Reborn sentences are not copied;
   names are the glossary default.

### Design (proposed by the planner; change on request)

#### Pets

8. **Catalog.** The species are the 190 Reborn pet items: `320002`-`320208` (with gaps) plus
   `340710` Ten Tails Beast.
   - Each has a nature (1 Plant, 2 Beast, 3 Artificial, 4 Dragon, 5 Tailed Beast, 6 Spirits) and a
     food type.
   - All 190 have an icon. 156 have battle art (`entities/pets/<avatar>`); the other 34 show their
     icon in battle.
   - Names come from the Reborn locale.
9. **2011 link.** Reborn `3200NN` is the same species as 2011 `i2830NN`. Checked: 320015 and
   i283015 are both Maneater Blossom; 320002 Baby Vulture is i283002 Vulture.
   - Linked species use the 2011 numbers:
     - growth and base props (Attack, Defence, Disturb, Active, Savvy) from `PetSrcPro`;
     - `FeedType`, `FoodMul0-5` and skill-kind weights from `NewPetCfg`;
     - skill pools from `PetSkillLib`, `PetSkillSrc` and `PetSkillDepot`.
   - Unlinked species are ours: growth is 100 for natures 1-3, 120 for 4 and 6, and 150 for 5,
     plus 20 for an evolved form. Base props and skill pools are the median and union of the
     linked species of the same nature.
   - The 11 explore pet bonuses (`PetBonusAppend` i283002-i283027) now grant the matching Reborn
     item (all 11 exist).
10. **Pet level cap 50.** This is 2011's `PetCfg maxlevel` with the `PetExp` table rows 1-50 1:1.
    Reborn shows 35. We keep 2011 because our level cap is 90 and the 2011 table covers 50. A
    pet's level cannot pass its master's level (ours).
11. **Pet stats 1:1.** Base props are rolled at 80-120% when the pet is adopted (`OnPetItemCreate`).
    Each total is `base x (1 + level x growth / 100) + bonus` (`RefreshPetProp`).
11b. **Pet base props (ours).** Every 2011 `PetSrcPro` prop is 0, so the bases are ours
    (`game-core/src/pets/constants.ts`).
    - **2011 fight use: none.** `RefreshPetProp` totals are only sent to the client (Compete,
      Arena and World Cup "look" data). The fight packet carries only `PetResourceID`,
      `PetConfig`, `PetGrowth` and `PetLevel`. No Java code or Rhino script reads the totals,
      and none sets `IsPet`. PET_ATTACK 40001 deals 0.75 x the master's `GetDamage` and uses the
      master's hit, crit and defence break.
    - **Bases at required level 30**, in the order Attack/Defence/Disturb/Active/Savvy:

      | Nature | Bases | Sum |
      |---|---|---|
      | 1 Plant | 6/14/10/8/12 | 50 |
      | 2 Beast | 14/8/10/10/8 | 50 |
      | 3 Artificial | 8/14/12/8/8 | 50 |
      | 4 Dragon | 12/8/7/7/10 | 44 |
      | 5 Tailed Beast | 9/8/7/7/7 | 38 |
      | 6 Spirits | 7/7/9/12/9 | 44 |

      High-growth natures get smaller sums because growth multiplies the bases (x51 to x91 at
      level 50).
    - **Scaling:** level 40 x1.1, level 50 x1.2, an evolved form x1.2. The required level is the
      Reborn item field 1 (30/40/50), which `pets.json` does not carry yet.
    - **Fight use (ours):** the totals become master bonuses before `deriveStats`: Attack/165 on
      both weapon attack terms, Defence/9 on defense, Disturb/18 on hit, Active/22 on dodge,
      Savvy/36 on crit.
    - **Power check** against a level-50 player (+6 white level 40-50 gear: HP 1624, attack
      118-145, defense 431), measured as DPS x effective HP against the same player without a
      pet:

      | Level-50 pet | Gain |
      |---|---|
      | Beast, growth 100 | +6.7% |
      | Beast or Plant, growth 120 (median) | +9.5% |
      | Spirits, evolved, growth 140 | +10.6% |
      | Tailed Beast, evolved, growth 170 | +12.9% |
      | Tailed Beast, level 50, growth 180 | +13.2% |

      PET_ATTACK (1:1) comes on top: +13% damage in mirror fights, and 352 of 400 seeded wins
      against the same player without a pet.
12. **Pet EXP (ours; the 2011 home server is not decompiled).** The active pet gets **50%** of
    the master's fight EXP from field, toll gate and Las Noches fights; arena gives none. When
    food finishes digesting, the pet also gets EXP equal to the appetite gained.
13. **Feeding 1:1 (`DigestFood`).**
    - A pet has 6 food slots. Each slot has a rolled type (`PetFeedLib [type]`, uniform over 1-7)
      and a multiplier tier (`[mul]` weights 90/5/3/2, read through the species' `FoodMul`).
    - Bonuses add up: like (`PetLikeMul`, when the food type equals the species' food type), combo
      (`PetC2Mul`-`PetC6Mul` 5/15/30/50/70) and perfect (`PetPerfMul` 40).
    - Digestion takes 7200 s, and appetite is capped at `HungerMax` 7200.
    - "Finish now" costs 8 gold (`DigestAtOnceCapital`; capital type checked in task 5).
    - Reborn food types 1-7 equal 2011 `ItemPetFeedType` 1-7 (ours). Any food feeds any pet; only
      the like bonus depends on the type.
    - The slave bonus is out (home, M7).
14. **Pet skills 1:1.**
    - **Kinds:** Halo (`ispet 1`), Help (`ispet 2`) and Pass (`ispet 3`).
    - **Learning:** a full appetite learns a random skill of the chosen kind from the species
      pool, and the appetite drops by the maximum (`OnCustomLearnSkill`). Learning a known skill
      raises its level.
    - **Learned list:** holds `MaxSkillCount` 5 skills. A sixth replaces the oldest unlocked one.
    - **Slots:** each kind has up to 6, and the total is `PetSkillCnt[level]` (7 at level 0 up to
      18 at level 35+). Slot n costs `PetActCapital[n]` stones to unlock.
    - **Items:** Pet Skill Lock `150406` (2011 `i150406`) keeps a skill. 2011 `i152027` removes one
      skill. The 50 Reborn skill books (props `petSkill`) each teach one skill.
15. **Pet in battle.**
    - The active pet rides with its master (`FightSystem.java:996-1001`). It is not a separate
      fighter.
    - PET_ATTACK 40001 is `skill_chonggong_40001.js`: probability 21, 75% of the master's damage,
      plus its freeze rider.
    - Help skills are trigger skills on the master's attack. Halo skills are fight-start buffs.
      Pass skills add SkillAdd and stats to the master.
    - Pet actions carry `isPet` in the replay (2011 fight log `IsPet`).
    - `FighterInput.pet?` holds the species, level, prop totals and skill ids with levels.
    - `Replay.fighters[].pet?` holds the species and avatar.
16. **Pet skill scripts.**
    - Port every `ispet` row of `skill.ini` that has a Rhino script (about 80, split over tasks 5
      and 6).
    - Pass rows without a script are data, read through `skilladd.ini`.
    - Reborn-only books 50056-50086 are not in `skill.ini`. They become Pass stat rows written
      from their level-1 tooltips (M5 decision 17 style); a book without a tooltip is left out and
      listed.
    - Pet fight buffs keep their 2011 ids (118xx). New ones use **15101-15199**.
17. **Kennel.**
    - Slots: 1 free (`OwnCount`), up to 5 (`MaxCount`). Each extra slot costs `ActiveCapital` 100
      of capital type 2 (task 5 checks it is gold).
    - Using a pet item adopts it into a free slot; the item is used up.
    - One active pet. It shows in the Inventory Pet slot (`client/src/game/Inventory.tsx:46`).
    - Release (ours) deletes the pet with no refund. Releasing the active pet is refused.
18. **Evolution (ours on top of `petFamilies`).** The 74 pairs map an evolved species to its base.
    Evolving needs pet level 30 and **50 Feathers**. The pet keeps its level, EXP, skills and
    rolled bases, and gets +20 growth.
19. **Nature** is shown on the pet card and has no stat effect in M6.

#### Pet Tracing and Kennel shop

20. **Pet Tracing.** The shell is Reborn 1:1; the rules are ours.
    - Level 20+.
    - 10 attempts a day, reset at 00:00 UTC.
    - +10 attempts once a day for 10 gold or 100 Gift Coupons (Reborn prices).
    - The board is 3x3 face-down cards, one of which hides the pet. Flipping a card costs 1 attempt
      and shows the pet or an arrow toward it (8 directions). Arrow cards stay open.
    - A find pays **10 Feathers** with a **5%** chance of a random pet item of nature 1-3; a new
      board follows. A miss pays **1 Feather**.
    - The board is seeded and stored on the server. The client never receives the pet cell.
    - About 25 Feathers a day.
21. **Kennel shop.** Prices are in Feathers (item 150319), at the given prices 1, 2, 3, 3, 6, 6
    and 100. Which item has which price is ours:

    | Item | Food type, hunger | Price | Level | Daily limit |
    |---|---|---|---|---|
    | 170114 Meatball | 3, 5 | 1 | 8 | 20 |
    | 170120 Meat Bone | 3, 10 | 2 | 23 | 20 |
    | 170117 Roast Chicken | 3, 80 | 3 | 8 | 20 |
    | 170116 Miso Soup | 7, 80 | 3 | 8 | 20 |
    | 170124 Lobster | 3, 180 | 6 | 23 | 20 |
    | 170123 Milk | 7, 180 | 6 | 23 | 20 |
    | 150406 Pet Skill Lock | - | 100 | 1 | 1 |

    The level gate is the item's level field (Reborn `ui__kennel_shop_locked`). Daily limits are
    ours. Feathers also keep their 2011 quest drop.

#### Wings and auras

22. **Wing slot.** A new equipped slot `Wing` holds one wing (218000-218018) or one aura
    (218200-218207). The item rows get `EquipType: 'Wing'` in the overlay, so the existing equip
    route works.
23. **Wing stats 1:1.**
    - Stats are `WING.Line[item.stat][level]` at levels 0-30. The item's `bonus` adds levels; it is
      0 on every item today.
    - The stat ids extend M5 decision 11:

      | Reborn stat id | Our field |
      |---|---|
      | 8 | `hp` |
      | 15 | `crit` |
      | 21 | `counter` |
      | 23 | `vampiricHp` |
      | 24 | `decDamage` |

      Ids 1-7 and 19 keep their M5 mapping.
    - Sum first, then truncate. Id 24 runs 1.2-4.0, so 1.2 counts as 1.
    - Task 7 pins the scale of `counter` and `vampiricHp` against `game-core/src/stats.ts:68-71`.
24. **Enhancement (rates ours).**
    - **Stones** (`levelJump` 1:1): 218020 Paradise Feather and 218021 Plume Shard give +1, 218022
      gives +3, 218023 gives +4. Levels cap at 30.
    - **Success by target level:**

      | Target level | 1-5 | 6-10 | 11-15 | 16-20 | 21-25 | 26-30 |
      |---|---|---|---|---|---|---|
      | Success | 100% | 80% | 60% | 40% | 25% | 15% |

    - **Failure by current level:**

      | Current level | Fail | Decrease (-1) | Reset (to 0) | Destroy |
      |---|---|---|---|---|
      | 0-9 | 100% | - | - | - |
      | 10-19 | 70% | 30% | - | - |
      | 20+ | 50% | 30% | 15% | 5% |

    - **Talismans:** at most one of each family per attempt. Stone and talismans are used up on
      every attempt.

      | Family | Items | Values | Effect |
      |---|---|---|---|
      | Luck | 218050-54 | bonus 12/25/50/75/100 | success x (1 + bonus/100), max 100% |
      | Safety | 218040-44 | reduction 15-100% | reduces decrease and reset; the rest becomes fail |
      | Integrity | 218030-34 | reduction 9-100% | reduces destroy |

      Names follow the locale: 218030 is "Talisman of Integrity", 218040 "Talisman of Safety".

    - `inventory_items.enhance_level` widens to 0-30. Gear stays capped at 12 in code.
25. **Wing Collection (ours).**
    - Each of the 26 wing and aura ids can be registered once.
    - The item must be in the bag and is **not** used up.
    - Reward: 5 x Plume Shard 218021 for 218000-218008, 10 for 218009-218018 and the auras.
26. **Wing sources (ours).**

    | Source | What |
    |---|---|
    | Team Stone BC shop | wings 218000-218003 (1500 BC), Plume Shard (50 BC), [D] talismans (100 BC each) |
    | Tailed Beast Essence shop | wings 218004-218008 (2000 Essence), 218022 (300), 218023 (600) |
    | Card collection prizes | 218009-218018 and the auras (decision 30) |

#### Cards

27. **Data 1:1.** 74 cards in 10 collections (`main.js @3331803`, names `@3330252`), each with a
    rarity GREEN, BLUE, PURPLE, RED or GOLD. Boxes 171001-171005 match those rarities.
28. **Opening a box (ours)** gives 1 card, uniform over the cards of that rarity's collections.
    Duplicates stack, and the count is kept for the later market and synthesis. Cards give no
    stats in M6.
29. **Box sources (ours).** Each source is a coordinator hook calling `rollCardBox(source, random)`.

    | Source | Box | Chance |
    |---|---|---|
    | Field monster win | Green | 1% |
    | Pub-fight win | Blue | 5% |
    | Las Noches, every 10th floor cleared | Red | 10% |
    | Tailed Beast 10-fight box | Purple | +1 |
    | Team Stone weekly pay, leagues 7-8 | Gold | +1 |

30. **Completion prize (ours, fixed, claimed once per collection).**

    | Rarity | Prize |
    |---|---|
    | GREEN | 3 x 218021 |
    | BLUE | 2 x 218022 + Talisman of Luck [D] |
    | PURPLE | one wing from 218009-218018, fixed per collection |
    | RED | one aura from 218200-218206, fixed per collection |
    | GOLD | 218207 Eight Gates aura |

    The constants file lists the item for each of the 10 collections.

#### Audio

31. **HTMLAudio, not Phaser audio.**
    - One `<audio>` element in a React provider plays BGM only. It survives Phaser scene swaps and
      battle overlays.
    - Phaser keeps `noAudio: true` (`client/src/game/phaser/game.ts:24`).
    - Mute and volume (0-100, default 50) are saved in `localStorage` under `pockie.audio`.
    - Music starts after the first user gesture (the autoplay rule). Track changes fade over
      300 ms.
32. **Track map.**

    | Where | Track |
    |---|---|
    | Villages 111-151 | 2011 `maincity1-4` |
    | Field zones 21xx-28xx | 2011 `maincity1-4`, picked by zone |
    | Toll gates and instances | 2011 `singlegate` |
    | Battles and arena | 2011 `compete1-4`, picked by fight seed |
    | Angel City 161 | 2011 `blackcity` (ours) |
    | Demon City 171 | Reborn `demonCity` |
    | Las Noches 3101 | Reborn `lasNoches` |
    | Scene 5001 | Reborn `valhalla` (Reborn playlist id, 1:1) |
    | Tailed Beast window and fights | Reborn `tb` |

    Not imported:
    - Reborn's copies of `maincity1-4` and `compete3` (the 2011 originals are used);
    - `xmasevent` and `summerevent` (seasonal events come later);
    - 2011 `login.s5230.mp3`, which is 209 bytes.
33. **Encoding.** Reborn tracks are re-encoded to MP3 96 kbps with ffmpeg. Opus was skipped
    because Safari support is uneven. 2011 tracks are copied as they are.

#### Visuals and assets

34. **Combat effects.**
    - `offsets.json` plus the 27 buff visuals of `we` (`main.js @1358809`) are mapped to our fight
      buff ids (2011 118xx, 15001+, 15101+) in one table, `client/src/game/phaser/effects-map.ts`.
      Unmapped buffs draw nothing.
    - The damage-number atlases (`normal`, `heal`) replace text numbers.
    - Status icons (`icons/effects.json`) show in the fighter's buff row.
    - Pet Halo skills play the `basic`/`advanced`/`expert_*_aura` effects.
35. **Avatar visuals.**
    - The wing sprite draws behind the avatar at its offset (`main.js @1325191`, per `wingSprite`).
    - The aura atlas draws behind the avatar in battle and in the Character window.
    - The pet stands behind its master in battle and plays its attack animation at `impactFrame`
      (`entities/pets/<avatar>/data.json` `motionEvents`) for PET_ATTACK.
    - `look` gains `pet`, `wingSprite` and `aura`.
36. **Asset size.**

    | Group | Estimate |
    |---|---|
    | Pets | 57 MB |
    | Wings | 39 MB |
    | Combat effects | 8 MB |
    | Auras | 4 MB |
    | Cards | 0.1 MB |
    | Audio | about 15 MB |
    | **Total** | **about 125 MB** in LFS (from `re/m6-assets-report.md`, audio redone for decision 33) |

    **Gate: 160 MB.** Convert one group, report the ratio, and stop and ask if the projection goes
    past the gate.
37. **Arena snapshots** (`server/src/modules/arena/snapshot.ts:26-66`) add the pet (species,
    level, totals, skills) and the wing or aura item and level to `fighter`, `look` and the
    `source` key. A change to any of them refreshes the snapshot in the same transaction.
38. **Quests.** New COMMAND ids follow `server/src/game/quests.ts:229-234`:
    - **82007** EQUIP_PET: set an active pet.
    - **82008** FEED_PET: start digesting.

    The Reborn tutorial quests with step type 7 or 8 (among the 12 deferred in M5 decision 21) are
    authored now.

## Patterns to mirror

| Need | Mirror (file:line) |
|---|---|
| Player fighter from DB, bonus sum | `server/src/game/combat.ts:98-104` (`playerFighter`), `:152-157` (`characterBonuses`), `:160` (`playerFighterFrom`), `:214` (`fightMonster`) |
| Summing effect bonuses | `server/src/game/nonfight-buffs.ts:39-63` (`buffBonuses`, `sumBonuses`), `server/src/game/bloodlines.ts:26` (`bloodlineBonuses`) |
| Bonus terms | `game-core/src/stats.ts:36-77` (`Bonuses`) |
| Fighter input and replay types | `game-core/src/battle/types.ts:32` (`FighterInput`), `:135-137` (`Replay.fighters`) |
| Fighter build | `game-core/src/battle/fight.ts:111-161` (`toFighter`) |
| Register skill scripts | `game-core/src/battle/skills.ts:48-60` (`SKILL_SCRIPTS`) |
| Trigger skill and buffs script | `game-core/src/battle/scripts/ninjutsu-trigger-a.ts`, `ninjutsu-buffs.ts`, `scroll-skills.ts` (+ tests) |
| Pet regeneration aura note | `game-core/src/battle/buffs.ts:68` (ponytail note to resolve) |
| Pure rules plus tests | `game-core/src/reborn/{talents,bloodlines,souls}.ts`, `game-core/src/events/dice.ts` |
| Talent input on the fighter | `server/src/game/talents.ts:10` (`talentFighterInput`) |
| Arena snapshot and source key | `server/src/modules/arena/snapshot.ts:26-66` |
| Item use dispatch | `server/src/modules/game/actions.ts:279-319` |
| Shop with prices and limits | `server/src/modules/shop/routes.ts:235`, `character_mystic_purchases` in `server/src/db/schema.ts:498-514` |
| Daily attempts, gold buy, lazy reset | `server/src/modules/events/routes.ts:42` (Dice of Fate), `server/src/modules/talents/` |
| Explore pet bonus | `server/src/game/explore.ts:57-66` (`rollStarBonus`) |
| Quest commands | `server/src/game/quests.ts:220-240` |
| Inventory instance state | `server/src/db/schema.ts:257-300` (`inventory_items`, `enhance_level` check `:300`) |
| Overlay data import | `tools/game-data/import-reborn.ts:599-606`, `server/src/game/data.ts:28` (`load`) |
| Asset convert and manifest | `tools/assets/reborn.ts:42` (`selectAssets`), `:65` (`exportReborn`) |
| Asset fetch (M6 groups) | `tools/fetch-reborn-assets.ts:250` (`--m6`), `tools/assets/reborn-fetch.ts:6` (`enumerateM6`), `:81` (`audioPaths`) |
| Phaser preload and timeline | `client/src/game/phaser/battle-scene.ts`, `timeline.ts`, `secret-technique.ts` (+ tests) |
| Building hotspots | `client/src/game/phaser/picture-layout.ts:54-55` (`clip_pet`, `clip_CardLink`); `picture-scene.ts:52-63` (only NPC hotspots are clickable today) |
| Feature window and HUD entry | `client/src/game/windows.tsx:69` (`WINDOWS`), `client/src/game/Hud.tsx:156` (`EventsMenu`) |
| Route registration | `server/src/app.ts:64-88` |

## Folder ownership

| Area | Folders | Task |
|---|---|---|
| Asset fetch | `tools/fetch-reborn-assets.ts`, `tools/assets/reborn-fetch.ts`, `tools/assets/reborn-report.ts` | 1 (done) |
| Data import | `tools/game-data/import-reborn.ts`, `server/data/game/reborn/`, `server/src/game/data.ts`, `client/src/i18n/reborn.json` | 2 |
| Schema and migrations | `server/src/db/`, `server/drizzle/` | 3 |
| Asset convert and audio | `tools/assets/reborn.ts` (+ new `tools/assets/audio.ts`), `client/public/assets/reborn/{pets,wings,auras,effects,numbers,cards,audio}/`, `client/public/assets/game/audio/`, `client/src/generated/reborn-*.json`, `package.json` scripts | 4 |
| Pet engine | `game-core/src/pets/`, `game-core/src/battle/{fight.ts,types.ts,skills.ts}`, `game-core/src/battle/scripts/pet-core.ts` | 5 |
| Pet skill scripts | `game-core/src/battle/scripts/pet-help-*.ts`, `pet-halo-*.ts` | 6 |
| Wings and auras | `server/src/modules/wings/`, `server/src/game/wings.ts`, `game-core/src/wings/`, `shared/src/schemas/wings.ts`, `client/src/game/wings/`, `client/src/game/Inventory.tsx` | 7 |
| Cards | `server/src/modules/cards/`, `game-core/src/cards/`, `shared/src/schemas/cards.ts`, `client/src/game/cards/` | 8 |
| Pets feature | `server/src/modules/pets/`, `server/src/game/pets.ts`, `shared/src/schemas/pets.ts`, `client/src/game/pets/` | 9 |
| Audio | `client/src/game/audio/` | 10 |
| Pet Tracing and Kennel shop | `server/src/modules/kennel/`, `game-core/src/events/pet-tracing.ts`, `shared/src/schemas/kennel.ts`, `client/src/game/kennel/` | 11 |
| Battle and avatar visuals | `client/src/game/phaser/`, `client/src/game/CharacterWindow.tsx` | 12 |
| Quests | `tools/quests/`, `server/data/game/reborn/tasks*.json`, `server/src/game/quests.ts`, `client/src/game/QuestLog.tsx` | 13 |
| Translation review | `tools/i18n/`, `client/src/i18n/` | 14 |
| Verification | `e2e/`, `docs/` | 15 |

**Coordinator wiring.** Feature tasks export the function and ask for the wiring; the coordinator
adds one line each when merging:
- **Routes:** pets, kennel, wings and cards in `server/src/app.ts`.
- **Windows and HUD:** Kennel, Pet Tracing, Kennel Shop, Wings and Cards in
  `client/src/game/windows.tsx`; HUD entries in `client/src/game/Hud.tsx`.
- **Schemas:** re-exports in `shared/src/index.ts`.
- **Fighter:** in `server/src/game/combat.ts`, `petFighterInput(tx, id)` goes on the player
  fighter and `wingBonuses(tx, id)` goes into the `sumBonuses` call at `:104` and into
  `characterBonuses`.
- **Snapshot:** the same terms go into `arenaFighter` in `server/src/modules/arena/snapshot.ts`,
  added to `source` and `look`.
- **Hooks:**
  - explore pet grant in `server/src/game/explore.ts:64` and its route;
  - pet EXP share after field, toll gate and Las Noches fights;
  - card box drops (decision 29);
  - wing and talisman entries in the Team Stone BC shop and the Tailed Beast Essence shop;
  - quest commands 82007 and 82008 in the pets routes;
  - the `<PetSlot>` component in `client/src/game/Inventory.tsx`;
  - `<AudioProvider>` in `client/src/game/GameApp.tsx`.
- **Jobs:** no new timers in `server/src/jobs.ts`. Digestion and the daily resets are lazy.

## Files to change

**New:**
- Data:
  - `server/data/game/reborn/{pets,pet-skills,pet-foods,wings,wing-lines,cards,kennel-shop}.json`
- game-core:
  - `game-core/src/pets/{stats,feeding,skills,exp,constants}.ts` (+ tests);
  - `game-core/src/battle/scripts/pet-core.ts`, `pet-help-*.ts`, `pet-halo-*.ts` (+ tests);
  - `game-core/src/wings/{enhance,constants}.ts` (+ tests);
  - `game-core/src/cards/{boxes,constants}.ts` (+ tests);
  - `game-core/src/events/pet-tracing.ts` (+ test).
- Server:
  - `server/src/modules/{pets,kennel,wings,cards}/` (routes, rules, `*.api.test.ts`);
  - `server/src/game/{pets,wings}.ts`.
- Shared: `shared/src/schemas/{pets,kennel,wings,cards}.ts`.
- Client:
  - `client/src/game/{pets,kennel,wings,cards,audio}/`;
  - `client/src/game/phaser/{pet,wing,aura,effects,effects-map,numbers}.ts` (+ tests).
- Tools: `tools/assets/audio.ts` (+ test).
- Generated and assets:
  - `client/src/generated/reborn-{pets,wings,auras,effects,cards,audio}.json`;
  - `client/public/assets/reborn/**`, `client/public/assets/game/audio/`.
- Migrations: `server/drizzle/0029-0032` and their meta snapshots.

**Changed:**
- game-core: `game-core/src/battle/{fight.ts,types.ts,skills.ts,buffs.ts}`,
  `game-core/src/index.ts`.
- Server:
  - `server/src/game/{combat.ts,data.ts,explore.ts,quests.ts}`;
  - `server/src/modules/arena/snapshot.ts`;
  - `server/src/modules/{team-stone,tailed-beast,gates}/` (hooks only);
  - `server/src/{app.ts}`, `server/src/db/schema.ts`.
- Client:
  - `client/src/game/{windows.tsx,Hud.tsx,Inventory.tsx,CharacterWindow.tsx,GameApp.tsx,QuestLog.tsx}`;
  - `client/src/game/phaser/{battle-scene.ts,timeline.ts,picture-scene.ts}`.
- Tools and config: `tools/game-data/import-reborn.ts`, `tools/assets/reborn.ts`, `package.json`
  (script `assets:audio`).

## Tasks

### Task 1: Asset fetch (done, merged `1133c13b`)
- **Action**: `node tools/fetch-reborn-assets.ts --m6` fetches audio, pets, wings, auras, combat
  effects and cards into `data/reborn-raw/assets/`. It writes `data/reborn-raw/re/m6-assets-report.md`:
  12 audio files, 713 pet files (448 probes absent, so 34 pets have no battle art), 85 wing, 24 aura,
  164 effect and 74 card files.

### Task 2: Data import
- **Action**: extend `import-reborn.ts` to write `server/data/game/reborn/`:

  | File | Contents |
  |---|---|
  | `pets.json` | 190 species: item id, avatar, nature, food type, family parent, 2011 link (decision 9), growth, base props, FoodMul, skill-kind weights, skill pool |
  | `pet-skills.json` | every `ispet` row from `skill.ini` and `skilladd.ini`, plus Reborn-only book rows (decision 16) |
  | `pet-foods.json` | 170113-170127 hunger and type, plus the 2011 `PetFeedLib`, `PetGrow`, `PetExp`, `PetSkillCnt` and `PetActCapital` tables |
  | `wings.json` | items 218000-218054 and 218200-218207 |
  | `wing-lines.json` | `WING.Line` with stat ids mapped by decision 23 |
  | `cards.json` | 10 collections, 74 cards, rarity, image path (parsed from `main.js`, never executed) |
  | `kennel-shop.json` | the decision 21 table |

  Item overlay rows go in item.ini shape:
  - pets 3200xx/340710 (`CanUse 1`, class `PetItem`);
  - foods;
  - wing and aura items (`EquipType 'Wing'`);
  - stones and talismans;
  - card boxes 171001-171005 (`CanUse 1`);
  - pet skill books.

  `data.ts` loads and validates each file with zod. Names (species, foods, wings, auras, talismans,
  cards, collections, pet skills) go to `client/src/i18n/reborn.json` and the glossary.
- **Mirror**: `tools/game-data/import-reborn.ts:599-606`, `server/src/game/data.ts:28`.
- **TDD**:
  - counts: 190 pets, 74 families, 26 wing/aura items, 18 lines x 31 levels, 74 cards in 10
    collections, 5 boxes, 50 books;
  - all 11 explore `PetBonusAppend` ids resolve to a Reborn species;
  - every WING stat id is mapped;
  - no overlay id collides with a 2011 item, skill or buff id.
- **Validate**: `pnpm --filter @pockie/tools test -- import-reborn && pnpm --filter @pockie/server test -- data`

### Task 3: Schema and migrations
- **Action**: Drizzle tables, checks and migrations 0029-0032 (table below). No feature logic.
- **Mirror**: `server/src/db/schema.ts:257-300`, `server/drizzle/0022_bloodlines.sql`,
  `0024_daily_events.sql`, `server/src/db/m5-tables.test.ts`.
- **TDD**: `server/src/db/m6-tables.test.ts`:
  - one active pet per character (partial unique index);
  - kennel slot 0-4, unique per character;
  - pet level 1-50; appetite 0-7200;
  - skill kind 1-3, at most 6 per kind;
  - `pet_slots` 1-5;
  - `enhance_level` 0-30;
  - wing collection unique (character, item);
  - card id 1-74; collection 1-10; prize once;
  - non-negative counts.
- **Validate**: `pnpm db:reset && pnpm --filter @pockie/server test -- migrations m6-tables`

### Task 4: Asset convert, manifests and audio
- **Action**:
  1. Extend `selectAssets`/`exportReborn` for the M6 groups. Pets, wings, auras and effects are
     multiatlas JSON plus WebP pages; numbers and status icons are atlases; cards are WebP. Write
     `client/src/generated/reborn-{pets,wings,auras,effects,cards}.json`:
     - pets by avatar: `{ atlas, pages, animations, motionEvents }`, or `{ icon }` when there is no
       art;
     - wings by `wingSprite`: `{ atlas, pages, offset }` (offset from `@1325191`);
     - auras by name;
     - effects by name: `{ atlas, offset, depth }` from `offsets.json` and `we`;
     - cards by collection and card.
  2. Add `tools/assets/audio.ts` (`pnpm assets:audio`): ffmpeg MP3 96 kbps for the Reborn tracks
     of decision 32, and a copy of the 10 non-empty 2011 tracks to `client/public/assets/game/audio/`.
     Write `client/src/generated/reborn-audio.json` (track name, url, bytes). Re-runs are
     reproducible: they skip files whose source hash is unchanged.
  3. **Gate (decision 36)**: convert pets first, report the ratio, and stop and ask if the
     projection goes past 160 MB.
- **Mirror**: `tools/assets/reborn.ts:42-65` and `reborn.test.ts`, `tools/assets/cache.ts`.
- **TDD**: atlas rewrite keeps frame rects; every catalog pet resolves to art or an icon; every
  wing item's `wingSprite` has an offset; a second run writes 0 files.
- **Validate**: `pnpm --filter @pockie/tools test -- reborn audio && pnpm assets:reborn && pnpm assets:audio && du -sh client/public/assets/reborn`
- **Depends on**: 1.

### Task 5: Pet engine (game-core)
- **Action**:
  - Write `game-core/src/pets/`:
    - `petTotals` (decision 11);
    - `rollBases(random)`;
    - `petLevelFromExp` (`PetExp` 1-50, master-level cap);
    - `digest(slots, species, random)` (`DigestFood` 1:1, decision 13);
    - `learnSkill`, `slotCost` and `skillCap` (decision 14);
    - `constants.ts` for decisions 10, 12, 17 and 18.
  - Add `FighterInput.pet?` and `Replay.fighters[].pet?`, plus `look` fields for pet, wing and
    aura (decision 35).
  - In `fight.ts`:
    - Pass skills feed bonuses before `deriveStats`.
    - Halo skills add their buffs at fight start.
    - PET_ATTACK 40001 and the Help skills roll on the master's attack.
    - Pet actions write `isPet`.
  - Port `skill_chonggong_40001.js` and the Pass rows in `pet-core.ts`. Resolve the
    `buffs.ts:68` regeneration-aura note (11861-11863, 11888).
  - List every `ispet` script id for task 6 in `game-core/src/pets/skill-ledger.md`.
  - Confirm in the 2011 code:
    - the capital types of `ActiveCapital` and `DigestAtOnceCapital`;
    - how `MaxSkillCount` interacts with the kind slots.
- **Mirror**: `fight.ts:111-161`, `stats.ts:36-77`, `scripts/scroll-skills.ts`,
  `game-core/src/reborn/souls.ts`.
- **TDD**:
  - totals at levels 1, 30 and 50 with growth 120;
  - a digest with like, a 3-combo and perfect matches a hand computation from `DigestFood`;
  - learning a known skill levels it; a 6th learned skill drops the oldest unlocked one; slot 7
    costs 26000;
  - a seeded fight with a pet shows PET_ATTACK at 75% damage;
  - a replay without a pet is byte-identical to today's.
- **Validate**: `pnpm --filter @pockie/game-core test`
- **Depends on**: 2.

### Task 6: Pet Help and Halo skill scripts
- **Action**: port the remaining `ispet` 1-2 Rhino scripts from task 5's ledger (about 80). New
  fight buffs use 15101-15199. Register them in `SKILL_SCRIPTS`. Extend the `slice-skills.test.ts`
  guard so every pet skill row has a script or is a Pass data row.
- **Mirror**: `scripts/ninjutsu-trigger-a.ts`, `ninjutsu-buffs.ts` (+ tests).
- **TDD**: one seeded test per script: trigger, damage or buff value at level 1, expiry.
- **Validate**: `pnpm --filter @pockie/game-core test -- pet slice-skills`
- **Depends on**: 5.

### Task 7: Wings and auras feature
- **Action**:
  - `game-core/src/wings/`: `wingStats(item, level)` (decision 23) and
    `enhance(level, stone, talismans, random)` (decision 24).
  - Routes:
    - `GET /api/game/wings` (equipped, owned, collection);
    - `POST /wings/:itemRowId/enhance {stone, luck?, safety?, integrity?}`;
    - `POST /wings/collection/:itemId`.
  - Export `wingBonuses(tx, id)` for the coordinator.
  - Add the Wing slot to `Inventory.tsx` `SLOTS`.
  - Client: Wings window with an Enhance tab (outcome odds shown) and a Collection tab (26 entries).
  - Equipping or enhancing refreshes the arena snapshot.
- **Mirror**: `server/src/modules/forge/` (enhance), `server/src/game/bloodlines.ts:26`,
  `client/src/game/bloodlines/`.
- **TDD**:
  - each outcome band at levels 5, 15 and 25 (seeded);
  - talismans move odds as specified;
  - destroy deletes the row and unequips;
  - levels cap at 30;
  - one collection claim per id;
  - fighter stats rise by the line values;
  - two concurrent enhances use the stone once each and never skip a level check.
- **Validate**: `pnpm --filter @pockie/game-core test -- wings && pnpm --filter @pockie/server test -- wings`
- **Depends on**: 2, 3.

### Task 8: Cards feature
- **Action**:
  - `game-core/src/cards/`: `openBox(rarity, random)` (decision 28) and
    `rollCardBox(source, random)` (decision 29).
  - Box item use goes through `/items/:id/use`.
  - Routes: `GET /api/game/cards` (collections, counts, prize state) and
    `POST /cards/collections/:id/claim` (decision 30).
  - Client: Card Room window (10 collection pages, card art, progress, claim).
- **Mirror**: `server/src/modules/game/treasure.ts` (box open), `actions.ts:279-319`.
- **TDD**:
  - opening a box adds a card of its rarity and uses up the box;
  - duplicates stack;
  - claim is refused while incomplete and allowed once;
  - a full bag refuses the prize and keeps the claim;
  - seeded source odds.
- **Validate**: `pnpm --filter @pockie/game-core test -- cards && pnpm --filter @pockie/server test -- cards`
- **Depends on**: 2, 3.

### Task 9: Pets feature (server and client)
- **Action**:
  - Routes:
    - `GET /api/game/pets` (kennel, active, digest state);
    - adopt through item use;
    - `POST /pets/slots/unlock`;
    - `POST /pets/:id/active`;
    - `POST /pets/:id/feed {foods[]}` (fills slots, starts digesting);
    - `POST /pets/:id/digest-now` (8 gold);
    - `POST /pets/:id/skills/learn {kind}`;
    - `POST /pets/:id/skills/slot {kind}`;
    - `POST /pets/:id/skills/:skill/lock`;
    - `POST /pets/:id/skills/:skill/remove`;
    - skill book use;
    - `POST /pets/:id/evolve`;
    - `POST /pets/:id/release`.
  - Digestion finishes lazily on read and on write.
  - Exports for the coordinator:
    - `petFighterInput(tx, id)`;
    - `grantPetExp(tx, id, exp)`;
    - `adoptFromExplore(tx, id, itemId)`;
    - the quest command calls.
  - Client:
    - Pet Kennel window (5 slots, pet card with nature, level, props, appetite bar, digest timer,
      6 food slots with type and multiplier, skills by kind with lock and remove);
    - `<PetSlot>` for the Inventory.
- **Mirror**: `server/src/modules/bloodlines/` (`turn-in` locking), `server/src/game/talents.ts:10`,
  `client/src/game/bloodlines/`.
- **TDD**:
  - adopt into a full kennel is refused;
  - slot unlock price and the 5-slot max;
  - one active pet;
  - feeding while digesting is refused;
  - digest-now charges once;
  - learn needs a full appetite;
  - lock keeps a skill through replacement;
  - evolve needs level 30 and Feathers;
  - releasing the active pet is refused;
  - pet EXP share never passes the master's level;
  - two concurrent feeds use the food once.
- **Validate**: `pnpm --filter @pockie/server test -- pets && pnpm --filter @pockie/client test -- pets`
- **Depends on**: 2, 3, 5.

### Task 10: Audio
- **Action**:
  - `client/src/game/audio/`: `AudioProvider` with one `<audio>`, `useSceneTrack(sceneId)` and
    `useBattleTrack(seed)` (decision 32), the 300 ms fade, and a gesture unlock.
  - A Sound settings panel (mute toggle, volume slider with a label) opened from the HUD settings
    menu.
  - The track map lives in `audio/tracks.ts`.
- **Mirror**: `client/src/game/events/timer.ts` (small hook plus test), `client/src/game/BuffsPanel.tsx`.
- **TDD**:
  - scene to track for each row of decision 32;
  - mute and volume persist across reloads (`localStorage`);
  - no playback before a gesture;
  - the same track does not restart on a scene change.
- **Validate**: `pnpm --filter @pockie/client test -- audio`
- **Depends on**: 4.

### Task 11: Pet Tracing and Kennel shop
- **Action**:
  - `game-core/src/events/pet-tracing.ts`: `newBoard(random)`, `flip(board, cell)` with arrows,
    and payouts (decision 20).
  - Routes:
    - `GET /api/game/kennel/tracing`;
    - `POST /kennel/tracing/flip {cell}`;
    - `POST /kennel/tracing/buy {currency}`;
    - `GET /kennel/shop`;
    - `POST /kennel/shop/buy {itemId, count}` (decision 21, pays in Feather items).
  - Client: Pet Tracing window (3x3 board, attempts left, buy button) and Kennel Shop window.
- **Mirror**: `server/src/modules/events/routes.ts:42` (Dice of Fate attempts and buy), mystic
  purchases (`schema.ts:498-514`), `client/src/game/events/`.
- **TDD**:
  - the pet cell is never in a response before it is found;
  - the 11th flip is refused;
  - buy once a day for gold or coupons;
  - a find pays 10 and resets the board;
  - seeded 5% pet roll;
  - the UTC day reset;
  - shop level gate, daily limit, too few Feathers;
  - concurrent flips spend one attempt each.
- **Validate**: `pnpm --filter @pockie/game-core test -- pet-tracing && pnpm --filter @pockie/server test -- kennel`
- **Depends on**: 2, 3, 9.

### Task 12: Battle and avatar visuals
- **Action**:
  - `battle-scene.ts` preloads only the pet, wing, aura, effect and number atlases used by the
    replay.
  - `timeline.ts`:
    - pet poses behind the master;
    - PET_ATTACK impact at `impactFrame`;
    - buff add and remove play the mapped effect at its offset and depth;
    - damage and heal numbers use the atlases;
    - status icons in the buff row.
  - Wing and aura layers sit behind the avatar in battle and in `CharacterWindow.tsx`.
  - `picture-scene.ts` makes `clip_pet` (Pet Kennel) and `clip_CardLink` (Card Room) clickable
    through a new `onBuilding(clip)` action.
- **Mirror**: `phaser/secret-technique.ts` (+ test), `phaser/weapon.ts` (+ test), `timeline.ts`
  strike flow.
- **TDD (pure)**:
  - the defender mirrors pet and wing offsets;
  - a missing pet atlas falls back to the icon;
  - an unmapped buff draws nothing;
  - number glyph layout for 0-9 and heal;
  - the aura sits behind the avatar's depth.
- **Validate**: `pnpm --filter @pockie/client test -- phaser` plus a manual Playwright screenshot
  of an arena replay with a pet, a wing and an aura.
- **Depends on**: 4, 5, 7.

### Task 13: Quests EQUIP_PET and FEED_PET
- **Action**: add COMMAND ids 82007 and 82008 to `quests.ts`, exported for the pets routes. Author
  the Reborn tutorial quests that use step types 7 and 8 (found in `quests.json`) in Task.ini
  shape. Quest text is ours.
- **Mirror**: `server/src/game/quests.ts:220-240`, `tools/quests/`.
- **TDD**: the command steps complete; every NPC, item and pet referenced exists.
- **Validate**: `pnpm --filter @pockie/server test -- quests reborn-quests`
- **Depends on**: 9.

### Task 14: Translation review
- **Action**: review every string in the M6 windows (Kennel, Tracing, Shop, Wings, Card Room,
  Sound), the pet skill tooltips (ours for Reborn-only books) and the quest texts against the
  glossary. Light work: Sonnet.
- **Depends on**: 7-13.

### Task 15: Verification
- **Action**:
  - Playwright journeys:
    - adopt, feed, digest-now and activate a pet, then win a field fight showing PET_ATTACK;
    - play Pet Tracing and buy food;
    - equip, enhance and register a wing;
    - open a card box and claim a collection (seeded);
    - mute and volume persist.
  - `docs/security-review-m6.md` covers every M6 route: locks, dupes, the tracing board leak,
    daily-cap races, gold paths, destroy outcomes.
- **Validate**: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`, with 80%+ coverage on new
  modules.
- **Depends on**: all.

## Parallel waves (max 3 agents, disjoint folders)

| Wave | Agents | Notes |
|---|---|---|
| 0 | T1 asset fetch | Done |
| 1 | T2 data import, T3 schema, T4 assets and audio | T3 merges first; T4 stops at the 160 MB gate for the user's OK |
| 2 | T5 pet engine, T7 wings, T8 cards | T5 owns `fight.ts`/`types.ts`/`skills.ts`; the coordinator wires `wingBonuses` into `combat.ts` and `snapshot.ts` |
| 3 | T6 pet scripts, T9 pets feature, T10 audio | T6 adds one spread line to `skills.ts` (the coordinator merges it); after T9 the coordinator wires the pet fighter, the explore grant, EXP share, `<PetSlot>` and routes |
| 4 | T11 Tracing and Kennel shop, T12 visuals, T13 quests | Card box and shop hooks are wired after T8, T7 and T11 merge |
| 5 | T14 translation | Once 7-13 are merged |
| 6 | T15 verification | After everything is merged |

## Migrations (task 3, in order)

| # | Name | Content |
|---|---|---|
| 0029 | `pets` | `character_pets`: uuid, character, species, name, kennel_slot 0-4 (unique per character), active (partial unique), level 1-50, exp, growth, 5 base props, appetite 0-7200, digest_ends_at null, food_slots jsonb (6 x `{type, mul, item?}`), adopted_at. `character_pet_skills`: pet, skill_id, level, learned_order, locked, kind 1-3, slotted. `characters.pet_slots` 1-5, default 1. |
| 0030 | `kennel` | `character_pet_tracing`: character, day, attempts_used, bought_day, board jsonb, finds. `character_kennel_purchases`: character, day, item_id, count. |
| 0031 | `wings` | `inventory_items_enhance_level` check becomes 0-30. `character_wing_collection`: character, item_id, registered_at, unique. |
| 0032 | `cards` | `character_cards`: character, card 1-74, count > 0. `character_card_prizes`: character, collection 1-10, claimed_at, unique. |

## Risks

| Risk | Mitigation |
|---|---|
| The pet skill port is large (about 80 scripts plus Pass rows) | Two tasks (T5 core, T6 batch) and a ledger; unported ids are listed and filtered out of pools until done |
| Pets become a power spike (Pass SkillAdd, Halo buffs at level 50) | 1:1 numbers, pet level capped at the master's level; seeded arena win-rate check in T15; constants per feature |
| Wing destroy feels punishing, or rates feel off | Destroy only at 20+ with 5% base; Integrity talismans; rates in `game-core/src/wings/constants.ts` |
| LFS growth (already 411 MB) | 160 MB gate in T4, lossy WebP, per-replay lazy loading, audio at 96 kbps |
| Autoplay blocked or audio leaking across windows | One provider, gesture unlock, scene-based switching tested |
| Pet Tracing board leaks through the API | Pet cell server-only; T15 security review checks every response |
| Stale arena snapshots after pet, wing or aura changes | Source key includes them; refresh in the same transaction |
| Reborn sentences copied by accident | T14 review; only names come from Reborn |
| Fractional wing stats (damage reduction 1.2%) lose precision | Sum before truncating (decision 23); revisit if testers notice |

## Acceptance

- [ ] A ninja adopts, feeds (digest, like/combo/perfect), levels to 50, unlocks slots and learns,
      locks and removes skills, evolves and releases pets within the caps.
- [ ] The active pet shows in the Inventory and in battle; PET_ATTACK and Help/Halo/Pass skills
      change seeded fights; arena snapshots include the pet.
- [ ] Pet Tracing pays Feathers within 10 (+10) attempts a day; the Kennel shop sells the 7 items
      with level gates and daily limits.
- [ ] Wings and auras equip in the Wing slot, add their line stats, enhance with every outcome and
      talisman effect, and register once in the Wing Collection.
- [ ] Card boxes fill the 10 collections; each completion prize is claimed once.
- [ ] Battles show pets, wings, auras, buff visuals, damage numbers and status icons; missing art
      falls back cleanly.
- [ ] BGM follows the decision 32 map; mute and volume persist.
- [ ] EQUIP_PET and FEED_PET steps complete.
- [ ] Every new route is in `docs/security-review-m6.md`; `pnpm typecheck && pnpm lint && pnpm test
      && pnpm e2e` is green.
- [ ] M6 assets stay within the 160 MB gate (or the user accepts more).

## Answered by the user (2026-10-14)

1. **Pet level cap:** 50 (2011), as decision 10.
2. **Talisman ids:** follow the Reborn locale (218030 Integrity, 218040 Safety), as decision 24.
3. **Wing Collection:** register without using up the wing, as decision 25.
4. **Scene 5001:** play `valhalla.mp3` only if our 5001 is the Valhalla map (check its scene name
   in the i18n); otherwise drop the track.
5. **Pet EXP share 50%** and **evolution at level 30 for 50 Feathers** are accepted. The 34 pets
   without Reborn art use their family base pet's art; with no family, the item icon only.
6. **LFS budget:** about 130 MB accepted; the 160 MB gate stays.
