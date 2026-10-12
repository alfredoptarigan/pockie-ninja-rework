# Original data: blacksmith (enhance, appraise/refine, inscribe, durability)

Reference for the M3 forge. RES = `app/code/props/serv/game/Resource`, EQ = `RES/Equip`,
J = decompiled server `EquipModule/` (other modules named in full), C = decompiled client
`GameUI/AsUILogic`, DT = `apache/source/binary/datatable`. Line numbers are the decompiled `.java`
or the `.ini` file. English UI names are the reviewed `tools/i18n/en.json` strings.

## Names and where each action lives

| Original system (Java)      | English UI name           | Where in the 2011 client                                                           | Currency                         |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| `ConsolidateSystem`         | Enhance                   | Forge window tab 0 (`UI_EquipMakeRoom_Xml`)                                        | Gold or Gift Coupon, or talisman |
| `IdentifySystem` first time | Appraise                  | Bag: item menu `ViewMenuIdentify`, bag button "Appraise all" (`btn_Identify`)      | Stone                            |
| `IdentifySystem` flush      | Refine                    | Forge tab 1                                                                        | Gold or Gift Coupon, or talisman |
| `AddMagicSystem`            | Enchant                   | Forge tab 2                                                                        | Gold or Gift Coupon, or talisman |
| `AddHoleSystem`             | Create Slot               | Forge tab 3                                                                        | Gold or Gift Coupon, or talisman |
| `EnchaseSystem`             | Embed / remove gem        | Forge tabs 4, 5                                                                    | Gold or Gift Coupon (removal)    |
| `IdentifySystem` impress    | Engrave / clear engraving | Forge tabs 6, 7                                                                    | Gold                             |
| `InscribeSystem`            | Inscription               | Bag button "Synthesis" → `UI_YYEquipCompose_Xml` (level ≥ 15, `UI_Package.as:941`) | Stone + Inscription Talismans    |
| `ComposeSystem`             | Synthesis / Recast        | Same window as Inscription                                                         | Stone (daily-growing fee)        |
| `HardinessSystem`           | Repair                    | Bag item menu `ViewMenuRepaire`, bag `btn_Repair`, equip shop "Repair all"         | Stone                            |

- Forge NPC: BuildNpc `BuildType=3` n11003 / n12003 / n13003 / n14003 / n15003 / n16003 / n17006
  ("Blacksmith"), script `RES/javascript/npc/foundryNpc.js`. Menu: Enter Forge (opens
  `UI_EquipMakeRoom_Xml`, tab titles `C/MakeRoom/UI_MakeRoom.as:157-164`), Outfit transform
  (`UI_ItemTransform_Xml`), Advanced outfit transform (`UI_AvatarTransition_Xml`), and one menu row
  per non-zero free counter (`FreeAddMagic`, `FreeConsolidate`, `FreeIdentify`, `FreeAddHole`) that
  converts the counter into bound talismans i161001 / i161003 / i161004 / i161002
  (`foundryNpc.js:20-48`, 69-150).
- The server never checks the player's scene or NPC for any of these actions (each handler only
  checks its own item box). Appraise and Repair work anywhere from the bag.
- Equipment NPC `BuildType=5` (n11005 …, `npc/equipNpc.js`) only opens the shop (`UI_NpcShop_Xml`),
  which carries the "Repair all" button (`C/UI_Commerce/UI_NpcShop.as:368-389`); see `shops.md`.

## Config: `EQ/equipPropConfig.ini [equipPropConfig]`

Server defaults in the Java differ; the ini values are live.

| Key                         | Value   | Line  | Used by                                                  |
| --------------------------- | ------- | ----- | -------------------------------------------------------- |
| `AddHoleCost`               | 58      | 3     | Create Slot, Gold/Gift Coupon (`AddHoleSystem.java:302`) |
| `ConsolidateCost`           | 8       | 4     | Enhance, Gold/Gift Coupon (`ConsolidateSystem.java:338`) |
| `FlushIdentifyCost`         | 8       | 5     | Refine, Gold/Gift Coupon (`IdentifySystem.java:1029`)    |
| `AddMagicCost`              | 1       | 6     | Enchant, Gold/Gift Coupon (`AddMagicSystem.java:175`)    |
| `ConsolidateEquipFatcor`    | 5       | 7     | Enhance attack factor (% per level)                      |
| `IdentifyCountJValue0..4`   | 14 … 46 | 8-12  | Synthesis rate and tooltip score by property count       |
| `RandomComposeFailItem`     | i150319 | 13    | Synthesis failure item                                   |
| `DivideJewelLevel1..10`     | 4 … 191 | 14-23 | Gem removal cost by gem level                            |
| `ImpressCost`               | 198     | 24    | Engrave, Gold only (`IdentifySystem.java:727`)           |
| `ClearImpressIdentPropCost` | 8       | 25    | Clear engraving, Gold only (`IdentifySystem.java:817`)   |

