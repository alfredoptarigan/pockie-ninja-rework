# Original data: fields 26xx-28xx

Reference for milestone 3 (all field zones). RES = `app/code/props/serv/game/Resource`,
J = decompiled server (`local-run/.runtime/decompiled/service/com/d2/serv/game`),
DT = `apache/source/binary/datatable`, MC = `apache/source/movieclip`. Imported copies live in
`server/data/game/*.json` (same field names). English names from `tools/i18n/en.json`
(`lg_Scene_BackGround_<id>`, `lg_name_<npc>`). General rules for scenes, NPCs, explore spots and
quests are in `world.md` and `quests-items.md`; this file lists the per-zone data and the gaps.

## Neutral fields (`RES/scene/logicscene.ini`, `DT/levelsceneid.s26804.tab`)

All 13 are `Type 1`, `Nation -1` (any village), `IsStart 1`, `CanEnemy 1`, `CanTeam 1`, `CanRelive 1`.
`Level` (logicscene) equals `RequireLevel` in `sceneswitchrule.ini`; the band is the client's
level hint. Links = `scenequeue.ini` `r=` slots, non-empty only.

| Scene | Name                     | Level | Band  | Links (scenequeue)                       |
| ----- | ------------------------ | ----- | ----- | ---------------------------------------- |
| 2601  | Crossroads               | 16    | 16-25 | 2604, 2602, 2102, 2202, 2502, 2402, 2302 |
| 2605  | Eerie Passage            | 26    | 26-30 | 2704, 2701                               |
| 2602  | Dawning Wilds            | 31    | 31-35 | 2601, 2603                               |
| 2603  | Sun Village              | 36    | 36-40 | 2602, 2604                               |
| 2604  | Glowing Forest           | 41    | 41-45 | 2603, 2601                               |
| 2701  | Abandoned Evernight City | 46    | 46-50 | 2605, 2702                               |
| 2702  | Soulshatter Valley       | 51    | 51-55 | 2701, 2703                               |
| 2703  | Marsh of Death           | 56    | 56-60 | 2702, 2704                               |
| 2704  | Plains of Despair        | 61    | 61-65 | 2703, 2605                               |
| 2801  | Dragontame Valley        | 66    | 66-70 | 2704, 2802                               |
| 2802  | Dragontame Forest        | 71    | 71-80 | 2801                                     |
| 2803  | Dragontame Coast         | 81    | 81-85 | 2802, 2804                               |
| 2804  | Hidden Rain Village      | 86    | 86-90 | 2803                                     |

- Entry points: every xx02 field links to 2601; Angel City 161 links to 2605 and its `ToScene` is
  2601 (go out); 2601 has no link to 161 (the world map is the way back).
- Links are one-way lists and not symmetric: 2704 does not list 2801, 2802 does not list 2803.
  Everything is also reachable from the world map.
- Travel cost: `sceneswitchrule.ini` source keys only cover villages, 161/171 and 21xx-25xx (all
  `0,0`); a missing source key means free (`SceneSwitchRuleSystem.java:141`). So all 26xx-28xx
  travel is free, gated only by level. Scene name has a trailing space in the source for 2804.
- Nation lock: 21xx-25xx fields carry their village's `Nation`; entering another village's field is
  refused (`FeedBack_Common_004`) unless an accepted task is listed in
  `RES/task/ExceptTaskScene.ini` for that scene (`SceneSystem.java:300`,
  `TaskSystem.java:284-299`, submit scene or a `CanTransfer=1` subtask). 40 rows: main-chain tasks
  that visit 2103, 2203, 2403, 2503 (e.g. Fire 10092/10097-10099 → 2403, 10120 → 2203,
  10140 → 2503). **Not imported yet.**

## Monsters per field (`RES/npc/RefresNpc.ini`, `npc.ini`)

Normal monsters drop Stone `DropCapital0Min-Max` and roll `DropLibID` (all `ItemDropType 2`:
equipment plus 2 DebrisItem rows from 3000016 on). TaskBossNpc rows have no DropLibID.

