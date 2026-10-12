# Original data: toll gates and travel

Reference for milestone 3: travel into the neutral zones (26xx-28xx, Angel City 161, Demon City 171) and the instanced fights reached from Demon City. RES = `app/code/props/serv/game/Resource`,
J = decompiled server (`service/com/d2/serv/game`), P = decompiled domain server
(`service/com/d2/serv/pubdata`), C = decompiled client scripts, DT = `apache/source/binary/datatable`.
Scene, rule and link basics are in `world.md`; this file adds what M3 needs.

## 1. Travel

### Two travel paths, two rule sets

| Path                                     | Client                                                                 | Server checks                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene exits (`scenequeue.ini` links)     | scene exit buttons, sends an index into the compacted link list        | `SceneSystem.OnCustomSwitchScene` (J/SceneModule/SceneSystem.java:240-258) → `CanSwitchScene` only                                                   |
| World map (`sceneswitchrule.ini` target) | `C/GameUI/Map/WorldMap/WorldMapFrame.as:131-143` (`scene_<id>` button) | `SceneSwitchRuleSystem.CanChangeScene` (J/SceneModule/SceneSwitchRuleSystem.java:124-151) = `CanSwitchScene` + `RequireLevel` + optional travel cost |

`CanSwitchScene` (SceneSystem.java:260-306), in order: not in an auto action or fight state
(`State != 0` → `FeedBack_Common_001`), single gate auto lock (see 3.4), target in `logicscene.ini`,
`IsStart == 1` (else `FeedBack_Common_161`), `Level` (else `FeedBack_Common_005`), `Nation`
(else `FeedBack_Common_004`, unless `ExceptTaskScene.ini` allows it through an active quest), and not
exploring (`OutSearching != 1`).

`CanChangeScene` adds: target needs a `sceneswitchrule.ini` section (missing → silent refusal);
`RequireLevel` (`FeedBack_Common_005`); a cost only when the **current** scene is a key in the
target section (`TransCostMap.get(oldsceneid)`, line 141). A missing key means **free, not
forbidden**. Values `0` and `-1` are skipped when loading (line 172); a single number means Stone
(type 0, lines 175-177). All keys in the data are `0,0` or `-1`, so travel is free everywhere.
Team: only the captain may use the world map and pays `cost × members` (lines 54-71); the client
refuses map clicks in a team (`Common_OperateFailInTeam`, WorldMapFrame.as:133-137).

> **Gap in our server.** `POST /api/game/travel` (`server/src/modules/game/actions.ts:359-366`)
> refuses unless the current scene is a key of the target's rule. No section lists 26xx-28xx,
> 2104-2504, 3101, 3102 or 5001 as keys (`scene-switch-rules.json`, every section has the same 22
> keys: villages, 161, 171 and xx01-xx03), so a player in 2601 can travel nowhere. M3 must split
> the endpoint into "link travel" (CanSwitchScene) and "map travel" (CanChangeScene, missing key =
> free) as above.

### Neutral scenes (`RES/scene/logicscene.ini` lines 67-519, DT/levelsceneid.s26804.tab rows 0-12)

All: `Nation=-1` (any village), `IsStart=1`, `CanRelive=1`, `CanEnemy=1`, `ToScene=0` unless noted.
Fields 26xx-28xx have `CanTeam=1` (the only fields where teams may form); villages and 21xx-25xx
have `CanTeam=0`. `RequireLevel` in `sceneswitchrule.ini` equals `Level` for every scene.