The `Blood*` keys belong to bloodlines (M5).

## Enhance (`ConsolidateSystem.java`, custom 133)

Requirements (`CanBaseConsolidateEquip` 88-114): item in the Enhance box, class EquipItem,
`EquipBaseType` 1 (weapon) or 2 (armor), appraised, `ConsolidateLevel < ConsolidateMaxLevel`
(item.ini: 12 for 450 items, 0 for 141), and a fail-rate row exists for the next level.

| Mode     | Client arg | Cost                                                         | Binding                              |
| -------- | ---------- | ------------------------------------------------------------ | ------------------------------------ |
| Free (1) | `[1]`      | 1 FreeTimesItem with `FreeTimesType=1` (i161003), any result | equip bound if the talisman is bound |
| Paid (2) | `[2, cap]` | `ConsolidateCost` (8) of capital 2 Gold or 3 Gift Coupon     | Gift Coupon binds on success         |

Roll (176, 215): `next = level + 1`, `F = FailRate[next]`, `r = RandInt(0,100)`; success when
`100 - F >= r`, so `P = (101 - F) / 101`. Failure: cost or talisman is spent, level unchanged
(`lg_Common_ConsolidateDes` 3). Every attempt fires quest command 2126 (used by 59501).

`EQ/ConsolidateFailRate.ini` (section = target level). The client table `DT/equipconsolidate.tab`
shows `Rate = 100 - F` for the current level.

| Target level | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  | 12  |
| ------------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FailRate     | 0   | 33  | 56  | 70  | 80  | 87  | 91  | 94  | 96  | 97  | 98  | 99  |
| Shown rate % | 100 | 67  | 44  | 30  | 20  | 13  | 9   | 6   | 4   | 3   | 2   | 1   |

Effect (`SetConsolidatedPropValue` 116-133), L = new level, values from the item's config:

- Weapon: `m = (float)(AttackMin + AttackMax) / 2 * (1 + L * 5 / 100f)`;
  `AttackMin = (int)(m * 0.9)`, `AttackMax = (int)(m * 1.1)` (overwrites the instance values).
  Example i250104 Mythbeast Bat 34-41: +1 → 35-43, +12 → 54-66.
- Armor: `ConsolidatedMaxHP = L * ConsolidateRate` (flat HP, added to `MaxHPEquip`;
  i220102 rate 4 → +4 HP per level). The UI text says "%", the code is flat.

Edge cases: weapons lose their original min/max spread from +1 on (always ±10% of the mean);
rings and amulets (base type 3) cannot be enhanced; protection items do not exist.

## Appraise and Refine (`IdentifySystem.java`)

### Item state

| Field (instance)    | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `CanIdentify`       | 1 = has hidden properties. Not in item.ini; class default unknown (assume 0). |
| `IdentifyPropCount` | 1-4 properties to roll                                                        |
| `IdentifyTimes`     | times rolled; ≥ 1 = appraised                                                 |
| `IdentifyPropRec`   | ≤ 4 rows `[PropID, PropIndex, PropValue, PropName]`                           |
| `ImpressIdentRec`   | 4 rows `[IsImpress]` (engraved = locked), created on load (88-99)             |

- Appraised = `CanIdentify != 1 || IdentifyTimes >= 1` (178-185). Unappraised gear cannot be
  equipped (`EquipSystem.java:421`), enhanced, slotted, refined or engraved.
- Drops set the count from `DropItemLib.IdentifyPropCount` (`DropModule/DropSystem.java:144-157`;
  equipment rows: 0 → 144, 1 → 2230, 2 → 3957, 3 → 3919, 4 → 2779). Count 0 leaves the item
  without properties. Monster drops placed in the bag are rolled at once
  (`DropModule/MonsterDropSystem.java:234-255`); boxes do the same (`item/NormalBox.js:135-139`).
  So "Appraise" only matters for items that skipped those paths.

### Appraise (first roll, custom 120; all, custom 128)

- Needs `CanIdentify == 1`, count 1-4, `IdentifyTimes == 0`, Stone (404-406).
- Cost (Stone, 382-385): `(int)(-0.0009 * L^2 + 0.27 * L + 12)`, L = item `UseLevel`.
  L 1 → 12, 30 → 19, 60 → 24, 90 → 29. "Appraise all" sums the cost over the open bag page.
