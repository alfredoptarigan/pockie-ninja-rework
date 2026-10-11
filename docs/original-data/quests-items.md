# Original data: quests, items, drops, currencies

Reference for `tools/import-game-data.ts`. RES = `app/code/props/serv/game/Resource`,
J = decompiled server. Treat server INI files as authoritative over client `.tab` files.
Trim section headers (some have trailing spaces, e.g. `[i240050 ]`).

## Quests

Sources: `RES/task/Task.ini` (2469 tasks, section = task id), `RES/task/SubTask.ini` (2786 rows,
section = row index, group by `ID`), `TaskMonsterDrop.ini`, `TaskRewardItems.ini`,
`ExceptTaskScene.ini`. Loader `J/TaskModule/TaskSystem.java`.

### Task.ini

| Field                                  | Meaning                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| TaskBaseType                           | 1 main, 2 daily, 3 branch, 4 rookie (tutorial), 5 lead                     |
| TaskLogicType                          | -1 none, 1 kill, 2 collect, 3 interactive, 4 compose, 5 other (label only) |
| TaskGrade                              | daily grade 0 none, 1 D … 5 S                                              |
| AcceptNpcConfig / AcceptNpcSceneID     | accept NPC and scene, enforced for types 1, 3, 5                           |
| SubmitNpcConfig / SubmitNpcSceneID     | hand-in NPC and scene, enforced for types 1, 3, 5                          |
| PreTaskID / NextTaskID                 | 0 = none; pre must be completed                                            |
| AutoAcceptTask                         | next task is auto-accepted when this is 1                                  |
| CanAutoComplete                        | pay to finish (daily only)                                                 |
| CanGiveup                              | 0 = cannot abandon                                                         |
| RequireLevel                           | -1 = none                                                                  |
| RequireCountry                         | nation, -1 any: 0 Fire, 1 Water, 2 Earth, 3 Wind, 4 Lightning              |
| RequireSex                             | 2 any                                                                      |
| CompleteLevel                          | -1 skips the level check on submit                                         |
| RewardExp                              | int (daily scaled by grade)                                                |
| RewardMoney                            | `type,amount;…` or `0`                                                     |
| RewardItem                             | `iXXXX,count;…`, `0`, or `DayRandom`                                       |
| RewardDropID                           | DropLib id; when > 0 it replaces RewardItem                                |
| RewardHono / RewardScore / RewardFood  | honor, daily score, home food                                              |
| IsRecycle, Probability                 | daily repeat and pick weight                                               |
| TaskScript                             | `0` or `task/NNNNN.js` (15 tasks)                                          |
| StartNpcMessageID / SubmitNpcMessageID | dialog keys `TaskTalk<id>0` / `TaskTalk<id>1`                              |

Unused in data: RequireJob, RequireTeam, RequireItemConfig, Require*Time, SubmitTaskTimeLong.

### SubTask.ini

- `ID` parent task; `SetpSeq` order and array index (0..n-1, no gaps).
- `SubTaskType`: 1 collect (bag count of `TargetItem`; monsters drop it via TaskMonsterDrop),
  2 kill (`TargetConfiger` = monster), 3 talk, 4 time limit, 5 kill player, 6 arena, 7 action,
  8 command, 9 rookie lead, 10 boss, 11 search, 12 compete rank, 14/15 toll gates, 16 arrest
  slave, 17 get gift, 18 daily, 19 public scene, 20 toll gate count, 21 home build, 22 tail beast.
- Type 3: `TargetItem=0` plain talk; `TargetCondition=1` NPC gives the item; `0` hand it in.
- Type 8: `TargetCondition` is a command: 8888 use item, 8887 equip weapon, 2002 buy weapon,
  2010 kill, 2011 use medicine, 2013 equip defense, 2018 get gift (`TaskRule/CommandRule.java:69`).
  Only i160050, i159104 and i159110 fire 8888.
- `SubmitSceneID` (progress only counts there; -1 any), `CanTransfer`, `SubTaskDescription`
  (template key with `{@0:zone}{@1:monster}{@2:Total}{@3:Current}`), `NpcSayMessageID`.

### Progress

Accept creates one row per subtask. Kill rule matches config + scene; collect re-counts the bag and
removes items on completion (types 1, 3); all subtasks done → task state 2. Rookie tasks (type 4)
complete at once; types 1, 3, 5 are handed in at the submit NPC. Rewards are bound; a full bag
blocks completion. Order: items, honor, money, exp, score, food.

### Tutorial chains (`RookieTaskSystem.java:254`)