| Scene | Normal monsters (id Lv HP Exp Stone)                                                                                                                          | DropLib | Task boss (id Lv HP)                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| 2601  | n33016 Tree Ent 17/199/72/12-14, n33015 Man-Eater 19/209/84/12-15, n32015 Longfeather Demon 21/285/96/12-15, n32020 Chevalier Demon 23/279/109/13-16          | 3000016 | n32005 Shadow Bat 25/760                               |
| 2605  | n33014 Ghost Granny 27/341/137, n33005 Green Frog 29/340/153, n33004 Imp 31/419/169, n32010 Masked Robber 33/410/187                                          | 3000026 | n32011 Demon Chuuji 30/977; n32008 Hongo Batai 35/1177 |
| 2602  | n33009 Lost Dog 32/410/178, n33025 Bun Monster 34/409/196, n32016 Ghostfaced Henchman 36/493/214, n32027 Ancient Isle Ninja 38/487/234                        | 3000031 | n32006 Ancient Isle Nightwatch 40/1447                 |
| 2603  | n33012 Immoral Monk 37/489/224, n32018 Mountain Boar Bandit 39/487/244, n33013 Demon Flute Succubus 41/550/264, n32023 Sunrise Brigand 43/545/286             | 3000036 | n32007 Flameplate Brigand 45/1617                      |
| 2604  | n33002 Vulture 42/546/275, n33003 Bloodbat 44/544/297, n33001 Egret 46/623/320, n32012 Forest Ninja 48/617/344                                                | 3000041 | n32022 Senyo of the Forest 50/1832                     |
| 2701  | n33033 Corpse Mouse 47/619/332, n33035 Furious Dog 49/616/356, n33028 Black Eagle 51/670/381, n32032 Skeleton Swordsman 53/665/407                            | 3000046 | n32021 Resentment 55/1974                              |
| 2702  | n33041 Demon Eye Demon 52/666/394, n33034 Roar Demon Ape 54/663/420, n33038 Degenerate Monk 56/733/448, n32036 Valley Bandit 58/725/476                       | 3000051 | n32019 The Righteous Thief 60/2162                     |
| 2703  | n33031 Swamp Poison Frog 57/728/462, n33042 Gloomy Tree 59/725/491, n33037 Noxious Kappa 61/799/521, n32031 Drowning 63/793/552                               | 3000056 | n32024 Venomfog Demon 65/2358                          |
| 2704  | n33043 Bloodthirsty Sunflower 62/794/536, n33029 Desert Vulture 64/792/568, n33040 Cunning Ghost Granny 66/866/600, n32038 Harsh Barrens Swordsman 68/858/634 | 3000061 | n32030 Gold Demonblade 70/2560                         |
| 2801  | n31041 Windwing Dragon 67/861/617, n31018 Earth Pterosaur 69/858/651, n31019 Spiralwind Dancer 71/940/686, n31020 Deer Swordsman 73/933/722                   | 3000066 | n31025 Toad Dragon 75/2777                             |
| 2802  | n31021 Ice Pterosaur 72/935/704, n31022 Thunderwing Dragon 74/932/740, n31023 Saki Uesugi 76/1006/778, n31024 Greedy Bandit 78/996/817                        | 3000071 | n31026 Double Headed Dragon 80/2975                    |
| 2803  | n31042 Gozu 81/1056/877, n31043 Nurari 83/1116/919, n31044 Samehada 85/1194/961, n31045 Little Isonade 87/1155/1005                                           | 3000076 | n31050 Nine-Headed Dragon 89/3200                      |
| 2804  | n31046 Huge Centipede 86/1188/983, n31047 Giant Ox 87/1221/1005, n31048 Giant Chameleon 88/1254/1027, n31049 Giant Bird 89/1280/1050                          | 3000081 | n31051 Inferno Dog 90/3400                             |

Stone ranges grow from 12-14 (2601) to 20-24 (28xx). n31042 also has `AppendDropLibID=8000073`,
which exists only in `FixedDropLib.ini`; `DropSystem.GetDropItems` only reads `DropLib.ini`
(`DropSystem.java:233-256`), so the original drops nothing extra. Ambiguous: keep that behaviour
or treat it as the fixed bundle (11 pills/scrolls).

### Task bosses (`TaskSystem.java:253`, `TaskRule/BossRule.java:80`)

- A TaskBossNpc is attackable only when one of the ids in its `TaskID` (`;`-separated, one per
  village chain plus branch quests) is accepted **or** completed; otherwise `FeedBack_Common_124`.
