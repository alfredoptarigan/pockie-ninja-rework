# Original data: shops and merchants

Reference for milestone 3 (shops, merchants, selling). J = decompiled server
(`CommerceModule/`, `RoleModule/RoleUseSystem.java`, `CapitalModule/CapitalSystem.java`,
`Public/LogicTool.java`), RES = `Resource/`, C = client scripts (`GameUI/AsUILogic/...`),
DT = `apache/source/binary/datatable`. English names come from `tools/i18n/en.json`.

## Overview

| Shop (client tab)                     | Server system               | Stock source                                | Currency                   | Stock      | Entry                                                              |
| ------------------------------------- | --------------------------- | ------------------------------------------- | -------------------------- | ---------- | ------------------------------------------------------------------ |
| Wholesale (`Common_MediShop`)         | `NpcShopSystem`, view 9     | `commerce/npcbox.ini` + `npcboxitem.ini`    | Stone                      | unlimited  | BuildType 5 NPC (`clip_equip`), tab 3 of the shop window           |
| Item Shop (`Common_EquipShop`)        | `RefreshShopSystem` type 1  | `refreshcontainer.ini` + `refreshitems.ini` | Stone                      | per player | same window, tab 0                                                 |
| Dark Shop (`Common_BalckShop`)        | `RefreshShopSystem` type 3  | same                                        | Stone                      | per player | same window, tab 1; also `blackshop.js` NPCs (BuildType 8)         |
| Mystery Shop (`Common_MagicShop`)     | `RefreshShopSystem` type 2  | same                                        | Gold                       | per player | same window, tab 2; minimap button in towns; `magicNpc.js` (BT 11) |
| Mysterious Merchant (`UI_MysticShop`) | `MysticShopSystem`          | `Mystic*.ini`                               | Gold                       | per spawn  | timed NPC n28001 in 2601-2605                                      |
| Pouch refill                          | `RoleUseSystem.OnCustomBuy` | formula                                     | Gold or Gift Coupon        | n/a        | HUD pouch window (`UI_RoleUse`)                                    |
| Mall (`VirtualShopSystem`)            | premium                     | `commerce/virtualshop.ini`                  | Gold or Gift Coupon        | unlimited  | top-bar button; recommend deferring (see end)                      |
| Crystal exchange (`UI_ItemExchange`)  | `TollGateSystem`            | `scene/clonescene/ExchangeMagicBox.ini`     | crystals i152010 / i152015 | unlimited  | toll gates, see `toll-gates.md`                                    |

`ExchangeSystem.java` is player-to-player trade and `MartSystem.java` is the player market and
Gold/Stone stock exchange; both belong to milestone 4 (trade), not to NPC shops.

There is **no buy-back** anywhere (no buy-back record, custom message or client UI; checked
J/`CommerceModule`, C/`UI_Commerce`). Selling is final.

## Which NPC opens what

BuildNpc rows from `RES/npc/npc.ini` (imported in `npcs.json`), scripts in
`RES/javascript/npc/`. Town building clips come from `scene-buildings.json`.

| NPC                                                            | BuildType | Script                                | Menu key                                | Opens                                         |
| -------------------------------------------------------------- | --------- | ------------------------------------- | --------------------------------------- | --------------------------------------------- |
| n11005-n15005 Merchant Boss, n16005/n17005 Angel City Merchant | 5         | `equipNpc.js`                         | `NpcMenu_Equip_Enter` "Enter Item Shop" | `UI_NpcShop_Xml` (all four tabs)              |
| n11004-n16004, n17004 Wholesale Boss                           | 4         | `pharmacyNpc.js`                      | `NpcMenu_Pharmacy_Enter`                | calls `npcShopSystem.OpenNpcShop`, see note 1 |
| n11014-n16014, n17014                                          | 8         | `blackshop.js`                        | `NpcMenu_BlackShop`                     | refresh shop type 3 (Dark Shop)               |
| n16007, n17007 Mysterious Merchant of the Mystery Shop         | 11        | `magicNpc.js`                         | `NpcMenu_Magic_Enter`                   | refresh shop type 2 (Mystery Shop)            |
| n11006-n16006 Market Clerk                                     | 6         | `TradeNpc.js`                         | `Slave_Npc_101`                         | slave room (level 18), not a shop             |
| n28001 Mysterious Merchant (class MysticNpc)                   | -         | `npc/MysticShopNpc.js` (file missing) | -                                       | `UI_MysticShop_Xml`                           |

Notes:

1. `INpcShopSystem` is an empty interface and `OpenNpcShop` is private
   (`NpcShopSystem.java:261`), and `npcbox.ini` has no rows for n1x004. The Wholesale Boss
   therefore opens nothing; medicine is sold through the Merchant Boss's Wholesale tab.
2. Town clips (`scenecitybuild.s30008.tab`): towns 111-151 and 161 only have a `clip_equip`
   (BuildType 5) shop building. BuildType 4, 8 and 11 NPCs are placed in `RefresNpc.ini` but have
   no clip, and Demon City 171 only has clips for BuildType 20 and 21. Candidate readings:
   (a) those NPCs were unreachable in the original and the window tabs plus the minimap button
   were the only access; (b) the client showed placed BuildNpcs without a clip somewhere else.
   (a) matches every client code path found.
3. Minimap "secret shop" button (`C/SceneUI/UI_SmallMap.as:489-498`): opens the window on the
   Mystery tab with the Wholesale tab hidden, only when the current scene's `scenepos` type is
   `MainCity` or `MagicCity`, otherwise `OpenError_SeniorShopOpen`.

## Wholesale shop (`NpcShopSystem`)

### `commerce/npcbox.ini` (70 sections)

`BelongNPC` (n11005 … n17005, 10 rows each), `BoxClass` (`NpcShopBox`), `BoxName`
(`NpcShopBox_1001` … `_1010`, shared by all seven NPCs), `MinLevel`, `MaxLevel`. Bands:
1001 = 0-10, 1002 = 11-20, … 1010 = 91-100. The box shown is the first band containing the
player's level (`OpenNpcShop` 261-281).

### `commerce/npcboxitem.ini`

`[BoxName]` + `r=item,price,type[,price,type…]` (`LoadResource` 519-568; capital type 0-4,
rows with fewer than 3 parts skipped). All rows are Stone (type 0):

| Box  | Levels | HP item (HP)                          | MP item (MP)                     | Price (Stone) | Sell price |
| ---- | ------ | ------------------------------------- | -------------------------------- | ------------- | ---------- |
| 1001 | 0-10   | i160006 Healing Powder (150)          | i160016 Tonic Powder (150)       | 38            | 16         |
| 1002 | 11-20  | i160007 Healing Capsule (250)         | i160017 Tonic Capsule (250)      | 48            | 20         |
| 1003 | 21-30  | i160008 Small Healing Potion (350)    | i160018 Small Tonic Potion (350) | 56            | 24         |
| 1004 | 31-40  | i160009 Medium Healing Potion (450)   | i160019 Medium Tonic Potion      | 63            | 26         |
| 1005 | 41-50  | i160010 Healing Draught (550)         | i160020 Chakra Draught           | 69            | 29         |
| 1006 | 51-60  | i160011 Small Healing Bottle (700)    | i160021 Small Tonic Bottle       | 74            | 31         |
| 1007 | 61-70  | i160012 Medium Healing Bottle (800)   | i160022 Medium Tonic Bottle      | 79            | 33         |
| 1008 | 71-80  | i160013 Superior Healing Potion (900) | i160023 Chakra Remedy            | 84            | 35         |
| 1009 | 81-90  | i160014 HP Essence (1000)             | i160024 Arcane Essence           | 88            | 37         |
| 1010 | 91-100 | i160015 HP Source (1100)              | i160025 Arcane Source            | 92            | 39         |

All stack to 100 (`ItemMaxFoldNum`), `CanTrade=1`. Sell price = item `Price`.

### Buy (`NormalShopSell` 455-506)

1. Check money (`CheckMoney` 331-342), then build the stacks: `amount / ItemMaxFoldNum` full
   stacks plus one stack of `amount % ItemMaxFoldNum` (single items when fold = 1).
2. Bag check for all stacks (`CheckPackPlaceItems`); fail → nothing happens.
3. Charge `price * amount` (`CostMoney` 344-371), message `lang_BuyInfo`.
4. Bought items are **bound** (`ItemBindingStatus = 1`, set on the shop copy, `OnNpcLoad` 307).
5. A medicine purchase (`PharmacyItem`) fires tutorial command 2017 while
   `IsCompleteRookieTask == 0` (508-517).

Unlimited stock (the shop item is cloned). The client caps the amount at the stack size and at
`Stone / price` (`C/UI_Commerce/UI_ItemBuy.as:60-135`), so one purchase is at most one stack.

## Refresh shops (`RefreshShopSystem`)