| Nation      | Chain       | Hub NPC / scene | Then main chain |
| ----------- | ----------- | --------------- | --------------- |
| 0 Fire      | 90000-90015 | n11001 / 111    | 10001 (10xxx)   |
| 1 Water     | 91000-91015 | n12001 / 121    | 12001 (12xxx)   |
| 4 Lightning | 92000-92015 | n13001 / 131    | 14001 (14xxx)   |
| 3 Wind      | 93000-93015 | n14001 / 141    | 16001 (16xxx)   |
| 2 Earth     | 94000-94015 | n15001 / 151    | 18001 (18xxx)   |

First task auto-accepted on first login.

Examples: 90000 (type 4, talk to n11001 in 111, reward exp 5, `0,100;3,10`, item i159104);
90001 use i159104 (8888); 90002 equip a weapon (8887); 10001 (type 1, level 4, kill n33017 ×2
in 2101, exp 80, `0,183`).

## Items: `RES/item/item.ini` (section `iNNNNNN`)

Common: `class` (EquipItem, AvatarItem, PharmacyItem, TaskItem, DebrisItem, GiftBagItem,
JewelItem, PetItem…), `Name` (language key), `ResourceID` (icon), `ItemType` (0 consumable,
2 equipment/avatar, 3 task, 6 box), `ItemShapeType`, `ItemMaxFoldNum` (stack), `Price` (sell, in
Stone), `CanTrade` (bit 1 = sell to NPC), `BindingType` (0 none, 1 bound, 2 bind on equip),
`CanDrop`, `CanUse`, `UseLevel` (999 = placeholder), `Sex` (2 any), `UsePopsinger` (job bitmask:
1 Blunt, 2 Sharp, 4 Fists, 7 all, -1 anyone), `JavaScript`.

- EquipItem: `EquipType` (Weapon, Cloth, Hat, Shoes, Ring, Amulet, Glove, Girdle),
  `EquipBaseType`, `AttackMin/Max`, `Defense`, `MaxHardiness`, sockets, `SuitID`. Newbie weapons:
  i250100 Blunt, i260100 Sharp, i270100 Fists (Atk 7-8, level 1).
- PharmacyItem: `HP`, `MP`, `SP`. i160006 Healing Powder HP 150; i160007 HP 250; i160001-3 SP.
- DebrisItem (boxes): `BoxDropID`, `DropMaxCount`, script `item/NormalBox.js`. i159104 Lv.1
  Newbie Pack → DropLib 9999999: i159105 (Lv10 pack), i250100, i260100, i270100.
- TaskItem: ItemType 3, bound.
- AvatarItem: `AvatarID`, `AvatarLevel`, `Clothing`, `ItemColor`.

## Drops: `RES/Drop/` (`J/DropModule/DropSystem.java`)

- `DropLib.ini` (section = drop id): `ItemDropType` 1 = quantity (≤ DropCount entries → all;
  else DropCount weighted picks without replacement), 2 = independent rolls out of 1,000,000 ×
  player `DropMul`; `DropCount`.
- `DropItemLib.ini` (rows grouped by `ID`): `ItemConfig`, `Probability` (≤ 0 skipped),
  `IdentifyPropCount`, `BindingStatus`. Count is always 1.
- `FixedDropLib.ini`: fixed bundles (`ID`, `config`, `count`, `BindingStatus`).
- Monsters: `DropCapital0Min/Max` (Stone), `DropCapital3`, `NpcExp`, `DropLibID`,
  `AppendDropLibID`. n33017: Stone 8-9, Exp 8, DropLib 3000001.
- Quest items: `TaskMonsterDrop.ini` (ID task, SceneID, MonsterConfig, TaskItemConfig,
  DropProbability 0-100), only while a matching collect subtask is active.

## Currencies (`CapitalSystem.java`, max 100,000,000)

| Type | Name           | Use                                                 |
| ---- | -------------- | --------------------------------------------------- |
| 0    | Stone ("Batu") | soft currency: drops, NPC sell price, quest rewards |
| 1    | "Papan"        | unused                                              |
| 2    | Gold           | premium                                             |
| 3    | Gift Coupon    | premium, purchases bound                            |

Honor ("Medali") is separate. Keys `Common_Money<type>`, `Common_MoneyDes<type>`.

## Language keys (all prefixed `lg_`)

- Quests: `Task_<id>` name (also `t<id>`), `TaskDes_<id>`, `TaskTalk<id>0` / `TaskTalk<id>1`,
  `SubTaskDes_<n>` templates, `TaskNpcSpy_<n>`.
- NPCs: `name_<npc>`, `NPC_<npc>`, `Say_<npc>`.
- Items: the item's `Name` value (e.g. `HP1_itemname`, `Equip_BluntNewbie`, `avatar1`),
  `TipDes_<Name>`, `TipDesEffect_<Name>` (avatars), sometimes `Item_<id>`.
- Drops: `DesDropID_<dropId>`.