| Scene | English name (`lg_Scene_BackGround_<id>`) | ini line | Type | Level | levelsceneid band | Map button | Notes                                                            |
| ----- | ----------------------------------------- | -------- | ---- | ----- | ----------------- | ---------- | ---------------------------------------------------------------- |
| 161   | Angel City                                | 67       | 3    | 11    | -                 | yes        | `ToScene=2601`; scenepos type `MainCity`                         |
| 171   | Demon City                                | 80       | 3    | 11    | -                 | yes        | scenepos type `MagicCity`                                        |
| 2601  | Crossroads                                | 353      | 1    | 16    | 16-25             | yes        | hub to the five xx02 fields                                      |
| 2602  | Dawning Wilds                             | 366      | 1    | 31    | 31-35             | yes        |                                                                  |
| 2603  | Sun Village                               | 379      | 1    | 36    | 36-40             | yes        |                                                                  |
| 2604  | Glowing Forest                            | 392      | 1    | 41    | 41-45             | yes        |                                                                  |
| 2605  | Eerie Passage                             | 405      | 1    | 26    | 26-30             | yes        | ordered before 2602 by level                                     |
| 2701  | Abandoned Evernight City                  | 418      | 1    | 46    | 46-50             | yes        |                                                                  |
| 2702  | Soulshatter Valley                        | 431      | 1    | 51    | 51-55             | yes        |                                                                  |
| 2703  | Marsh of Death                            | 444      | 1    | 56    | 56-60             | yes        |                                                                  |
| 2704  | Plains of Despair                         | 457      | 1    | 61    | 61-65             | yes        |                                                                  |
| 2801  | Dragontame Valley                         | 470      | 1    | 66    | 66-70             | yes        |                                                                  |
| 2802  | Dragontame Forest                         | 483      | 1    | 71    | 71-80             | yes        |                                                                  |
| 2803  | Dragontame Coast                          | 496      | 1    | 81    | 81-85             | yes        |                                                                  |
| 2804  | Hidden Rain Village                       | 509      | 1    | 86    | 86-90             | **no**     | reachable only through 2803's link                               |
| 3101  | Secret Demon Tunnel (Las Noches)          | 535      | 1    | -1    | -                 | no         | `ToScene=171`, scenepos `MsgScene`; no switch rule (NPC entry)   |
| 3102  | Valhalla (toll gate lobby)                | 548      | 1    | -1    | -                 | no         | `ToScene=171`, `CanTeam=3`, scenepos `TollGate`; NPC entry only  |
| 5001  | toll gate instance                        | 574      | 2    | -1    | -                 | no         | `CanTeamSwitchTo=1`; scenepos `TollClone`; ids 100000-100038 too |

`levelsceneid.tab` is the client's level hint and matches `Level` exactly. World map tooltips
(`lg_Tip_WorldMap_<scene>_<nation>`) list entry level, zone monsters and zone boss per field.
2805 has only a tooltip ("Not yet open"), no scene.

### Scene links (`RES/scene/scenequeue.ini`, `r=` 15 slots)

| From                | Line   | Slots used → target                                      |
| ------------------- | ------ | -------------------------------------------------------- |
| 111/121/131/141/151 | 3-15   | 10 → 171                                                 |
| 161                 | 18     | 10 → 2605                                                |
| 171                 | 21     | none                                                     |
| xx02 (2102 … 2502)  | 27…75  | 0 → xx01, 5 → xx03, 10 → 2601                            |
| 2601                | 84     | 0 → 2604, 5 → 2602, 10-14 → 2102, 2202, 2502, 2402, 2302 |
| 2602 / 2603 / 2604  | 87-93  | ring 2601 → 2602 → 2603 → 2604 → 2601 (both ways)        |
| 2605                | 96     | 0 → 2704, 5 → 2701                                       |
| 2701-2704           | 99-108 | ring 2605 → 2701 → 2702 → 2703 → 2704 → 2605 (both ways) |
| 2801                | 111    | 0 → 2704, 5 → 2802                                       |
| 2802                | 114    | 0 → 2801 only                                            |
| 2803                | 117    | 0 → 2802, 5 → 2804                                       |
| 2804                | 120    | 0 → 2803 only                                            |

Links are not symmetric: 2704 has no exit to 2801 and 2802 none to 2803, so 2801 and 2803 are
entered from the world map. 2601's exits to the five xx02 fields still pass the `Nation` check,
so each player can only take the exit to their own village's field.

### Go home / go out (SceneSystem.java:193-238)

"Village" (`GoHome`) and "Go out" both use the current scene's `ToScene` when it is > 0, else the
nation's `castle` / `field` from `nationscene.ini`. In a team, going home is refused
(`Team_Err_ForceEntryTollGateScene`, line 156-162).

Ambiguity: Angel City has `ToScene=2601`, so "Village" in 161 lands in Crossroads, not the home
village. Candidates: (a) faithful quirk, port as is; (b) the field was meant only for "Go out", and
"Village" should use the castle. Recommend (a) and note it in the UI tooltip.

### Visited scenes and the world map

- Every scene switch appends the target to the player string `ScenesEntered`
  (`SetScenePass`, SceneSystem.java:354-369).
- The original `UI_WorldMap.swf` (BaseSource v0.3.21.0.2) has `scene_<id>` buttons and `face_<id>`
  tooltip anchors for 111-151, 161, 171, 2101-2503, 2601-2605, 2701-2704, 2801-2803 and **181**
  (no such scene in `logicscene.ini`; clicking it fails the switch-rule lookup).