- Gated by a task that does not exist, so never attackable: n32025 (2303), n31025 (2801),
  n31026 (2802) → `99999`; n32030 (2704) → `30059`. n32024 lists the missing `30058` too, but its
  chain ids exist.
- SubTaskType 10 (boss): kill `TargetConfiger` in `SubmitSceneID` while holding `TargetItem`; on
  completion one `TargetItem` is removed (`BossRule.java:92`). Used in 2605 (n32011) and 2103
  (n32004). **Not supported by the server yet.**

### Timed ticket bosses (`RES/npc/RefresHeartNpc.ini`, `RefreshNpcSystem.java:122-176`, `AttackSystem.java:75`)

One TicketBossNpc per field, 24 rows (one per hour at a fixed minute), `liveMinutes 30`
(stored ×60 as seconds, line 236), date window `2010-7-6..2020-7-6`. Fighting consumes one
`AttackItemConfig` = **i150078** (from BossFactory explore cards); no ticket → `FeedBack_Common_091`.
In a team the fight is refused. The fight uses `LevelAttackRec` (`npcrecord.ini` → value 16): the
variant is picked by player level, `1-5 → n320140`, `6-10 → n320141` … `86-90 → n320157`.

| Scene | Boss                     | Minute | Scene | Boss                        | Minute |
| ----- | ------------------------ | ------ | ----- | --------------------------- | ------ |
| 2601  | n320140 Soulender        | :10    | 2702  | n310020 Firewing Dragon     | :45    |
| 2602  | n320310 Bereaver         | :50    | 2703  | n320190 Warfrenzy Demon     | :15    |
| 2603  | n310030 Frostwing Dragon | :05    | 2704  | n320170 Bloodboil Demon     | :55    |
| 2604  | n330040 Demonic Horror   | :30    | 2801  | n3102100 Bluewing Dragon    | :45    |
| 2605  | n310010 Fang Reaper      | :35    | 2802  | n3102200 Thorn Crown Dragon | :25    |
| 2701  | n320300 Soulblade Demon  | :25    | 2803  | n3102120 Isonade            | :00    |
|       |                          |        | 2804  | n3102140 Hanzo              | :40    |

21xx-25xx xx01/xx02/xx03 have the same pattern (minutes :00 / :40 / :20).

### Field NPCs

| NPC                                                                      | Scenes                  | Role                                           |
| ------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------- |
| n26001 Master Yuan, n26002 Feng                                          | 2601                    | main-chain hubs L16-25 (and later returns)     |
| n26007 Sentry, n26008 Priest, n26013 Matchmaker                          | 2605                    | chain L26-35 (Matchmaker: no chain task found) |
| n26003 Koki                                                              | 2602                    | chain L34-46                                   |
| n26004 Kabuki, n26005 Lord Toad                                          | 2603                    | chain L36-49                                   |
| n26006 Craftsman                                                         | 2604                    | chain L42-52                                   |
| n26009 Sorcerer, n26010 Bandit, n26011 Mountain Shaman, n26012 Swordsman | 2701-2704               | chain L52-69                                   |
| n28002 Adventurer, n28003 Aborigine, n28004 Fisherman, n28005 Tsunade    | 2801-2804               | chain L71-89                                   |
| n26100 … n28200, n27500, n27600 (13 ids, art N26100)                     | one per 26xx-28xx field | Stone Organization, `npc/TeamStoneNpc.js`      |

Stone Organization menu: team frame (captain only) and rest. Rest refills HP and MP for
`cost = -0.005*L² + 1.593*L + 61.72` Stone when `L > 10`, else free (`TeamStoneNpc.js:55, 85`);
the value is a double passed to `CanDecCapital`/`DecCapital` (rounding unknown: truncate is the
likely Java int conversion). Full HP and MP → `FeedBack_Common_130`. `lg_name_n26100` does not
exist in the language table; the menu title is `lg_UI_Title_n26100` "Stone Organization".

## Explore spots (`RES/role/RoleOutSearch.ini`)

Two per field: `<scene>1` normal (no key) and `<scene>2` Expert (needs one key item, `GostRate 0`
so it never gives fights). `RequireLevel` = scene level, `RequireStone 0`, `SearchCount -1`. Rates
(normal / Expert) are the same as 21xx: Gost 1000/0, Money 1000/1000, Baby 500/500, Boss 800/1000
(2803-2804 normal: 1000), Item 6000/7500, Game 0/0, Key 700/0.

