# Original data: world, scenes, NPCs, explore spots

Reference for `tools/import-game-data.ts`. Paths: RES = `app/code/props/serv/game/Resource`,
J = decompiled server (`SceneModule/SceneSystem.java`, `SceneSwitchRuleSystem.java`,
`NpcModule/RefreshNpcSystem.java`, `RoleModule/OutSearchSystem.java`), datatables in
`apache/source/binary/datatable` (use the highest `.sNNNN` version; row 0 of newer `.tab` files is a
Chinese header row).

## Scenes: `RES/scene/logicscene.ini` + `datatable/scenepos.s30135.tab`

`[sceneId]` fields (default when missing):

- `x`, `z` (float): scene centre on a 150-unit world grid; must be unique.
- `Type` (1): 1 field, 2 special/activity (3001, 5001), 3 town (111-171). Type 2/3 hide players.
- `Nation` (-1): owning village; other nations are refused (`FeedBack_Common_004`) unless a task allows.
- `Level` (-1): minimum level to enter (`FeedBack_Common_005`).
- `ToScene` (-1): override target for go home / go out (161 → 2601; 3101, 3102 → 171).
- `IsStart` (0/1): open or not. `CanTeam`, `CanTeamSwitchTo`, `CanEnemy`, `CanRelive`: flags.

`scenepos.tab`: `Type` (MainCity, MagicCity, OutCity, MsgScene, TollGate, Home, TollClone, Arena…),
`SceneID`, `CenterX`, `CenterY`, `Width`, `Height`, `Define` (Sever / Client), layer toggles
`BackGround`, `Element`, `BuildName`, `SkyBox`, `BackGroundEffect`.

### Nation → village (`RES/scene/nationscene.ini`)

| Nation | Village | Indonesian            | First field |
| ------ | ------- | --------------------- | ----------- |
| 0      | 111     | Fire, Desa Api        | 2101        |
| 1      | 121     | Water, Desa Air       | 2201        |
| 2      | 151     | Earth, Desa Tanah     | 2501        |
| 3      | 141     | Wind, Desa Angin      | 2401        |
| 4      | 131     | Lightning, Desa Petir | 2301        |

Field prefix follows the village number, not the nation: 21xx = 111, 22xx = 121, 23xx = 131,
24xx = 141, 25xx = 151. Neutral: 161 Angel City, 171 Demon City, 26xx-28xx. xx04 = Christmas maps.
`levelsceneid.tab` gives level bands for 26xx-28xx.

## Travel

- `RES/scene/sceneswitchrule.ini`: section = target scene; `RequireLevel`; other keys
  `<from>=<capitalType>,<cost>` (all free in this data). Targets without a section are refused
  (3001, 3101, 3102, 4101, 5001 have none).
- `RES/scene/scenequeue.ini`: `r=` 15 slots of linked scene ids, -1 = empty; the client sends an
  index into the compacted list. `[2101]` → [2103, 2102].

## Village buildings

- `datatable/scenecitybuild.s30008.tab`: `SceneID`, `ClipName` (clip in the town SWF), `BuildType`,
  `NameFlag`, `NpcPhotoPicFlag`. Clip ↔ NPC by matching `BuildType` in the same scene.
  NameFlag/photo columns contain copy-paste errors; prefer the NPC's own name.
- BuildNpc (`npc.ini class=BuildNpc`): `Name`, `NpcSay`, `ResourceID`, `BuildType`, `JavaScript`.
  BuildType: 1 hall, 2 arena, 3 foundry, 4 pharmacy, 5 equip, 6 trade, 7 hotel, 8 black shop,
  9 turn card, 10 tail scene, 11 magic, 13 daily task, 14 dice, 20 toll gate entry, 21 single gate,
  22 build21.

## NPC placement

- `RES/npc/RefresNpc.ini`: `[scene]` + `r=npcId,picX,picY,scale` (scale %, negative = flip).
  Monsters use `0,0,50` (listed, not placed).