- `refreshMap` (WorldMapFrame.as:172-211) sets a button's `alpha` to 0 when the scene is not in
  `ScenesEntered`, 1 otherwise. The server never checks `ScenesEntered`.
  Ambiguity: a Flash `SimpleButton` with alpha 0 still receives clicks, so (a) unvisited places are
  invisible but still travelable, or (b) the intent was visited-only travel. Recommend (b) for the
  UI (draw unvisited places dimmed and not clickable) while the server keeps the original rules.
- **Gap:** `client/src/generated/game-world-map.json` has only 10 locations (villages and xx01).
  The exporter (`tools/assets/extra.ts` `mapLocations`) misses the other 23 buttons; re-export.

### Angel City (161) and Demon City (171)

Tooltips: Angel City "The city of master ninja", Demon City "Break through and take down the evil
Demon!" (`lg_Tip_WorldMap_161_*`, `_171_*`). Both admit every nation from level 11; no city is tied
to a nation in the data (`Nation=-1`). They are not PvP-free (`CanEnemy=1`, unlike villages).

| City | NPC (`RefresNpc.ini`) | BuildType  | Script                                      | English name            | Building clip (`scenecitybuild.s30008.tab`) |
| ---- | --------------------- | ---------- | ------------------------------------------- | ----------------------- | ------------------------------------------- |
| 161  | n16001                | 1          | npc/hallNpc.js                              | Ninja Chief in the Hall | clip_hall                                   |
| 161  | n16002                | 2          | npc/arenaNpc.js                             | Arena Master            | clip_arena                                  |
| 161  | n16003                | 3          | npc/foundryNpc.js                           | Blacksmith              | clip_foundry                                |
| 161  | n16004                | 4          | npc/pharmacyNpc.js                          | Wholesale Boss          | - (no clip row)                             |
| 161  | n16005                | 5          | npc/equipNpc.js                             | Angel City Merchant     | clip_equip                                  |
| 161  | n16006                | 6          | npc/TradeNpc.js                             | Market Clerk            | clip_salve                                  |
| 161  | n16007                | 11         | npc/magicNpc.js                             | Mysterious Merchant     | -                                           |
| 161  | n16012                | 7          | npc/HotelNpc.js                             | Yimoji at the Inn       | clip_pet                                    |
| 161  | n16013                | 13         | npc/DailyTaskNpc.js                         | (unnamed)               | clip_reward                                 |
| 161  | n16014                | 8          | npc/blackshop.js                            | (unnamed)               | -                                           |
| 161  | n16015                | 9          | npc/turncardnpc.js                          | (unnamed)               | -                                           |
| 161  | n16016                | 14         | npc/DiceNpc.js                              | Fortune Gambler         | clip_RandPot                                |
| 171  | n17001                | 20         | npc/EntryTollGateScene.js                   | Demon City Guard        | clip_nation                                 |
| 171  | n17003                | 21         | npc/SingleGateEntryNpc.js                   | Kisuke Urahara          | clip_middle                                 |
| 171  | n17004/5/6/7/14       | 4/5/3/11/8 | pharmacy, equip, foundry, magic, black shop | names reuse n1600x keys | -                                           |

Clip ↔ NPC is by `BuildType` (world.md). Ambiguity: buildings without a clip row (161 pharmacy,
mystic, black shop, turn card; all of 171 except the two gates) have no clickable picture.
Candidates: (a) reachable only from the NPC list / quick menu; (b) the clips exist in the town SWF
under other names. Check the 161/171 scene SWFs in the export task before building UI.

## 2. Energy (needed by pub fights; also by plain monster fights)

`RoleModule/EnergySystem.java`: `MaxEnergy = 200` (line 75); once per day the first check adds 100
(+30 for VIP) capped at max (lines 51-71). `Fight.DecEnergy` defaults to 1 (J/Public/Fight.java:71);
after a won player-vs-NPC fight the server sends the last target's config with that flag
(FightSystem.java:561-570) and `MonsterDropSystem.OnPlayerKillVirtualNpc` (DropModule, lines
153-200) **gives no Stone, EXP or drops when the flag is 1 and 1 energy cannot be paid** (line 160,
Christmas scenes exempt). Toll gate, single gate and pub fight monsters set `DecEnergy = 0`.
M2 does not model energy; this is an open question for the plan (see below).

## 3. Demon City content

### 3.1 Toll gates (Valhalla, team or solo instances)