Each player owns three boxes `RefreshShopBox_1..3` (capacity 100, created on login,
`OnPlayerLoadAfter` 186-198) shown as views 34 (Item Shop), 35 (Mystery Shop), 36 (Dark Shop).

### `commerce/refreshcontainer.ini` (32 sections; client copy `DT/refreshitemcontainer.s12400.tab`)

| Field               | Meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| section             | pool id, also the `refreshitems.ini` section                                           |
| `Type`              | 1 Item Shop (Stone), 2 Mystery Shop (Gold), 3 Dark Shop (Stone)                        |
| `MinLevel/MaxLevel` | player level band; first matching section of the type wins (`FindRefreshInfo` 200-213) |
| `RefreshTime`       | seconds between automatic restocks (all 1800)                                          |
| `RandCount`         | items drawn per restock                                                                |
| `ImidRequireMoney`  | instant restock cost `amount,type[,amount2,type2]`                                     |
| `GratisCount`       | free instant restocks                                                                  |

| Pools     | Type | Levels               | RandCount | Instant restock                                  | Free | Pool size      |
| --------- | ---- | -------------------- | --------- | ------------------------------------------------ | ---- | -------------- |
| 9001      | 1    | 0-2                  | 3         | 1 Gold or 1 Gift Coupon                          | 0    | 3              |
| 1001-1010 | 1    | 3-10, 11-20 … 91-100 | 10        | 50, 64, 74, 82, 90, 97, 103, 109, 115, 121 Stone | 1    | 44 (1001), 59  |
| 1011-1020 | 2    | 0-10, 11-20 … 91-100 | 10        | 8 Gold or 8 Gift Coupon                          | 0    | 18 (1011), 25  |
| 9002      | 3    | 0-5                  | 1         | 28 Gold or 28 Gift Coupon                        | 1    | 1              |
| 1021-1030 | 3    | 6-10, 11-20 … 91-100 | 10        | 28 Gold or 28 Gift Coupon                        | 0    | 91 (1021), 133 |

### `commerce/refreshitems.ini`

`[pool]` + `r=item,price,type[,…]`, same format as `npcboxitem.ini`. Duplicate rows are allowed
and act as extra weight. Pool contents (1001 as example):

- i159000-i159003 S/A/B/C-Rank Secret Technique Scroll at 1 Stone (every type 1/2/3 pool).
- Grey gear per band: weapons for the three classes (Blunt i2501xx, Sharp i2601xx, Fists
  i2701xx), cloth i2401xx, hat i2201xx, shoes i2301xx, glove i2801xx, belt i3101xx; type 2/3
  pools add amulet i2101xx and ring i3001xx. 1001: i250101 Dogsmasher 111 Stone, i250102 Wolf
  Fang Bat 141, i240101 Child's Armor 107, i220101 Child's Hat 100, i230101 Child's Shoes 109,
  i280101 Bamboo Gloves 119, i310101 Bamboo Belt 122.
- Type 1 pools end with i150337-i150339 Disassembly Scrolls at price 0 and i150429 "Page 1" at
  10 Stone; type 3 pool 1030 ends with i150340-i150342 Mysterious Disassembly Scrolls at 0.
- 9001: i250101/i260101/i270101 newbie weapons at 1 Stone; 9002: i240101 Child's Armor at 1 Stone.
- Pools 1010/1020/1030 list i2x0119/i2x0120, which do not exist in `item.ini`; `Create` fails and
  the draw is skipped (unreachable anyway at level cap 90).

### Restock (`RefreshShopRefresh` 215-343)

1. Clear the box, set `LastRefreshTime = now`.
2. Draw: tutorial not complete (`IsCompleteRookieTask == 0`) → the first `RandCount` rows in file
   order; otherwise `RandInts(0, n-1, RandCount)`, uniform **with replacement** (duplicates
   possible, `LogicTool.java:66-73`).
3. Every item gets its row's prices, stack 1, and per type:

| Type        | Appraisal (`RandRange`, `LogicTool.java:52-64`)                                                         | Bound                                            |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1 Item Shop | equipment only: 40% (weights 60/40) appraised with 1 property (`SetEquipIdentifyPropCount 1` + `Flush`) | yes                                              |
| 2 Mystery   | property count 1/2/3/4 at 60/20/15/5 %, capped at the item's max; **not** flushed (unappraised)         | no (item default, BindingType 2 = bind on equip) |
| 3 Dark Shop | property count 1/2/3/4 at 70.0/24.9/5.0/0.1 % (weights 700/249/50/1), capped; not flushed (unappraised) | yes                                              |