| Spot (n / Expert) | Key (Expert) | Gost  | Boss  | Item  | Key | Baby | ExpBase n/E | StarUp n/E | Peek 1st n/E | MoneyRule |
| ----------------- | ------------ | ----- | ----- | ----- | --- | ---- | ----------- | ---------- | ------------ | --------- |
| 26011 / 26012     | i150061      | 7/8   | 31/32 | 11/30 | 16  | 10   | 330/330     | 5/6        | 330/660      | 1058      |
| 26051 / 26052     | i150065      | 15/16 | 39/40 | 12/31 | 20  | 10   | 480/480     | 6/7        | 609/1218     | 1220      |
| 26021 / 26022     | i150062      | 9/10  | 33/34 | 13/32 | 17  | 10   | 845/845     | 8/10       | 774/1548     | 1291      |
| 26031 / 26032     | i150063      | 11/12 | 35/36 | 14/33 | 18  | 11   | 1320/1320   | 11/12      | 815/1630     | 1358      |
| 26041 / 26042     | i150064      | 13/14 | 37/38 | 15/34 | 19  | 11   | 1905/1905   | 13/14      | 852/1704     | 1421      |
| 27011 / 27012     | i150066      | 17/18 | 41/42 | 16/35 | 21  | 11   | 1600/1720   | 12/13      | 888/1776     | 1481      |
| 27021 / 27022     | i150067      | 19/20 | 43/44 | 17/36 | 22  | 12   | 1905/2100   | 13/14      | 923/1846     | 1539      |
| 27031 / 27032     | i150068      | 21/22 | 45/46 | 18/36 | 23  | 12   | 2240/2380   | 15/15      | 956/1912     | 1594      |
| 27041 / 27042     | i150069      | 23/24 | 47/48 | 19/37 | 24  | 12   | 2605/2840   | 16/17      | 988/1976     | 1647      |
| 28011 / 28012     | i155070      | 25/26 | 49/50 | 19/37 | 25  | 12   | 2990/5980   | 18/19      | 1062/2124    | 1699      |
| 28021 / 28022     | i155071      | 27/28 | 51/52 | 38/39 | 26  | 12   | 3362/6724   | 20/21      | 1093/2186    | 1749      |
| 28031 / 28032     | i155072      | 29/29 | 53/54 | 40/41 | 27  | 12   | 8999/9999   | 22/23      | 1200/2260    | 1799/1849 |
| 28041 / 28042     | i155073      | 30/30 | 55/56 | 42/43 | 28  | 12   | 10999/11999 | 24/25      | 1300/2360    | 1899/1949 |

Peeks: `CanLookCount 3`; 2nd-5th peek Gold 2/7/11/4 (normal) and 4/10/16/6 (Expert) everywhere.
Odd ExpBase steps (2701 normal 1600 < 2604 1905; 2803/2804 jump to 8999+) are in the source.
Spot names: `lg_OutSearch_<id>` (27011 is just "Abandoned Evernight City").

### Gost (fight) factories (`RES/role/GostFactory.ini`)

Each normal spot's GostFactory lists 3 explore-only variants (`n<monster>1`, Exp ×3 of the base,
no DropLibID, same `ResourceID` as the base monster; Expert variants `…2` have Exp ×5):
7: n330161, n330051, n320151 · 9: n330251, n330091, n320161 · 11: n330121, n330131 ·
13: n330011, n330021, n330031 · 15: n330151, n330141, n320101 · 17: n330331, n330351, n330281 ·
19: n330341, n330381, n320361 · 21: n330421, n330371, n320311 · 23: n330431, n330291, n330401 ·
25: n320381, n310413, n310181 · 27: n310191, n310201, n310213 · 29: n310251, n310261, n310271 ·
30: n310281, n310291, n310301.

**Factories 18, 20, 22, 24, 26, 28 are really absent from the backup**, not an import gap: every
copy of `GostFactory.ini` (`app`, `app-tmp`, `op/update`, the `复件 Resource` copies; 74 lines
each) and the `GostFactory` sheet of `Excle/Role/RoleOutSearch.xlsx` end the same way. They are
referenced only by Expert spots 27012, 27022, 27032, 27042, 28012, 28022, whose `GostRate` is 0,
so `RandSearchAction` never picks them (`OutSearchSystem.java:959`); `SearchGost` returns null for
a missing id (line 763). No gameplay effect. All Boss (1-56), Item (1-43), Key (1-28) and
Baby (10-12) factory ids used by 26xx-28xx exist and their items exist.