Entry chain: Demon City Guard n17001 (`EntryTollGateScene.js`) → menu "Enter (today's tries N)"
→ lobby 3102 → pick a gate (client `UI_TollGateSelect`) → instance 5001.

Files (`RES/scene/clonescene/`): `TollGate.ini` (21 gates), `SubTollGate.ini` (72 "beachheads"),
`FightMonsterPoint.ini` (360 points), `MonsterGroup.ini` (360 groups of 3 NPCs),
`TollGateLobbyScene.ini`, `TollgateCloneScene.ini`, `TollGatePropConfig.ini`, `CaptianMul.ini`,
`Rank{Exp,Item,Money}Reward.ini` (50 ranks), `TGCardConfig.ini`, `TGCardDropId.ini`,
`TGCardDropLib.ini` (586 rows), `ExchangeMagicBox.ini` (80 rows). Loader
`J/CloneSceneModule/TollGateSystem.java`. Client mirror DT/tollgate.s28263.tab (adds `Hard`,
`BossName`, `PassCondition`, `TollGateTips`, card prices; server values win).

#### Structure

`TollGate` → ordered `SubTollGate` (`Seq`, `NextFightPoint` = next sub gate id, 0 = last) → 5
`FightMonsterPoint` each (`Seq` 0-4, `NextMonsterGroupID`, `PreMonsterGroupID`) → `MonsterGroup`
id = point id with `MonsterConfig1..3`. `FightMonsterPointCoount` = number of sub gates,
`MonsterGroupCount` = 5 × that.

| Gate          | Name (`lg_TollGate_*`)  | Tier (tab `Hard`) | Level | Sub gates | Item                   | Team | Rank | Clear exp / Stone     | Card drop |
| ------------- | ----------------------- | ----------------- | ----- | --------- | ---------------------- | ---- | ---- | --------------------- | --------- |
| 100000        | Decadent Nest\*         | tutorial          | 11-20 | 1         | -                      | 0    | 0    | 0 / 0                 | 1000      |
| 100001        | Valhalla Camp           | 1 (hard)          | 16-25 | 2         | -                      | 2    | 1    | 500 / 2800            | 1001      |
| 100002        | Endless Sea Forests     | 1                 | 26-35 | 3         | -                      | 2    | 1    | 1000 / 3200           | 1002      |
| 100003        | Crimson Grassland       | 1                 | 36-45 | 4         | -                      | 2    | 1    | 2000 / 3500           | 1003      |
| 100004        | Deadwood Villa          | 1                 | 46-55 | 4         | -                      | 2    | 1    | 3000 / 3800           | 1004      |
| 100005        | Night of Valhalla       | 1                 | 56-65 | 4         | -                      | 2    | 1    | 4000 / 4000           | 1005      |
| 100006        | Windstorm Desert        | 1                 | 66-75 | 4         | -                      | 2    | 1    | 5000 / 4300           | 1006      |
| 100007        | Desperate Forest\*      | 1                 | 76-85 | 3         | -                      | 2    | 1    | 6500 / 4500           | 1007      |
| 100008        | The Lost Realm\*        | 1                 | 86-95 | 4         | -                      | 2    | 1    | 8000 / 4700           | 1008      |
| 100021-100028 | same names as 100001-08 | 2 (normal)        | same  | same      | -                      | 2    | 0    | 750/1400 … 11900/2350 | 1021-1028 |
| 100035-100038 | as 100005-08            | 3 (pass)          | 56-95 | 4/4/3/4   | i152000-3 (Abyss Pass) | 2    | 0    | as 100005-08          | 1035-1038 |

\* `TollGateName` points at a neighbouring key: 100000 → `TollGate_100007`, 100007 →
`TollGate_100008`, 100008 → `TollGate_100009` (TollGate.ini lines 2, 149, 170). The 100021-28 rows
reuse 100001-08 names and sub gate names. All gates: `UseEntryTimes=1`, `UseEnergy=0`,
`StartEntryTime=0`, `EndEntryTime=24`, `RewardItem=0`, `RewardEngry=0`.

#### Entry rules