The text keys match: `Common_EquipShopRefreshDes` "gray and blue-grade equipment",
`Common_EquipShopBlackDes` "unappraised equipment … chance to buy orange",
`Common_EquipShopSeniorDes` "blue, orange and even gold-grade". Property count → quality colour
is defined by the identify system (`blacksmith.md`).

### Restock triggers

| Trigger                                                               | Rule                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Opening the view (custom 67, `OpenRefreshShop` 136-184)               | restock if `now - LastRefreshTime > RefreshTime`                                                                                           |
| Countdown end (client sends custom 68, `OnCustomAnswerRefresh` 81-99) | restock if `now - LastRefreshTime >= RefreshTime`                                                                                          |
| Instant restock button (custom 69, `OnCustomImidRefresh` 101-134)     | capital type must be `MoneyType` or `MoneyType2`; free while box `GratisRefreshCount < GratisCount` (then +1), else pay that type's amount |

- `GratisRefreshCount` is never reset anywhere in J or the scripts, so the free restock is once
  per character per shop type, not daily. Ambiguous: a daily reset may have lived outside the
  backup. Candidates: (a) once per character (as coded); (b) daily.
- The paid check compares against `m_RequireMoney` instead of the chosen type's amount (121);
  both amounts are equal in the data.
- Opening the Mystery Shop fires tutorial command 2109; a paid Gold restock of the Mystery Shop
  counts toward achievement 14 (`SMShopFreshCost`).
- Client (`C/UI_Commerce/UI_NpcShop.as:471-591`): shows a `HH:MM:SS` countdown per tab; Stone
  restock asks `Common_RefreshIminRefreshOK`; Gold restock opens the Gold/Gift Coupon chooser.

### Buy one item (`RefreshShopSell` 373-400, `RefreshShopSeniorSell` 402-424, `RefreshBlackShop` 426-453)

- The item must have stack 1. Bag check, money check, charge, then the shop's own item object
  **moves** into the bag (one purchase per drawn item; it disappears from the shop).
- Item Shop purchases fire tutorial command 2002 ("buy weapon", quest command 2002), Dark Shop
  purchases 2004, while the tutorial is not complete.
- Price × `amount` is charged although only one item is given; the client always sends 1.

### Buy all (`OnCustomBuyAllEquip` 139-192, custom 129)

Views 34/35/36 only. Sums Stone, Gold and Gift Coupon prices of every item in the box, bag check
for all items (`allbuy_sysinfo_001`), then charges and moves all items. Client:
`UI_NpcShop.as:316-431` (`Common_BuyAllOK` confirm).

## Money checks (original bug)

`CheckMoney` (331-342) compares the Gold and Gift Coupon costs against the **Stone** cost, so for
Gold-priced items it always passes; `CapitalSystem.DecCapital` (115-127) then deducts
`min(cost, balance)`. A player with too little Gold still gets the item. Our port must check each
currency against its own cost. `CanDecCapital` returns the balance when it is lower (68-80).

## Selling to NPCs (`OnCustomSellItem` 71-110, custom 62)

| Rule         | Value                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Allowed when | item is in a bag box (`CLASS_PACKBOX`; equipped items cannot be sold), stack >= amount >= 1                          |
| `CanSell`    | not expired (time-limited items) and `CanTrade & 1` (`ItemBaseSystem.java:127-133`)                                  |
| Price        | `item.Price * amount` Stone (capital reason 60, no adult-time income cut, `CapitalSystem.java:92`)                   |
| Bound items  | can be sold (binding is not checked)                                                                                 |
| Shop window  | not checked by the server; the client sells by dragging a bag item onto a shop grid (`C/ImageGridList.as:1622-1665`) |
| Message      | `FeedBack_Common_008` "You sold {0}, earning {1} Stone"                                                              |

`CanTrade` values (`C/Common/Define/GameDefine.as:200-206`): 0 none, 1 NPC only, 2 players only,
3 both. Items: 1083 × 0, 396 × 1, 1209 × 2, 4495 × 3, 186 without the field. Missing
`CanTrade` / `Price` are assumed to read as 0 (not sellable / sells for 0); the kernel default is
not in the backup, so confirm before relying on it.

### Sell all (`OnCustomSellAllItem` 194-244, custom 127)