## Quests in 26xx-28xx (`RES/task/Task.ini`, `SubTask.ini`)

1,071 tasks accept, submit or have a subtask in 26xx-28xx: 720 main (type 1), 284 daily (2),
63 branch (3), 4 lead (5). Subtask types: talk 426, kill 405, collect 254, boss 10, compete-rank 3.
Main chains are mirrored per village: Fire 10xxx, Water 12xxx, Lightning 14xxx, Wind 16xxx,
Earth 18xxx with the same suffix (task-boss `TaskID` lists confirm the mirror).

### Fire main chain through the neutral zone (10025-10193)

| Tasks       | Level | Hubs                                                                | Kills / bosses (scene)                                                                                      |
| ----------- | ----- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 10025-10045 | 16-25 | n26001/n26002 @2601, n16001/n16005 @161                             | n33016, n32015, n32020 (2601); n33011 (2102); boss n32005                                                   |
| 10046-10068 | 26-35 | n26007/n26008 @2605, n16001 @161, n26003 @2602                      | n33014, n33004 (2605); type-10 n32011 (2605), n32004 (2103); boss n32008                                    |
| 10069-10100 | 36-50 | n26004/n26005 @2603, n26003 @2602, n26006 @2604                     | n32016, n32027, n32023, n33013, n33002, n33003, n32012; bosses n32006, n32007, n32017 (2103), n32009 (2403) |
| 10101-10121 | 51-60 | n26006 @2604, n26009 @2701, n26010 @2702, n26011 @2703, n16003 @161 | n33033, n32032, n33031; bosses n32022, n32021, n32026 (2203)                                                |
| 10122-10141 | 61-70 | n26011 @2703, n26012 @2704, n26010 @2702, n26009 @2701, n16012 @161 | n33042, n32036, n33040, n32038, n33037, n32031; bosses n32019, n32024, n32029 (2503)                        |
| 10142-10149 | 71-74 | n28002 @2801, n28003 @2802                                          | n31019 (2801); collect from n31041                                                                          |
| 10162-10177 | 80-84 | n11001 @111 ↔ n28004 @2803                                          | n31042-n31045; boss n31050                                                                                  |
| 10178-10193 | 85-89 | n11001 @111 ↔ n28005 @2804                                          | n31046-n31049; boss n31051; 10193 has `NextTaskID 0` (end)                                                  |

- **Gap:** 10149 (L74) jumps to 10162 (L80); 10150-10161 do not exist (same in every village).
  2802 has only 2 main tasks per village and its boss n31026 is never attackable.
- Rewards grow from `0,1151` Stone / 2,806 EXP (10025) to `0,31002;3,95` (Stone + 95 Gift
  Coupons) / 163,732 EXP (10192). Gift Coupons (`3,N`) appear from 10055.
- Daily tasks (type 2) per field: 26001-26020 and 26101-26112, 26201-26207, `216xxxx`, `217xxxx`,
  `226xxxx`, `227xxxx`, `236xxxx` (graded dailies; need `DayTaskSystem`, not in M2).
- Branch (type 3): 30051-30057 (task-boss quests), 37601-37628 (26xx), 37646-37673 (2803-2804).
- `RES/task/TaskMonsterDrop.ini` rows: 2601 18, 2602 18, 2603 27, 2604 19, 2605 19, 2701 20,
  2702 20, 2703 12, 2704 22, 2801 13, 2802 4, 2803 12, 2804 16.

## 21xx-25xx beyond xx01

xx02 / xx03 are identical across villages except the xx03 fourth monster and extra bosses.
xx04 is a Christmas map (`world.md`).