| Check                  | Rule                                                                                                                | Source (TollGateSystem.java) |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Lobby daily count      | `EntryTollGateSceneTimes < EntryTollGateMaxTimes` (3, `TollGatePropConfig.ini`), reset at local midnight            | 243-254; script lines 11-17  |
| Lobby level            | `RequirLevel = 11` (`TollGateLobbyScene.ini [3102]`)                                                                | 259-265                      |
| Lobby team             | must **not** be in a team to enter the lobby (teams form inside, `CanTeam=3`)                                       | 266                          |
| Gate level             | `Level >= RequirMinLevel`; `RequirMaxLevel` only checked for offline team members (428) and for ranking (1058-1090) | 324-326                      |
| Item                   | `RequireItemConfig` in bag (≥ 1); one is consumed on entry                                                          | 328-330, 470                 |
| Weapon                 | an equipped weapon (`TollGate_SelfNECNoWeapon`)                                                                     | 331-334                      |
| HP                     | `HP > 0` and `HP / MaxHP > 0.9`                                                                                     | 335-344                      |
| Entries                | `EntryTollGateSceneTimes + UseEntryTimes <= 3`; +1 on entry                                                         | 344-347, 1033-1036, 465      |
| Team rule `RequirTeam` | 0 = must be solo, 1 = must be in a team, 2 = either                                                                 | `CheckTeam` 292-297          |
| Team entry             | captain enters for all; every online member must pass the checks above                                              | 418-447, 477-492             |

`EntryTimesPerDay=10` in `TollGateLobbyScene.ini` / `TollgateCloneScene.ini` and `RequirMinEnergy`
are loaded but never used. Ambiguity: the lobby is charged nothing, entering a gate costs one of
the 3 daily tries; the guard's menu shows `3 - EntryTollGateSceneTimes`.

#### Fighting

- Points are fought strictly in order: the requested point must equal the current point, the run
  must not be in the lost state, and it must not be the point just passed (542-556). Client:
  `TollGateFightMenu.as` (`CLENT_CUSTOMMGS_FIGHTMONSTERPOINT`), `BeachheadFightFrame.as` shows
  "boss / reward / point n/5".
- One fight = player (or team in `GetMemberBySeq` order) vs the 3 group NPCs as sequential duels
  (battle.md), reason 4 (681-688). HP/MP carry over.
- Win: restore `MaxHP × RestoreHP / 100` HP and `MaxMP × RestoreMP / 100` MP, capped
  (`RestoreHP=20`, `RestoreMP=40`; code defaults 10/10, lines 83-84, 1551-1569). The client text
  `lang_TollGateLimit` says 20% HP and **50%** chakra and "no medicine or food" (no server check
  found). Then advance; after the last point of a sub gate pay its `RewardExp` / `RewardMoney`
  (`SubTollGate.ini`), after the last sub gate also the gate's (`RewardTollGate` 1147-1156).
- Reward formulas: money `value + captainBonus` (captain only, `CaptianMul.ini` by online team
  size: 2 → +0%, 3 → +50% money / +100% EXP; RewardMoney 1345-1366, CaptianExpMul 1383-1400); EXP
  `value + captainBonus + (VIP ? value*30/100 : 0)` (RewardExp 1421-1434). `RewardHono` is loaded
  for gates, sub gates and points but never paid.
- Monster kills also pay the **last** NPC of each group through `OnPlayerKillVirtualNpc` (Stone,
  coupons, `NpcExp`, `DropLibID`; energy free). In the data only sub-gate bosses have drops
  (e.g. n301253 `DropLibID=1000101`); group NPCs have no `NpcExp`.
- Loss: `FightMonsterPointState = 0`, HP = 1 (788-811). When the replay ends the client sends
  317; the run ends (`OnAfterTollGateLost` → go home; team disbanded) (909). No retry; the entry is
  spent.
- Leaving (`OnCustomExitTollGate`) or logging out ends the run the same way (1459-1466, 148-162).
- Clear: message `TollGate_PassSuccess`, then the card flip (3.2), then home. Home from 5001 is the
  nation's village (`ToScene=0`).

#### Progress score and weekly ranking (gates with `IsExistsRank=1`)

`schedule% = (int)((subSeq*5 + pointSeq + 1) / MonsterGroupCount * 100)` of the last passed point
(1436-1457). Sent once per run when the player (all team members) is within `RequirMinLevel..
RequirMaxLevel` (1058-1090). Domain server `P/TollGate/TollGateServer.java`: keeps the top 50 per
gate sorted by schedule (ties keep the earlier time, 106-177), shows the top 10 (`ShowRankPlayerNum`)
plus the player's own row (210-240); on the first message of a new week-of-year the current table
becomes "last week" and is cleared (242-281). Last week's row `i` claims rank `i+1` once:
`RankExpReward`, `RankMoneyReward` (Stone), `RankItemReward` (all `0`) for that gate
(`OnCommandRewardRank` 1571-1585). Example rank 1: 100001 6000 EXP / 16908 Stone.