- `RES/npc/RefresHeartNpc.ini`: timed bosses `r=npcId,start,end,HH:MM,liveMinutes,picX,picY,scale`
  (5-minute heartbeat).
- `npc.ini` classes: FunNpc (dialog, optional script), NormalNpc (monsters), TicketBossNpc (+
  `AttackItemConfig`), TaskBossNpc, SnowNpc, CompeteNpc, MysticNpc. Skills in `npcrecord.ini`
  (`AttackSkill`, `TriggerSkill`, task accept/submit records).
- NormalNpc fields: `Level`, `NpcExp`, `HP`/`MaxHP`, `MP`/`MaxMP`, `MinAtk`/`MaxAtk`, `AtkTime`,
  `Defense`, `CritMul`, `CritAttach`, `HitMul`, `DodgeMul`, `ParryMul`, `PriorityMul`,
  `CounterMul`, `CounterBombMul`, `Pierce`, `Tough`, `VampiricHP`, `AbsorptionDamage`,
  `ReboundAttach`, `NeglectDefAttach`, `DropLibID`, `AppendDropLibID`, `DropCapital0Min/Max`,
  `DropCapital3`, `ResourceID`.

### Monster list (`UI_GostList.as`)

Live NormalNpc / TaskBossNpc / SnowNpc in the scene, max 6, NormalNpc hidden when level > player + 5.
2101: n33017 Sunflower Lv2, n33006 Stinger Bee Lv4, n33026 Sushi Monster Lv6, n32001 Scarlet
Bandit Lv8, n32002 Warrior of Darkness Lv10 (TaskBossNpc).

## Explore spots: `RES/role/RoleOutSearch.ini` (56 spots, id = `<scene><n>`)

- `SceneID`, `RequireLevel`, `RequireStone` (capital 0), `RequireItem` (`cfg,count;…`),
  `RequireMoney`/`RequireMoneyType`, `SearchCount` (daily, -1 unlimited).
- Cooldown is global: `RES/role/OutSearchCommon.ini OutSearchTimeSpace=300` s (TimeSpace fields are
  unused). Daily total `7 + level/10`.
- Outcome weights per card (5 cards): `GostRate` fight from `GostFactory.ini`, `MoneyRate`
  (`MoneyRule`, `MoneyType`), `BabyFactoryRate` pet egg, `BossFactoryRate`, `ItemFactoryRate`
  (50% granted), `GameFactoryRate` mini-game, `KeyFactoryRate`. Factory files: `ID`, `Config`,
  `BindingStatus`, `Odds`.
- Stars: `StarUp` searches per star; `[BabyRateStarLvN, ExpRateStarLvN]` weights;
  exp = `ExpBase + ExpBase*star/10`.
- Peeks: `CanLookCount`; `FirstMoney` stones, then `Second..FifthMoney` gold.
- Client: `ClipName` (`OutCity_1110`), `Name` (`OutSearch_<id>`).

## Language keys (`language.s53464.kv`, prefix `lg_`)

| What                     | Key                                                                     |
| ------------------------ | ----------------------------------------------------------------------- |
| Scene name               | `lg_Scene_BackGround_<scene>`                                           |
| Loading tip              | `lg_SceneTips_<scene>`                                                  |
| World map tooltip        | `lg_Tip_WorldMap_<scene>_<nation>`                                      |
| NPC name                 | `lg_name_<npc>` (TicketBoss names truncated: n3201801 → `name_n320180`) |
| NPC name (coloured)      | `lg_NPC_<npc>`                                                          |
| NPC dialog               | `lg_Say_<npc>`                                                          |
| Menu title               | `lg_UI_Title_<npc>`                                                     |
| Building label / tooltip | `lg_build_<npc>` / `lg_TipBuild_<npc>`                                  |
| Monster tooltip          | `lg_GostTip_<npc>`                                                      |
| Explore spot             | `lg_OutSearch_<id>`                                                     |
| Nation                   | `lg_Common_Nation_<n>`                                                  |