- Fires quest command 2012 while the rookie flag is 0 (485-489; used by 40005).

### Refine (re-roll, custom 134)

| Mode     | Cost                                                               | Binding                              |
| -------- | ------------------------------------------------------------------ | ------------------------------------ |
| Free (1) | 1 FreeTimesItem `FreeTimesType=3` (i161004) within its level range | equip bound if the talisman is bound |
| Paid (2) | `FlushIdentifyCost` (8) Gold or Gift Coupon                        | Gift Coupon binds                    |

Item must be appraised (495-508). Fires quest command 2114 (used by 59502). The client calls white
(0-property) equipment not refinable (`lg_Common_IdentifyDes`); the server only rejects count 0.

### Roll (`FlushEquipIdentifyProp` 350-380)

Tables: `EQ/EquipIdentifyIDList.ini` (476 sections, item id → `CommonIdentifyID`,
`SpecialIdentifyID`; trim headers like `[i210050 ]`; 7 ids are not in item.ini; 122 of 591 equip
items have no row and never get properties), `EQ/EquipIdentifyProp.ini` (208 groups, keys
`IdentifyN` → prop id, 4-28 entries), `EQ/IdentifyPropLib.ini` (849 props: `PropName`,
`PropMinValue`, `PropMaxValue`, `PrefixName` = `lg_IdentifyProp_100NN` name prefix).

1. Keep the first engraved row (if any) with its position; clear all rows.
2. Common rolls: `n = count`; if `count == 4` and the item has a special group, `n = 3` unless the
   engraved row is position 3. `n -= kept`. Pick ids uniformly from the common group without
   replacement, skipping property names already present (205-248).
3. Special ("gold") roll: if `count == 4`, special group > 0 and position 3 is not engraved, add
   one prop from the special group whose name is not present (253-283, 293-304).
4. Re-insert the engraved row at its position. `IdentifyTimes += 1`.

Value: `RandInt(min, max)`; Strength/Agility/Stamina are floored to hundreds, minimum 100
(187-193; base stats are ×100). Example group 1001 (newbie weapons): StrengthEquip 2800-3400,
AbsAddAtkMulEquip 23-29, MaxMPMulEquip 23-29. Special group 2001 contains `IsDecHardEquip 1-1`
(no durability loss).

Edge cases: a group with fewer distinct names than needed loops forever (`--i; continue`, 227-229);
props whose name is not a Player property are skipped and leave fewer rows.

### Engrave and clear (customs 520, 521; M3 optional)

- Engrave locks one property so Refine keeps it. Needs a Carving Blade (ImpressItem,
  `ImpressMaxLevel >= UseLevel`), no current engraving, `ImpressCost` 198 Gold (680-728).
- Rate from `EQ/ImpressRate.ini` by `UseLevel` band: Common 75/65/55/45/40/35/30, Gold (position
  3 of a 4-prop set item) 37/32/27/22/20/17/15 for 1-30 … 81-90. Optional rate crystals add
  `count * ImpressRate`; ≥ 100 succeeds and uses only the needed crystals, otherwise all crystals
  are destroyed and `RandInt(0,100) <= rate` (730-802). Blade and Gold are spent either way.
- Clear: 8 Gold, removes the lock (816-859).
- Conflict: client `DT/equipimbrate.s28794.tab` shows Gold rate = Common rate (75 … 30) and
  +5 per crystal; the server halves it. Follow the server.

## Inscription (`InscribeSystem.java`, custom 681; seal counts custom 680)

Any EquipItem with `InscribeLevel < 12` may enter the box (56-74). Client args `[sealType, n]`,
sealType 0 Low (i161008), 1 High (i161009) from `EQ/SealOdds.ini` (`LowOdds=3`, `HighOdds=6`).

`EQ/EquipInscribe.ini` (section = current level; client copy `DT/equipinscribe.s28060.tab` matches):

| From | To  | BaseOdds | FailLevel | Atk/Def ratio % | Stone |
| ---- | --- | -------- | --------- | --------------- | ----- |
| 0    | 1   | 94       | 0         | 3               | 60    |
| 1    | 2   | 78       | 1         | 6               | 120   |
| 2    | 3   | 68       | 2         | 10              | 180   |
| 3    | 4   | 58       | 3         | 14              | 240   |
| 4    | 5   | 48       | 4         | 18              | 320   |
| 5    | 6   | 35       | 4         | 23              | 400   |
| 6    | 7   | 24       | 4         | 28              | 480   |
| 7    | 8   | 12       | 4         | 33              | 600   |
| 8    | 9   | 8        | 8         | 39              | 720   |
| 9    | 10  | 6        | 8         | 45              | 840   |
| 10   | 11  | 4        | 8         | 52              | 1000  |
| 11   | 12  | 3        | 8         | 60              | 1200  |