### 3.2 Card flip after a clear (`J/CloneSceneModule/TGCardSystem.java`)

| Step          | Rule                                                                                                                        | Lines                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Deal          | 5 cards, each an independent weighted roll (`Probability` weights) from `TGCardDropLib` rows with `ID = DropId` of the gate | 70-97, 395-423            |
| Show all      | optional, costs `ShowAllCap = 10` Gold or Gift Coupon (type 2 or 3) → state 2, cards revealed                               | 99-137                    |
| Shuffle       | from state 2: swaps each slot with a random slot → state 3 (face down)                                                      | 139-166                   |
| Re-deal       | `ExchangeCap = 5` Gold/Coupon: new 5 cards, back to state 1                                                                 | 168-212                   |
| Peek one card | n-th peek costs `LookCap(n-1)` (n = 1..5); in state 3 cost `+ cost*LookAddMul/100` (int); Gold or Coupon                    | 214-269, 385-393, 425-430 |
| Take          | the chosen card is granted with its `BindingStatus`; full bag = nothing                                                     | 271-311, 338-381          |
| Disconnect    | a random card is granted                                                                                                    | 324-336                   |

Example 100001: `LookCap0..4 = 15, 23, 34, 51, 76`, `LookAddMul=138` → first peek after shuffle
costs `(int)(15 + 15*138*0.01) = 35`. Taking is allowed in any state after the deal, so a free
blind pick is possible: the deal message (custom 235) carries no items, and the server reveals
cards only on "show all" (236) or a peek (237). Ambiguity: the client may still animate the deal
face up; check the card window SWF before building the UI.

### 3.3 Crystal exchange (`ExchangeMagicBox.ini`, guard menu "Convert Tool")