The server sells the listed bag indexes that pass `CanSell`, Stone = `Price * stack`, then
destroys them (`allbuy_sysinfo_002`). The client (`C/UI_Package/UI_Package.as:1009-1130`) first
asks per item (`Common_SellAskItem`) for pets, food, avatars, jewels, set items (`SuitID > 0`),
equipment with 3 or 4 properties, unappraised equipment, and items listed in
`DT/sellaskitem.s4673.tab` (124 rows, `Type` 10 mall item, 16 key, 17 boss ticket, 18 bag).

## Pouch refill (`RoleUseSystem.OnCustomBuy` 72-154, custom 13)

Args: capital type (only 2 Gold or 3 Gift Coupon), `addHP`, `addMP` (units of 1000 points, or
-1 = fill).

```
cost = 0
if HP pouch not full: cost += addHP > 0 ? addHP : (HPMax - HPCur - 1) / 1000 + 1   // -1 = fill
if MP pouch not full: cost += addMP > 0 ? addMP : (MPMax - MPCur - 1) / 1000 + 1
if IsVip: cost = cost * 8 / 10;  cost = max(cost, 1)
```

Pay, then `cur = min(max, cur + add * 1000)` or `cur = max` for -1; fires tutorial command 2118.
Not enough → `Capital_NOT`. Pouch sizes are in the M2 plan (`9000 + level * 1000`). Client:
`C/UI_RoleUse/UI_RoleUse.as` (`Common_RoleUseBuyContainer`).

## Mysterious Merchant (`MysticShopSystem`)

| File                    | Content                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `MysticNpcTime.ini`     | 15 rows: `npcid=n28001`, `hour` 9:00 … 23:00 (one per hour), `livetime=10` (minutes), `location=1`, `begintime=2010-1-1`, `endtime=2020-1-1` |
| `MysticNpcLocation.ini` | `[1]`: `r=scene,picX,picY,scale`: 2601 (267,711), 2602 (903,627), 2603 (912,908), 2604 (1312,996), 2605 (792,930), scale 100                 |
| `MysticNpcLib.ini`      | `[n28001] Cap2LibNo=1, VipLibNo=2`                                                                                                           |
| `MysticItemLib.ini`     | `[lib]` + `r=item,price,bind,useLevel,maxCnt` (lib 1: 28 rows; lib 2: 17 rows, maxCnt ignored)                                               |
| `MysticCfg.ini`         | `[MysticBuyCnt]` `item=n`: per-player limit per spawn (default 1)                                                                            |

Spawning (`RefreshMysticNpc` 72-108): a 300 s heartbeat on the `WorldCupScene` world cell
(`scene/scene.ini [21]`, `model.ini s1`) checks every row; inside `[begintime, endtime]` and
within 300 s after `hour`, spawn the NPC in a random location of the lib for `livetime` minutes
and broadcast `Mystic_Sysinfo_007`. With `endtime=2020-1-1` the merchant never spawns after 2019;
treat the dates as "always on".

Stock (`OnMysticNpcCreate` 347-388), per spawn:

- Gold tab (lib 1): `price = (int)(price * (1 + soldTotal / maxCnt * 0.1))`, where `soldTotal`
  is the server-wide count sold in earlier spawns (`GetItemNewPrice` 420-437, saved on despawn
  390-418). Remaining stock starts at `maxCnt`.
- VIP tab (lib 2): fixed price, VIP only (`IsVip`), no stock limit.

Lib 1 (Gold): i150078 Demon Proof of Suppression 40 (limit 2, stock 10), i160004 Toad Arcanum 10
(5/20), i160005 Konoha Arcanum 5 (5/50), i160001 Sakura's Special Potion 20 (1/5), i160002
Shizune's Special Potion 50 (1/1), i150302 Lucky Gem 70 unbound (5/50), i159060 Big Wood Release
Talisman 8 (1/10), i161007 Recast Talisman 1, i159057 Lava Stone Necklace 4, i152098-i152101
treasure jars 45-70, i152110 3 Day VIP 30, i100004 Seal Breaker 5, i152028 Advanced Sage
Panacea 100, i150546-i150551 and i150582 gold equipment bags 120-600 (unbound). The last five
rows repeat i161007, i159057, i152098-i152101 with stock 100/300; they are separate rows but
share the per-item purchase limit. `MysticCfg` lists i100005 while the lib sells i100004, so
i100004's limit is the default 1.