`LowSealMaxNum = HighSealMaxNum = 3` on every row.

1. Reject when the bag has 0 seals of the chosen type, even if n = 0 (338-342), or Stone < cost.
2. Seals used `= min(n, 3, owned, ceil((100 - BaseOdds) / SealOdds))` (158-176); removed now.
3. Stone cost is paid (349). Roll `RandInt(0,100) <= BaseOdds + SealOdds * used`
   (`P = (succ + 1) / 101`, capped at 1).
4. Success: level = To; failure: level = FailLevel (matches `lg_CountMark_Des` 5).
5. Bonus for a level k > 0 uses row k-1's ratio (232-308), stored in `InscribeRec`
   `[PropIndex, Value, PropName]`:
   - weapon: `MaxAtkEquip = ceil(config AttackMax * ratio / 100)`, `MinAtkEquip` likewise with
     AttackMin (config values, so Enhance does not compound);
   - armor: `DefenseEquip = ceil(Defense * ratio / 100)`;
   - level 0 → 0. Example i250104 (34-41): +1 → +2/+2, +12 → +21/+25.
6. Reaching +11 or +12 is announced to the world (255-257).

Edge cases: base type 3 items gain the level but no bonus (no case in the switch); seals do not
change binding; the client shows the rate only when n > 0 (`C/UI_EquipMent.as:925-968`).

## Durability and repair (`HardinessSystem.java`, customs 124, 125)

- New item: `Hardiness = MaxHardiness` (`EquipSystem.java:92-100`). `UnDecHardiness = 1` items
  (129 rings/amulets, a few others) never lose or repair durability.
- Loss (equipped items only, skipped when `UnDecHardiness`, already 0, or an `IsDecHardEquip`
  property):

| Trigger                                  | Loss per item                   | Source                                                            |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| Won fight, per enemy killed (command 10) | 1                               | `FightModule/FightSystem.java:290-298`, `HardinessSystem` 170-182 |
| Won virtual-NPC fight (command 12)       | 1                               | `FightSystem.java:646-652`                                        |
| Revive at home (`relive` type ≠ 1)       | `(int)(MaxHardiness * 5 / 100)` | `RoleModule/ReliveSystem.java:77-95`, `RES/role/relive.ini` 4     |

- At 0 the item's stats, skills and set bonus stop counting (`CheckEquipEffect`,
  `EquipSystem.java:339-355`) and the weapon counts as missing (`GetWeapon` 358-372). The client
  warns below 10% (`lg_Common_NoHardinessWeapon1..9`).
- Repair cost (Stone, 239-255), L = `UseLevel`, per damaged item:
  `(int)((Max - Cur) / Max * (-0.009 * L^2 + 2.7 * L + 120)) + 1`; repair sets `Cur = Max`.
  L 1 fully broken (Max 100) → 123; L 30 half broken → 97. "Repair all" covers equipped items only.
- Our M2 server has no durability yet; revive "home" should also apply the 5% loss.

## Equipment property model (how gear becomes stats)

`EQ/EquipPropDefine.ini` (58 rows): `PropName` = a Player property, `PropType` 0 additive stat,
1 `AddSkillEquip`, 2 `EffectSkillEquip`, 3 `IsDecHardEquip` flag. `EQ/EquipDefine.ini`: slots
Hat 0, Cloth 1, Shoes 2, Amulet 3, Weapon 4, Ring 5, Glove 6, Girdle 7 (8-slot box, 57).

Per equipped item that passes `CheckEquipEffect` (durability > 0, `UsePopsinger & Popsinger`,
sex), `GetEquipTotalProp` (`EquipSystem.java:294-300`) adds:

| Source      | Props                                                                                                            | Lines   |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| Base        | `MinAtkEquip` ← AttackMin, `MaxAtkEquip` ← AttackMax, `DefenseEquip` ← Defense, `MaxHPEquip` ← ConsolidatedMaxHP | 233-243 |
| Other       | item.ini `OtherPropName`/`OtherPropValue` (`;` lists, 80 items)                                                  | 245-265 |
| Identify    | `IdentifyPropRec` rows                                                                                           | 267-274 |
| Gems        | `JewelItemRec` rows                                                                                              | 276-283 |
| Inscription | `InscribeRec` rows                                                                                               | 285-292 |
| Enchant     | `AddMagicSystem.GetEquipAddMagicProp`                                                                            | 299     |
| Set bonus   | `SuitEquipSystem.GetEquipBoxSuitProp` (see `equipment-sets.md`)                                                  | 315     |