Row: `SrcItemCfg` × `SrcCount` (crystals from toll gates, e.g. i152010 "Level 56 Valhalla
Crystal") → `DestItemCfg` × `DestCount`; `CommonSrcItemCfg` (i152015 "Common Valhalla Crystal")
may replace any part of `SrcCount` (TollGateSystem.java:1673-1726). Destinations: dragon egg stones
i491xxx, skill books i180035-i180046. Full bag refuses.

### 3.4 Las Noches (single gate, solo floors)

Entry: Kisuke Urahara n17003 (`SingleGateEntryNpc.js`) in 171 → scene 3101. Files
`RES/scene/singlegate/SingleGateConfig.ini`, `SingleGateInfo.ini` (170 floors: `[i] npc, exp`),
`SingleFloorCfg.ini`; loader `J/CloneSceneModule/SingleGateSystem.java` (lines 813-882).
Floor NPCs n900001-n900170 (Lv 1-100) are in `npcs.json`; DT/singlegatenpc.tab has different
stats (n900001 HP 40 vs 124 in npc.ini; server wins). Boss dialogs: DT/stollgatebossinfo (floors
20, 30, …).

| Rule                 | Value / formula                                                                                                                                                    | Source                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Level                | ≥ 13                                                                                                                                                               | SingleGateEntryNpc.js:4, 20        |
| Runs per day         | `MaxEntryCnt = 3` (count `SGateCount`, reset at midnight); a run is counted when it ends                                                                           | Config.ini:5; System 745-771       |
| Start at floor 1     | 1000 Stone (`SingleFloorCfg [0]` type 0 value 1000)                                                                                                                | 357-397                            |
| Start at 50%         | floor `(int)(0.5 * bestFloor)`, Stone `(int)(27.03*(floor-1) + 1000)`                                                                                              | 365-371 (`EntryParam0`)            |
| Start at 96.7% (VIP) | floor `(int)(0.967 * bestFloor)`, Gold `max(1, (int)(0.4*floor))`                                                                                                  | 373-382 (`EntryParam1`)            |
| Fight                | one duel per floor vs `npc` of floor `n-1` (0-based ini), reason 40, HP/MP pouches used after a win                                                                | 722-743, 701-719                   |
| Floor EXP            | `exp[n-1] × AdultIncomeMul` added to a pot (`SGateExp`); paid with `AddExpNoMul` when the run ends or is withdrawn                                                 | 701-705, 773-776                   |
| Lives                | 1 free "fake body" per run; extra: `6 + 2 × bought` Gold each, max 999                                                                                             | 389; 282-283; Config.ini:7-8, 15   |
| Loss                 | HP/MP refilled; if no lives left, pot × 0.5 and the run ends                                                                                                       | 689-699                            |
| End                  | floor `NewMaxGate = 170` cleared, or "Repeat" → "Confirm restart" at the NPC (ends the run and pays the pot)                                                       | 712-715; script 144-190            |
| Best floor           | `SGateMaxFloor`, also a leaderboard (`TopSystem` type 10)                                                                                                          | 745-751                            |
| Broadcasts           | floors 50, 100, 150 and new records above 150 (`SingleGate_231/232/213/303`)                                                                                       | 786-811                            |
| Auto mode            | Gold `ReplayMoney0..2 = 28/58/91` for 1-3 runs; simulates floors (binary search up to `MaxGate = 160`), one floor per 30 s, also offline; locks travel to 171/3101 | 298-323, 434-618, 192-218, 158-173 |

Quests: SubTask 14 "reach floor ≥ N" (`SingleTollGateRule.java:74-84`; 59002 floor 10, Lv 13),
20 "reach floor exactly N, K times" (`SingleTollGateCountRule.java:74-84`; 59618 floor 50 × 3,
59622 floor 90 × 3). SubTask 15 "kill toll gate NPC N times" (`MulTollGateRule.java:61-79`;
59101-59104 sub-gate bosses, 59619-59621). Tasks with `RequireLevel=101` (59004-59008, 59100) are
unreachable.

## 4. Pub fights in 26xx-28xx (`J/CloneSceneModule/PubMonsterFightSystem.java`)

Not a toll gate, but field content of every neutral field. `RES/scene/pubfightmonster/`:
`PubSceneFightInfo.ini` (scene → `MonsterLibID`, `UseEnergy=3`, 13 scenes 2601-2804),
`PubMonsterLibID.ini` (195 rows, NPCs n8000001+, 15 per lib), `PubMonsterRewardRule.ini` (403
combos of 2 or 3 NPCs → `RewardGrade`), `PubMonsterDropLib.ini` (reward id → DropLib),
`PubFightMonsterConfig.ini` (`PubFightMaxTimes=999`, `PullRockerCd=3600`). Client
`UI_PubFightMonster.swf`, `C/GameUI/AsUILogic/UI_PubFightMonster/UI_PubFightMonster.as`.

| Action         | Rule                                                                                                                     | Lines            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Line-up        | per player and scene: 3 NPCs; first visit picks 3 distinct ones from the lib                                             | 142-181          |
| Pull (re-roll) | once per 3600 s: 3 NPCs with repeats; a matching 3-combo (sorted) else 2-combo grants its DropLib at once                | 203-257, 259-291 |
| Fight          | solo or captain; every member: energy ≥ 3, full HP, daily fights ≤ 999; costs 3 energy each; 3 duels, reason 45          | 472-500, 583-631 |
| Win            | +1 daily count, pouches used, then an automatic pull (new line-up + combo reward); last NPC pays EXP/drops (energy free) | 664-688          |
| Loss           | HP = 1, +1 daily count                                                                                                   | 690-708          |

## Existing data and code

| Item                                                         | State                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `scenes.json`, `scene-switch-rules.json`, `scene-links.json` | complete for all scenes (logicscene 45 sections, rules 40, links 37)                              |
| `scene-buildings.json`, `scene-npcs.json`                    | include 161 and 171                                                                               |
| `npcs.json`                                                  | all 1080 toll gate NPCs (n300-n308xxx, n601-n608xxx, n705-n708xxx), n900001-170, all 195 pub NPCs |
| `game-world-map.json`                                        | 10 of 34 buttons: re-export                                                                       |
| `POST /travel`                                               | wrong origin rule (see 1), no `ToScene` go home / go out, no `ScenesEntered`                      |
| Energy, toll gates, single gate, pub fights, card flip       | not imported, not modelled                                                                        |

## New imports (suggested `server/data/game/` names)

| JSON                          | Source                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `level-scenes.json`           | DT/levelsceneid.s26804.tab                                                                  |
| `toll-gates.json`             | clonescene/TollGate.ini (+ `Hard`, `BossName`, `PassCondition` from DT/tollgate.s28263.tab) |
| `toll-gate-subs.json`         | SubTollGate.ini                                                                             |
| `toll-gate-points.json`       | FightMonsterPoint.ini                                                                       |
| `toll-gate-groups.json`       | MonsterGroup.ini                                                                            |
| `toll-gate-config.json`       | TollGateLobbyScene, TollgateCloneScene, TollGatePropConfig, CaptianMul, TGCardConfig        |
| `toll-gate-cards.json`        | TGCardDropId.ini + TGCardDropLib.ini (grouped by `ID`)                                      |
| `toll-gate-rank-rewards.json` | RankExpReward, RankMoneyReward, RankItemReward                                              |
| `toll-gate-exchanges.json`    | ExchangeMagicBox.ini                                                                        |
| `single-gate.json`            | singlegate/SingleGateConfig, SingleGateInfo, SingleFloorCfg                                 |
| `pub-fights.json`             | pubfightmonster/*.ini (config, scenes, libs grouped, reward rules, drops)                   |

## State the server must keep

| State         | Fields                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Character     | `energy`, `energy_day`; `scenes_entered int[]`                                                                           |
| Toll gate day | `toll_gate_day`, `toll_gate_entries`                                                                                     |
| Toll gate run | gate, sub gate, current point, passed point, point state; card state, gate, 5 cards, peek count                          |
| Las Noches    | best floor, current floor, mode (idle/manual/auto), started, pot EXP, lives, bought lives, runs today + day, auto fields |
| Pub fights    | per scene line-up (3 NPC ids), last pull time, fights today + day                                                        |
| Rankings      | per gate per week: top 50 (character, schedule, time), last week's claim flags                                           |

## M3 vs M4

| Feature                                                  | Milestone     | Reason                                                                       |
| -------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| Travel fixes, full world map, 161/171 buildings and NPCs | M3            | roadmap; prerequisite for 26xx-28xx                                          |
| Toll gates solo (all 21 gates)                           | M3            | `RequirTeam` 0 or 2 everywhere: every gate is playable alone in the original |
| Card flip, crystal exchange                              | M3            | only step after a clear; uses Gold/Coupons that already exist                |
| Las Noches manual mode                                   | M3            | solo by design; reuses the battle engine                                     |
| Las Noches auto mode                                     | M3 late or M5 | 30 s heartbeat including offline catch-up; Gold-only convenience             |
| Pub fights                                               | M3            | field content of 26xx-28xx, solo-capable; needs energy                       |
| Teams in toll gates and pub fights, captain bonus        | M4            | needs the party system (roadmap M4)                                          |
| Weekly toll gate ranking and rank rewards                | M4            | competition feature; needs a weekly job and leaderboards                     |

## Asset needs

- World map: re-export `UI_WorldMap.swf` buttons for all scenes (161, 171, 2601-2605, 2701-2704,
  2801-2803; drop 181).
- Scenes: 161, 171 (layers + buildings `clip_*` above), 3101 (`MsgScene`, no element layer),
  3102 (`TollGate`), 5001 and 100000-100038 (`TollClone`, client-defined), 61-64
  (`SingleTollGate`), 26xx-28xx fields.
- UI: `UI_TollGateSelect`, `UI_TollGateSuperSelect`, `UI_TollGateChallenge`,
  `UI_TollGateFightMenu`, `UI_TollGateRank`, `UI_SingleTollGate_Xml`, `UI_PubFightMonster`,
  `UI_PubFightBonusDes*_Xml`, `UI_ItemExchange_Xml`, card flip window (BaseSource).
- Portraits and battle sprites for the 1080 toll gate NPCs (n300-n308xxx, n601-n608xxx, n705-n708xxx; `MapUserFace_*`), n900001-170
  (`MapUserFace_*`, `AvatarUserFace_*`), n8000xxx (`ArenaUserFace_*`); NPC photos
  `NpcPhoto_Build_16001-17003`.
- Item icons: i152000-i152003, i152010-i152015, `ExchangeMagicBox` destinations, `TGCardDropLib`
  items.

## Open questions

1. Energy: port it (200 max, +100/day, 1 per won field fight or no rewards), or drop it and keep
   only the pub fight cost? It changes M2 fights retroactively.
2. Unvisited places on the world map: hidden-but-clickable (original) or dimmed and blocked?
3. Angel City "Village" button leads to Crossroads (`ToScene=2601`): keep?
4. VIP (EXP +30% in toll gates, Las Noches 96.7% start): no VIP system planned; treat as never VIP?
5. Toll gate ranking needs a weekly reset job (week of year, server time zone): M4?
6. Daily resets (`LogicTool.GetTaday`) use server local midnight; M2 explore uses UTC days. Use UTC
   everywhere?