Buy (`OnCustomMysticShopBuy` 165-322, custom 491): row exists, stock left (`Mystic_Sysinfo_001`
/ `_002`), level >= `useLevel`, VIP for tab 2; per-player count for this spawn (`MysticBuyRec`,
reset when `MysticBuyCode` != the NPC's despawn time) + amount <= limit (`Mystic_Sysinfo_009`);
items split into stacks with the row's binding; bag check (`Mart_Sysinfo_023`); charge Gold
(always type 2, `Capital_NOT`); decrement stock. Client: `C/UI_MysticShop/*` (Gold and VIP tabs,
3-row paged list, bound/unbound label).

## Mall (`VirtualShopSystem`, premium)

`commerce/virtualshop.ini` (108 sections): `config`, `count` (-1 unlimited, all -1),
`capital2`, `capial3` (sic, the server reads this misspelled key, `VirtualShopSystem.java:191`),
`vipcapital2`, `vipcapital3`. Gold purchases are unbound, Gift Coupon purchases bound
(113-127); the client must echo the exact price (156). Client tables: `DT/virtualshop.s29901.tab`
(257 rows: `Config`, `Price`, `VipPrice`, `PayType`, `SubTabID`, `IsNew`, `IsOnSale`; ids do not
match the 108 server sections) and `DT/supershoptab.s53463.tab` (tabs Hot, Food, Gem, Pet, VIP,
Other). Gold has no in-game source except rewards; recommendation: leave the mall out of M3 and
decide with the premium-currency plan.

## Crystal exchange

`ExchangeMagicBox.ini` (80 sections: `SrcItemCfg` i152010, `CommonSrcItemCfg` i152015,
`SrcCount`, `DestItemCfg`, `DestCount`; client `DT/itemexchange.s26832.tab` with tab layout).
Handler `TollGateSystem.OnCustomExchangeAddMagicBox` (`CloneSceneModule/TollGateSystem.java:1673-1727`):
the player chooses how many of each crystal; the sum must reach `SrcCount`; bag check; no money.
Spec belongs with toll gates.

## Import status

| Data                                                      | Imported                                                     | Suggested file                                      |
| --------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| item `Price`, `CanTrade`, `ItemMaxFoldNum`, `BindingType` | yes (`items.json`)                                           |                                                     |
| BuildNpc rows, placement, town clips                      | yes (`npcs.json`, `scene-npcs.json`, `scene-buildings.json`) |                                                     |
| `npcbox.ini` + `npcboxitem.ini`                           | no                                                           | `npc-shops.json` (box rows + parsed stock)          |
| `refreshcontainer.ini` + `refreshitems.ini`               | no                                                           | `refresh-shops.json`                                |
| `Mystic*.ini` (5 files)                                   | no                                                           | `mystic-shop.json` (times, locations, libs, limits) |
| `sellaskitem.s4673.tab`                                   | no                                                           | `sell-ask-items.json` (client confirm list)         |
| `virtualshop.ini`, `supershoptab`                         | no                                                           | `virtual-shop.json` (only if the mall is in scope)  |
| `ExchangeMagicBox.ini`                                    | no                                                           | `crystal-exchange.json` (toll gate task)            |

## State our port needs

| State                                                                                         | Scope              | Notes                                                  |
| --------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| refresh shop stock (3 shops × up to 10 items: item, prices, property count, appraised, bound) | per character      | plus `last_refresh_at` and free restocks used per shop |
| item instance properties (appraisal, property count)                                          | per inventory item | shared with the blacksmith spec                        |
| Mysterious Merchant spawn (scene, until, remaining stock per row)                             | server-wide        | prices from the server-wide sold count                 |
| Mysterious Merchant purchases per spawn                                                       | per character      | item → count, reset per spawn                          |
| no buy-back list, no purchase limits for the Wholesale shop                                   | -                  |                                                        |

## Language keys

Window tabs `Common_EquipShop` "Item Shop", `Common_BalckShop` "Dark Shop", `Common_MagicShop`
"Mystery Shop", `Common_MediShop` "Wholesale"; descriptions `Common_EquipShop*Des`; NPC menus
`NpcMenu_Equip_Enter`, `NpcMenu_Pharmacy_Enter`, `NpcMenu_BlackShop`, `NpcMenu_Magic_Enter`;
messages `lang_BuyInfo`, `FeedBack_Common_008`, `allbuy_sysinfo_001/002`, `Common_BuyAllOK`,
`Common_RefreshIminRefreshOK`, `Common_SellAskItem`, `Common_SellAskItemType<n>`,
`Common_DelAllOK`, `Mystic_Sysinfo_001..009`, `Common_MysticShop*`, `Common_RoleUseBuyContainer`.