Only `PropType = 0` names are summed (`SetPlayerEquipProp` 321-336); the totals feed
`RoleModule/RefreshSystem.java:283-391` (formulas in `characters.md`). Notes: `AtkTimeEquip`
is read but unused (only `AtkTimeMulEquip` counts, 361); `AbsAddAtkEquip` / `AbsAddAtkMulEquip`
add to both min and max (293-296); Strength/Agility/Stamina props are ×100 like base stats.
`EQ/AddProp.ini` has a single test row (`i270061 StrengthEquip=1`) and is not used here.

## Other forge systems (scope)

| System                               | Key rules                                                                                                                                                          | M3?      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Create Slot (`AddHoleSystem`)        | appraised, `HoleCount < MaxHoleCount`, always succeeds, 58 Gold/Gift or talisman i161002 (`FreeTimesType=2`)                                                       | Later    |
| Embed / remove gem (`EnchaseSystem`) | gem level vs `UseLevel` (115-116), removal cost `DivideJewelLevelN`                                                                                                | Later    |
| Enchant (`AddMagicSystem`)           | MagicItem with `ItemAddMagicLevel`; equip `UseLevel >= (lvl-1)*10+1`; 1 Gold/Gift or i161001; `MagicPropLib.ini` (419 rows); overwrites                            | Later    |
| Synthesis (`ComposeSystem`)          | `EquipCompose.ini` 9745 recipes (Src1-3 → Target, Rate) + `EquipComposeRand.ini`; fee `count * 10` Stone, count resets daily (`EquipCommon.ini` 3-5, Java 171-189) | Later    |
| Ring exchange (`RingExchangeSystem`) | `RingExChange.ini` 7 level bands → i300111-i300117, keeps prop count                                                                                               | Later    |
| Engrave                              | above                                                                                                                                                              | Optional |

## Client presentation

- Grid border by property count (`GameUI/ImageGrid.as:554-571`): 0 white `#FFFFFF`, 1-2 blue
  `#00AEFF`, 3 orange `#FF8A00`, 4 gold `#FFC600`. Tooltip score `IdentifyCountJValue<count>`.
- Forge tabs and messages: `lg_Common_Consolidate*`, `lg_Common_Identify*`, `lg_Equip_*`,
  `lg_CountMark_*`, `lg_FreePropName_*`. Talisman icons: `Icon_Debris136-139`, `Icon_LowSeal`,
  `Icon_HighSeal`.

## Import (new JSON in `server/data/game/`)

Already imported: `items.json` (EquipItem fields incl. `ConsolidateMaxLevel`, `ConsolidateRate`,
`MaxHardiness`, `UnDecHardiness`, `Min/MaxHoleCount`, `SuitID`, `OtherProp*`; talismans i161001-9),
`drop-items.json` (`IdentifyPropCount`). Missing:

| File                      | Source                                   |
| ------------------------- | ---------------------------------------- |
| `equip-config.json`       | `equipPropConfig.ini`, `EquipDefine.ini` |
| `equip-props.json`        | `EquipPropDefine.ini`                    |
| `enhance-fail-rates.json` | `ConsolidateFailRate.ini`                |
| `inscribe-levels.json`    | `EquipInscribe.ini`, `SealOdds.ini`      |
| `identify-lists.json`     | `EquipIdentifyIDList.ini` (trim ids)     |
| `identify-groups.json`    | `EquipIdentifyProp.ini`                  |
| `identify-props.json`     | `IdentifyPropLib.ini`                    |
| `impress-rates.json`      | `ImpressRate.ini` (if Engrave ships)     |

## Per-item state to persist

Store only what cannot be derived: enhance level (0-12; attack and HP follow from config),
inscription level (0-12; bonus follows from config + table), durability, `canIdentify`,
`identifyPropCount` (0-4), `identifyTimes`, rolled props `[{propId, value}]` (name from
`identify-props`), engraved position (0-3 or none), and later hole count, gems, enchant props.
`inventory_items.bound` already exists.

## Open questions

1. `CanIdentify` default for shop-bought or quest equipment is not in the data (class default in
   `RES/Code/ClassInfo.dat`); assume 0 (appraised, no properties) unless the shop spec says otherwise.
2. Engrave gold rate: server 50% of common vs client table equal; we follow the server.
3. Inscription on rings/amulets raises the level with no bonus; block it like the UI text says?
4. Which of our fight paths map to "kill target" (−1 per enemy) vs "virtual NPC" (−1 per fight)
   for durability.