| Scenes    | Level | Monsters                                                                                                                             | Task bosses                                                                                       | Spots   | Quests touching |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------- | --------------- |
| x102 (×5) | 11    | n33018 Potato 12, n33008 Monkey 14, n33027 Riceball Monster 16, n33011 Kappa 18                                                      | n32003 Bullhead Demon 20                                                                          | x1021/2 | 45 each         |
| x103 (×5) | 21    | n33019 Corn 22, n33007 Digrat 24, n33010 Banshee 26, + n3302x Lv28 (2103 n33020, 2203 n33021, 2303 n33023, 2403 n33024, 2503 n33022) | n32004 35; 2103 n32017 40, 2203 n32026 60, 2403 n32009 50, 2503 n32029 70, 2303 n32025 80 (never) | x1031/2 | 35-55           |
| x104 (×5) | -1    | SnowNpc n31027 Evil Merchant 10, n31028 Mooncake Thief 10; TicketBoss n32057x1                                                       | none                                                                                              | none    | 0               |

Field NPCs: n21003-n25003 (art N21003) in xx02 and n21004-n25004 (art N21004) in xx03.

## Data vs missing

| Area                                                                                                                                       | State                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenes, links, switch rules, NPC placement, timed NPCs, npcs, npc records, explore spots and factories, tasks, subtasks, task drops, drops | imported (`server/data/game`)                                                                                                                                                                            |
| `ExceptTaskScene.ini`                                                                                                                      | **not imported**; needed for cross-village main-chain steps                                                                                                                                              |
| `DT/levelsceneid` band                                                                                                                     | not imported (client hint only)                                                                                                                                                                          |
| Server rules                                                                                                                               | missing: subtask type 10, ticket bosses (`AttackItemConfig`, `LevelAttackRec`, schedule), Stone Organization rest, task-boss gate check by `TaskID`, daily tasks; `sceneMonsters` excludes TicketBossNpc |
| Translation                                                                                                                                | all names translated (`en.json`); none of the 26xx-28xx strings are hand-reviewed (M2 reviewed the slice only)                                                                                           |
| Gost factories 18-28 (even)                                                                                                                | absent in every backup copy; unused (Expert `GostRate 0`)                                                                                                                                                |

### Asset export list (input for the export task)

Exported today: scenes 111-151 and 2101-2501; monster art N33017, N33006, N33026, N32001, N32002,
N932018; NPC art of those scenes. Checked against the backup with `motionsourcelist`
(`<key>_Motion_999`), `iconsourcelist` and the folders the exporter reads
(`MC/scene/outcity`, `MC/ui/fightbg`, `MC/npc`):

- **Scenes (23):** 2102, 2103, 2202, 2203, 2302, 2303, 2402, 2403, 2502, 2503, 2601-2605,
  2701-2704, 2801-2804: background, element and fight background all present (2202/2302/2303 also
  `backgroundeffect`; 2203/2402/2403/2502/2503/2202/2302/2303 `skybox`). 2104 has a background and
  fight background only; **2204, 2304, 2404, 2504 have no scene SWFs** (skip the Christmas maps).
- **Monster art (104 keys, all with motion SWFs):** N31001-N31003, N31007-N31011, N31013-N31016,
  N31018, N31020-N31022, N3102120, N31027, N31028, N31032, N31042-N31051, N32003-N32012,
  N32015-N32027, N32029-N32032, N32035, N32036, N32038, N32048, N32057, N33001-N33005,
  N33007-N33016, N33018-N33025, N33027-N33029, N33031, N33033-N33035, N33037, N33038,
  N33040-N33043, N932014, N932017, N932019, N932025, N932030, N932031 (the list keys come from
  `ResourceID.slice(12)`; explore variants reuse their base monster's key, so no client-side
  variant mapping is needed). N3102120 and N31032 (ticket bosses) have no `MapUserFace_` list
  icon; use `UserFace_`.
- **NPC art (21):** N21003, N21004, N26001-N26013, N27001, N27002, N28002-N28005: stand SWF and
  `NpcBackPhoto_` present. **N26100 (Stone Organization) has no stand SWF**, only the photo.

## Open questions

1. Ticket bosses: the original window ends 2020-07-06, so a literal port never spawns them. Ignore
   the dates, or keep the system off?
2. Never-attackable task bosses (n32025, n31025, n31026, n32030): keep them listed but locked, or
   hide them?
3. The level 75-79 main-chain gap: leave it (players grind or do dailies) or fill it in M5?
4. n31042 `AppendDropLibID 8000073`: keep the original (no extra drop) or grant the fixed bundle?
5. Stone Organization rest cost rounding (truncate vs round) and how to draw it without stand art.
6. Christmas maps xx04: skip in M3 (no art for 2204-2504)?
